import { Injectable, Logger } from '@nestjs/common';
import { OdooService } from '../../odoo/services/odoo.service.js';
import { fetchAllOdooPages } from '../../common/utils/odoo-pagination.util.js';
import { isWeightUom } from '../../common/utils/product-uom.util.js';
import { InventoryRepository } from '../repositories/inventory.repository.js';
import { UpsertInventoryBulkDto } from '../dto/upsert-inventory-bulk.dto.js';
import { InventoryItemDoc, InventorySavedItemDoc } from '../doc/inventory.doc.js';

// Primer tramo del módulo Inventario (ver plan-history): inventario
// INICIAL por tienda, capturado a mano por Finanzas. Vive enteramente en
// nuestra base — el API key de Odoo es de solo lectura, así que no hay
// forma de escribir esto en Odoo como pide el diagrama del negocio ("CARGA
// EN ODOO COMO INVENTARIO INICIAL"). Movimientos posteriores (ventas,
// mermas, regalías, envíos planta→tienda) quedan para tramos futuros —
// por ahora esto solo guarda y muestra el conteo físico actual, con la
// existencia de Odoo (stock.quant) como referencia/punto de partida.
@Injectable()
export class InventoryService {
  private readonly logger = new Logger(InventoryService.name);

  constructor(
    private readonly inventoryRepository: InventoryRepository,
    private readonly odooService: OdooService,
  ) {}

  // Bodega (stock.warehouse) asociada al pos.config de esta tienda, o
  // null si no tiene una asignada — un pos.config sin warehouse_id, o sin
  // registro de stock.warehouse encontrado, simplemente no tiene
  // existencia de Odoo que sugerir (no es un error).
  private async findStockLocationId(posConfigId: number): Promise<number | null> {
    const posConfigs = await this.odooService.findPosConfigs({
      domain: [['id', '=', posConfigId]],
      limit: 1,
    });
    const posConfig = posConfigs[0];
    if (!posConfig?.warehouse_id) return null;

    const warehouses = await this.odooService.findWarehouses({
      domain: [['id', '=', posConfig.warehouse_id[0]]],
      limit: 1,
    });
    const warehouse = warehouses[0];
    if (!warehouse?.lot_stock_id) return null;

    return warehouse.lot_stock_id[0];
  }

  // Suma de existencia (on hand) por producto, para TODAS las
  // ubicaciones dentro de la bodega de esta tienda (child_of la ubicación
  // raíz "Stock" de esa bodega) — así no se pierden sub-ubicaciones
  // (estantes, zonas) que Odoo pueda tener bajo la bodega.
  private async findOdooQuantitiesByProduct(stockLocationId: number): Promise<Map<number, number>> {
    const quants = await fetchAllOdooPages(
      (options) => this.odooService.findStockQuants(options),
      [['location_id', 'child_of', stockLocationId]],
      'InventoryService.findOdooQuantitiesByProduct (stock.quant)',
      this.logger,
    );

    const byProductId = new Map<number, number>();
    for (const quant of quants) {
      if (!quant.product_id) continue;
      const [productId] = quant.product_id;
      byProductId.set(productId, (byProductId.get(productId) ?? 0) + quant.quantity);
    }
    return byProductId;
  }

  // Catálogo completo de Odoo (activo) cruzado con lo ya capturado en
  // Mongo para esta tienda, más la existencia de Odoo como referencia. Se
  // trae TODO el catálogo, sin importar si el producto ya tiene cantidad
  // guardada o no, para que Finanzas vea de una vez qué falta por contar.
  async findItemsForStore(posConfigId: number): Promise<InventoryItemDoc[]> {
    const [products, savedItems, stockLocationId] = await Promise.all([
      fetchAllOdooPages(
        (options) => this.odooService.findProducts(options),
        [],
        'InventoryService.findItemsForStore (productos)',
        this.logger,
      ),
      this.inventoryRepository.findManyForStore(posConfigId),
      this.findStockLocationId(posConfigId),
    ]);

    const odooQuantitiesByProduct = stockLocationId
      ? await this.findOdooQuantitiesByProduct(stockLocationId)
      : new Map<number, number>();

    const savedByProductId = new Map(savedItems.map((item) => [item.productId, item]));

    return products
      .map((product): InventoryItemDoc => {
        const saved = savedByProductId.get(product.id);
        return {
          productId: product.id,
          productName: product.display_name,
          unit: isWeightUom(product.uom_id) ? 'kg' : 'unidad',
          quantity: saved ? saved.quantity : null,
          odooQuantity: odooQuantitiesByProduct.get(product.id) ?? null,
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
    const saved = await this.inventoryRepository.upsertMany(
      dto.entries.map((entry) => ({
        posConfigId,
        productId: entry.productId,
        quantity: entry.quantity,
        updatedByEmail,
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
