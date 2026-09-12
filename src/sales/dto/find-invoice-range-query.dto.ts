import { IsDateString, IsOptional } from 'class-validator';
import { ApiPropertyOptional } from '@nestjs/swagger';

// Rango de fechas de los reportes basados en FACTURAS — lo comparten
// /sales/by-salesperson y /sales/by-store (ver CLAUDE.md, "Nunca
// duplicar DTOs"). No lleva `posConfigId`: una factura no tiene tienda,
// se le atribuye una (ver StoreInvoiceTotalsService).
export class FindInvoiceRangeQueryDto {
  @ApiPropertyOptional({
    example: '2026-07-01',
    description:
      'Fecha inicial (incluida), formato YYYY-MM-DD. Filtra por la fecha de la FACTURA (invoice_date de Odoo), ' +
      'que es un campo de fecha sin hora — no necesita conversión de zona horaria como las órdenes de POS.',
  })
  @IsDateString()
  dateFrom!: string;

  @ApiPropertyOptional({
    example: '2026-07-31',
    description: 'Fecha final (incluida). Si se omite, se usa el mismo valor que dateFrom.',
  })
  @IsOptional()
  @IsDateString()
  dateTo?: string;
}
