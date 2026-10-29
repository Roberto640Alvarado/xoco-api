import { Injectable, Logger } from '@nestjs/common';
import { OdooService } from '../../odoo/services/odoo.service.js';
import { fetchAllOdooPages } from '../../common/utils/odoo-pagination.util.js';
import { isWeightUom } from '../../common/utils/product-uom.util.js';
import { productCategoryName } from '../../common/utils/product-category.util.js';
import { storeDayRangeToUtc, toOdooDateTime, toStoreDate } from '../../common/utils/store-date.util.js';
import { InventoryMovementType } from '../../generated/prisma/index.js';
import { InventoryRepository } from '../repositories/inventory.repository.js';
import { InventoryMovementsRepository } from '../repositories/inventory-movements.repository.js';
import { InventoryLedgerService } from './inventory-ledger.service.js';
import { FindInventoryKardexQueryDto } from '../dto/find-inventory-kardex-query.dto.js';
import { InventoryKardexDoc, InventoryKardexProductDoc } from '../doc/inventory-kardex.doc.js';
import { InventoryLedgerEntryType } from '../doc/inventory-ledger.doc.js';
import { KardexEvent, buildProductKardex } from '../utils/kardex.util.js';

// "2026-10-11 15:04:31" (UTC naive) -> Date.
function fromOdooDateTime(odooDateTime: string): Date {
  return new Date(`${odooDateTime.replace(' ', 'T')}Z`);
}

// Un conteo guardado en StoreInventoryItem que no tenga su fila en el
// historial (conteos anteriores a que existiera el historial) se toma como
// conteo de partida. Si el historial ya lo tiene (misma hora, ± unos
// segundos), no se repite.
const SAME_COUNT_TOLERANCE_MS = 5_000;

// Kardex de inventario por tienda (ver InventoryKardexDoc). Junta, por
// producto, los conteos físicos (historial + el conteo vigente), las ventas
// de Odoo y los movimientos CONFIRMADOS, y deja el cálculo del saldo a
// buildProductKardex (puro, probado aparte).
@Injectable()
export class InventoryKardexService {
  private readonly logger = new Logger(InventoryKardexService.name);

  constructor(
    private readonly inventoryRepository: InventoryRepository,
    private readonly movementsRepository: InventoryMovementsRepository,
    private readonly ledgerService: InventoryLedgerService,
    private readonly odooService: OdooService,
  ) {}

  async findKardex(posConfigId: number, query: FindInventoryKardexQueryDto): Promise<InventoryKardexDoc> {
    const { utcFrom, utcTo } = storeDayRangeToUtc(query.dateFrom, query.dateTo);
    const from = fromOdooDateTime(utcFrom);
    const to = fromOdooDateTime(utcTo);
    const onlyProduct = (productId: number) => !query.productId || productId === query.productId;

    const [products, stores, countLogs, items] = await Promise.all([
      fetchAllOdooPages(
        (options) => this.odooService.findProducts(options),
        [],
        'InventoryKardexService.findKardex (productos)',
        this.logger,
      ),
      this.odooService.findPosConfigs({ domain: [['id', '=', posConfigId]] }),
      this.inventoryRepository.findCountLogs(posConfigId, new Date(0), to, query.productId),
      this.inventoryRepository.findManyForStore(posConfigId),
    ]);

    // Conteos de partida por producto.
    const events = new Map<number, KardexEvent[]>();
    const push = (productId: number, event: KardexEvent) => {
      if (!onlyProduct(productId)) return;
      const list = events.get(productId) ?? [];
      list.push(event);
      events.set(productId, list);
    };
    for (const log of countLogs) {
      push(log.productId, {
        direction: 'COUNT',
        type: InventoryLedgerEntryType.CONTEO,
        at: log.countedAt,
        quantity: log.quantity,
        reference: null,
        registeredBy: log.countedByEmail,
      });
    }
    for (const item of items) {
      if (item.updatedAt.getTime() > to.getTime()) continue;
      const logged = (events.get(item.productId) ?? []).some(
        (event) => Math.abs(event.at.getTime() - item.updatedAt.getTime()) <= SAME_COUNT_TOLERANCE_MS,
      );
      if (logged) continue;
      push(item.productId, {
        direction: 'COUNT',
        type: InventoryLedgerEntryType.CONTEO,
        at: item.updatedAt,
        quantity: item.quantity,
        reference: null,
        registeredBy: item.updatedByEmail,
      });
    }

    // Ventas y movimientos se traen UNA vez desde el conteo de partida más
    // antiguo que se necesita (el último antes del período de cada producto).
    let start = from.getTime();
    for (const list of events.values()) {
      const before = list.filter((event) => event.at.getTime() < from.getTime());
      if (before.length > 0) start = Math.min(start, Math.max(...before.map((event) => event.at.getTime())));
    }

    const [sales, movements] = await Promise.all([
      this.ledgerService.findSales(posConfigId, toOdooDateTime(start), utcTo, query.productId),
      this.movementsRepository.findConfirmedSince(posConfigId, new Date(start)),
    ]);
    for (const sale of sales) {
      push(sale.productId, {
        direction: 'OUT',
        type: InventoryLedgerEntryType.VENTA,
        at: sale.occurredAt,
        quantity: sale.quantity,
        reference: sale.detail,
        registeredBy: null,
      });
    }
    for (const movement of movements) {
      if (movement.occurredAt.getTime() > to.getTime()) continue;
      push(movement.productId, {
        direction: movement.type === InventoryMovementType.ENTRADA ? 'IN' : 'OUT',
        type: InventoryLedgerEntryType[movement.type],
        at: movement.occurredAt,
        quantity: movement.receivedQuantity ?? movement.quantity,
        reference: movement.note,
        registeredBy: movement.registeredByEmail,
      });
    }

    const storeDate = (at: Date) => toStoreDate(toOdooDateTime(at.getTime()));
    const productById = new Map(products.map((product) => [product.id, product]));
    const result: InventoryKardexProductDoc[] = [];
    for (const [productId, list] of events) {
      const kardex = buildProductKardex(list, from, to, storeDate);
      if (kardex.openingBalance === null && kardex.rows.length === 0) continue;
      const product = productById.get(productId);
      result.push({
        productId,
        productName: product?.display_name ?? 'Producto no encontrado en Odoo',
        categoryName: product ? productCategoryName(product.categ_id) : 'Sin categoría',
        unit: product && isWeightUom(product.uom_id) ? 'kg' : 'unidad',
        ...kardex,
      });
    }
    result.sort(
      (a, b) => a.categoryName.localeCompare(b.categoryName, 'es') || a.productName.localeCompare(b.productName, 'es'),
    );

    return {
      posConfigId,
      storeName: stores[0]?.name ?? `Tienda ${posConfigId}`,
      dateFrom: query.dateFrom.slice(0, 10),
      dateTo: query.dateTo.slice(0, 10),
      generatedAt: new Date(),
      products: result,
    };
  }
}
