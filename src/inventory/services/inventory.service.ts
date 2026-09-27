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
// por ahora esto solo guarda y muestra el conteo físico actual.
@Injectable()
export class InventoryService {
  private readonly logger = new Logger(InventoryService.name);

  constructor(
    private readonly inventoryRepository: InventoryRepository,
    private readonly odooService: OdooService,
  ) {}

  // Catálogo completo de Odoo (activo) cruzado con lo ya capturado en
  // Mongo para esta tienda. Se trae TODO el catálogo, sin importar si el
  // producto ya tiene cantidad guardada o no, para que Finanzas vea de
  // una vez qué falta por contar.
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

    return products
      .map((product): InventoryItemDoc => {
        const saved = savedByProductId.get(product.id);
        return {
          productId: product.id,
          productName: product.display_name,
          unit: isWeightUom(product.uom_id) ? 'kg' : 'unidad',
          quantity: saved ? saved.quantity : null,
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
