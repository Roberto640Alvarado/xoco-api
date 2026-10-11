import { Injectable, Logger } from '@nestjs/common';
import { OdooService } from '../../odoo/services/odoo.service.js';
import { fetchAllOdooPages } from '../../common/utils/odoo-pagination.util.js';
import { isWeightUom } from '../../common/utils/product-uom.util.js';
import { toOdooDateTime } from '../../common/utils/store-date.util.js';
import { OdooPosOrderState } from '../../odoo/enums/odoo-pos-order.enum.js';
import { InventoryRepository } from '../repositories/inventory.repository.js';
import { InventoryMovementsRepository } from '../repositories/inventory-movements.repository.js';
import { UpsertInventoryBulkDto } from '../dto/upsert-inventory-bulk.dto.js';
import { InventoryItemDoc, InventorySavedItemDoc } from '../doc/inventory.doc.js';
import { InventoryMovementType, StoreInventoryItem, StoreInventoryMovement } from '../../generated/prisma/index.js';

// Una línea vendida en Odoo desde cierta fecha — ver findUnitsSoldSince.
interface SoldLine {
  productId: number;
  qty: number;
  // Formato naive de Odoo ("YYYY-MM-DD HH:mm:ss", siempre UTC) — se
  // compara como STRING contra el mismo formato (ver estimateQuantity),
  // nunca se parsea a Date, porque así ordena igual que Odoo sin
  // depender de que el runtime entienda el formato naive.
  dateOrder: string;
}

// Primer tramo del módulo Inventario (ver plan-history): inventario
// INICIAL por tienda, capturado a mano por Finanzas. Vive enteramente en
// nuestra base — el API key de Odoo es de solo lectura, así que no hay
// forma de escribir esto en Odoo como pide el diagrama del negocio ("CARGA
// EN ODOO COMO INVENTARIO INICIAL"). `estimatedQuantity` ya descuenta
// ventas (desde Odoo) y mermas/regalías/degustaciones CONFIRMADAS, y ya
// SUMA las entradas (envíos planta→tienda) CONFIRMADAS — todo desde
// InventoryMovementsRepository (segundo y tercer tramo). La única pieza
// del diagrama que vive fuera de nuestra base son los reportes Kardex/
// Existencias, que se consultan directo en Odoo.
@Injectable()
export class InventoryService {
  private readonly logger = new Logger(InventoryService.name);

  constructor(
    private readonly inventoryRepository: InventoryRepository,
    private readonly inventoryMovementsRepository: InventoryMovementsRepository,
    private readonly odooService: OdooService,
  ) {}

  // Todo lo vendido (pos.order.line, vía sus pos.order de esta tienda)
  // desde `sinceDate` en adelante — la mitad confiable del estimado de
  // Inventario (a diferencia de stock.quant, esto SÍ coincide con la
  // realidad, ver plan-history 2026-10-02). Se excluyen las órdenes
  // canceladas (mismo criterio que SalesService). Se trae UNA vez desde
  // la fecha más antigua entre los productos ya contados de la tienda —
  // findItemsForStore filtra por producto en memoria contra el propio
  // `updatedAt` de cada uno, en vez de pedir esto producto por producto.
  private async findUnitsSoldSince(posConfigId: number, sinceDate: Date): Promise<SoldLine[]> {
    const orders = await fetchAllOdooPages(
      (options) => this.odooService.findPosOrders(options),
      [
        ['config_id', '=', posConfigId],
        ['date_order', '>=', toOdooDateTime(sinceDate.getTime())],
        ['state', '!=', OdooPosOrderState.CANCEL],
      ],
      'InventoryService.findUnitsSoldSince (órdenes)',
      this.logger,
    );
    if (orders.length === 0) return [];

    const dateOrderByOrderId = new Map(orders.map((order) => [order.id, order.date_order]));
    const lines = await fetchAllOdooPages(
      (options) => this.odooService.findPosOrderLines(options),
      [['order_id', 'in', orders.map((order) => order.id)]],
      'InventoryService.findUnitsSoldSince (líneas)',
      this.logger,
    );

    const soldLines: SoldLine[] = [];
    for (const line of lines) {
      if (!line.product_id || !line.order_id) continue;
      soldLines.push({
        productId: line.product_id[0],
        qty: line.qty,
        dateOrder: dateOrderByOrderId.get(line.order_id[0]) ?? '',
      });
    }
    return soldLines;
  }

  // `saved.quantity` (lo que se contó físicamente) menos lo vendido desde
  // ESE conteo en particular, menos las mermas/regalías/degustaciones ya
  // CONFIRMADAS desde esa misma fecha, MÁS las entradas (envíos
  // planta→tienda) ya CONFIRMADAS desde esa misma fecha (ver
  // InventoryMovementsRepository.findConfirmedSince) — null si el
  // producto nunca se ha contado. ENTRADA es el único tipo que suma en
  // vez de restar (ver movedSinceThisCount abajo); usa
  // `receivedQuantity` (lo que el Vendedor confirmó recibir) cuando
  // existe, y si no (una ENTRADA que Admin/Finanzas registró directo,
  // sin pasar por el paso de recepción) cae en `quantity`.
  private estimateQuantity(
    saved: StoreInventoryItem | undefined,
    soldLinesByProduct: Map<number, SoldLine[]>,
    movementsByProduct: Map<number, StoreInventoryMovement[]>,
  ): number | null {
    if (!saved) return null;
    const sinceThisCount = toOdooDateTime(saved.updatedAt.getTime());
    const soldSinceThisCount = (soldLinesByProduct.get(saved.productId) ?? [])
      .filter((line) => line.dateOrder >= sinceThisCount)
      .reduce((sum, line) => sum + line.qty, 0);
    const movedSinceThisCount = (movementsByProduct.get(saved.productId) ?? [])
      .filter((movement) => movement.occurredAt >= saved.updatedAt)
      .reduce((sum, movement) => {
        const amount = movement.receivedQuantity ?? movement.quantity;
        return movement.type === InventoryMovementType.ENTRADA ? sum - amount : sum + amount;
      }, 0);
    return saved.quantity - soldSinceThisCount - movedSinceThisCount;
  }

  // Catálogo completo de Odoo (activo) cruzado con lo ya capturado en
  // Mongo para esta tienda. La existencia de Odoo (stock.quant) NO se usa:
  // Odoo solo ve las ventas del POS, nunca las entradas ni los ajustes, así
  // que sus cantidades quedan negativas y no sirven ni de referencia. Se
  // trae TODO el catálogo, sin importar si el producto ya tiene cantidad
  // guardada o no, para que Finanzas vea de una vez qué falta por contar.
  async findItemsForStore(posConfigId: number): Promise<InventoryItemDoc[]> {
    const [products, savedItems] = await Promise.all([
      fetchAllOdooPages(
        (options) => this.odooService.findProducts(options),
        [],
        'InventoryService.findItemsForStore (productos)',
        this.logger,
      ),
      this.inventoryRepository.findManyForStore(posConfigId),
    ]);

    const savedByProductId = new Map(savedItems.map((item) => [item.productId, item]));

    // Una sola consulta de ventas desde el conteo MÁS ANTIGUO de la
    // tienda — cada producto filtra de ahí lo que le corresponde según
    // su propio `updatedAt` en estimateQuantity.
    const earliestCountedAt = savedItems.length
      ? new Date(Math.min(...savedItems.map((item) => item.updatedAt.getTime())))
      : null;
    const [soldLines, confirmedMovements] = await Promise.all([
      earliestCountedAt ? this.findUnitsSoldSince(posConfigId, earliestCountedAt) : Promise.resolve([]),
      earliestCountedAt
        ? this.inventoryMovementsRepository.findConfirmedSince(posConfigId, earliestCountedAt)
        : Promise.resolve([]),
    ]);
    const soldLinesByProduct = new Map<number, SoldLine[]>();
    for (const line of soldLines) {
      const list = soldLinesByProduct.get(line.productId) ?? [];
      list.push(line);
      soldLinesByProduct.set(line.productId, list);
    }
    const movementsByProduct = new Map<number, StoreInventoryMovement[]>();
    for (const movement of confirmedMovements) {
      const list = movementsByProduct.get(movement.productId) ?? [];
      list.push(movement);
      movementsByProduct.set(movement.productId, list);
    }

    return products
      .map((product): InventoryItemDoc => {
        const saved = savedByProductId.get(product.id);
        return {
          productId: product.id,
          productName: product.display_name,
          unit: isWeightUom(product.uom_id) ? 'kg' : 'unidad',
          quantity: saved ? saved.quantity : null,
          estimatedQuantity: this.estimateQuantity(saved, soldLinesByProduct, movementsByProduct),
          updatedAt: saved ? saved.updatedAt : null,
          updatedByEmail: saved ? saved.updatedByEmail : null,
        };
      })
      .sort((a, b) => a.productName.localeCompare(b.productName));
  }

  async upsertBulk(
    posConfigId: number,
    dto: UpsertInventoryBulkDto,
    updatedByEmail: string,
  ): Promise<InventorySavedItemDoc[]> {
    // Cantidad que había guardada justo antes — para el historial de
    // conteos (Registro de entradas y salidas).
    const previous = new Map(
      (await this.inventoryRepository.findManyForStore(posConfigId)).map((item) => [item.productId, item.quantity]),
    );
    const saved = await this.inventoryRepository.upsertMany(
      dto.entries.map((entry) => ({
        posConfigId,
        productId: entry.productId,
        quantity: entry.quantity,
        updatedByEmail,
      })),
    );

    await this.inventoryRepository.createCountLogs(
      dto.entries.map((entry) => ({
        posConfigId,
        productId: entry.productId,
        quantity: entry.quantity,
        previousQuantity: previous.get(entry.productId) ?? null,
        countedByEmail: updatedByEmail,
      })),
    );

    return saved.map((item) => ({
      id: item.id,
      posConfigId: item.posConfigId,
      productId: item.productId,
      quantity: item.quantity,
      updatedAt: item.updatedAt,
      updatedByEmail: item.updatedByEmail,
    }));
  }
}
