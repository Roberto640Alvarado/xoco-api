import { Injectable, Logger } from '@nestjs/common';
import { OdooService } from '../../odoo/services/odoo.service.js';
import { fetchAllOdooPages } from '../../common/utils/odoo-pagination.util.js';
import { storeDayRangeToUtc } from '../../common/utils/store-date.util.js';
import { OdooPosOrderState } from '../../odoo/enums/odoo-pos-order.enum.js';
import { InventoryRepository } from '../repositories/inventory.repository.js';
import { InventoryMovementsRepository } from '../repositories/inventory-movements.repository.js';
import { FindInventoryLedgerQueryDto } from '../dto/find-inventory-ledger-query.dto.js';
import { InventoryLedgerEntryDoc, InventoryLedgerEntryType } from '../doc/inventory-ledger.doc.js';
import { InventoryMovementType } from '../../generated/prisma/index.js';

// "2026-10-11 15:04:31" (UTC naive de Odoo) -> Date.
function fromOdooDateTime(odooDateTime: string): Date {
  return new Date(`${odooDateTime.replace(' ', 'T')}Z`);
}

// Registro de entradas y salidas por tienda: una sola línea de tiempo con
// las ventas (Odoo, una línea por producto vendido), los movimientos
// manuales (merma/regalía/degustación/entrada) y los conteos físicos, cada
// uno con su fecha y hora exactas. No calcula saldos — eso vive en
// InventoryService.estimateQuantity.
@Injectable()
export class InventoryLedgerService {
  private readonly logger = new Logger(InventoryLedgerService.name);

  constructor(
    private readonly inventoryRepository: InventoryRepository,
    private readonly inventoryMovementsRepository: InventoryMovementsRepository,
    private readonly odooService: OdooService,
  ) {}

  // Pública: el Kardex (InventoryKardexService) usa las mismas ventas,
  // una línea por producto vendido, con la hora exacta de la orden.
  async findSales(
    posConfigId: number,
    utcFrom: string,
    utcTo: string,
    productId?: number,
  ): Promise<InventoryLedgerEntryDoc[]> {
    const orders = await fetchAllOdooPages(
      (options) => this.odooService.findPosOrders(options),
      [
        ['config_id', '=', posConfigId],
        ['date_order', '>=', utcFrom],
        ['date_order', '<=', utcTo],
        ['state', '!=', OdooPosOrderState.CANCEL],
      ],
      'InventoryLedgerService.findSales (órdenes)',
      this.logger,
    );
    if (orders.length === 0) return [];

    const orderById = new Map(orders.map((order) => [order.id, order]));
    const lines = await fetchAllOdooPages(
      (options) => this.odooService.findPosOrderLines(options),
      [
        ['order_id', 'in', orders.map((order) => order.id)],
        ...(productId ? [['product_id', '=', productId]] : []),
      ],
      'InventoryLedgerService.findSales (líneas)',
      this.logger,
    );

    const entries: InventoryLedgerEntryDoc[] = [];
    for (const line of lines) {
      const order = line.order_id ? orderById.get(line.order_id[0]) : undefined;
      if (!order || !line.product_id) continue;
      entries.push({
        id: `sale-${line.id}`,
        occurredAt: fromOdooDateTime(order.date_order),
        type: InventoryLedgerEntryType.VENTA,
        direction: 'OUT',
        productId: line.product_id[0],
        productName: line.product_id[1],
        quantity: line.qty,
        status: null,
        detail: order.name,
        registeredBy: null,
      });
    }
    return entries;
  }

  async findLedger(posConfigId: number, query: FindInventoryLedgerQueryDto): Promise<InventoryLedgerEntryDoc[]> {
    const { utcFrom, utcTo } = storeDayRangeToUtc(query.dateFrom, query.dateTo);
    const from = fromOdooDateTime(utcFrom);
    const to = fromOdooDateTime(utcTo);
    const wants = (type: InventoryLedgerEntryType) => !query.type || query.type === type;
    const wantsMovements = Object.values(InventoryMovementType).some((type) => wants(InventoryLedgerEntryType[type]));

    const [sales, movements, counts] = await Promise.all([
      wants(InventoryLedgerEntryType.VENTA)
        ? this.findSales(posConfigId, utcFrom, utcTo, query.productId)
        : Promise.resolve([]),
      wantsMovements
        ? this.inventoryMovementsRepository.findForLedger(posConfigId, from, to, query.productId)
        : Promise.resolve([]),
      wants(InventoryLedgerEntryType.CONTEO)
        ? this.inventoryRepository.findCountLogs(posConfigId, from, to, query.productId)
        : Promise.resolve([]),
    ]);

    // Nombres de los productos de movimientos/conteos en UNA llamada a
    // Odoo (las ventas ya traen el nombre en la línea).
    const idsToName = Array.from(
      new Set([...movements.map((m) => m.productId), ...counts.map((c) => c.productId)]),
    );
    const products = idsToName.length
      ? await this.odooService.findProducts({ domain: [['id', 'in', idsToName]] })
      : [];
    const nameById = new Map(products.map((product) => [product.id, product.display_name]));
    const nameOf = (productId: number) => nameById.get(productId) ?? 'Producto no encontrado en Odoo';

    const movementEntries: InventoryLedgerEntryDoc[] = movements
      .filter((movement) => wants(InventoryLedgerEntryType[movement.type]))
      .map((movement) => ({
        id: `movement-${movement.id}`,
        occurredAt: movement.occurredAt,
        type: InventoryLedgerEntryType[movement.type],
        direction: movement.type === InventoryMovementType.ENTRADA ? ('IN' as const) : ('OUT' as const),
        productId: movement.productId,
        productName: nameOf(movement.productId),
        quantity: movement.receivedQuantity ?? movement.quantity,
        status: movement.status,
        detail: movement.note,
        registeredBy: movement.registeredByEmail,
      }));

    const countEntries: InventoryLedgerEntryDoc[] = counts.map((count) => ({
      id: `count-${count.id}`,
      occurredAt: count.countedAt,
      type: InventoryLedgerEntryType.CONTEO,
      direction: 'COUNT' as const,
      productId: count.productId,
      productName: nameOf(count.productId),
      quantity: count.quantity,
      status: null,
      detail: count.previousQuantity == null ? 'Primer conteo' : `Antes: ${count.previousQuantity}`,
      registeredBy: count.countedByEmail,
    }));

    return [...sales, ...movementEntries, ...countEntries].sort(
      (a, b) => b.occurredAt.getTime() - a.occurredAt.getTime(),
    );
  }
}
