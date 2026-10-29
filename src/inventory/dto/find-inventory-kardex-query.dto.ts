import { PickType } from '@nestjs/swagger';
import { FindInventoryLedgerQueryDto } from './find-inventory-ledger-query.dto.js';

// Mismo rango (días locales de la tienda) y filtro de producto que el
// Registro; el Kardex no filtra por tipo porque necesita todos para el saldo.
export class FindInventoryKardexQueryDto extends PickType(FindInventoryLedgerQueryDto, ['dateFrom', 'dateTo', 'productId'] as const) {}
