import { IsDateString, IsEnum, IsInt, IsOptional } from 'class-validator';
import { Type } from 'class-transformer';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { InventoryLedgerEntryType } from '../doc/inventory-ledger.doc.js';

export class FindInventoryLedgerQueryDto {
  @ApiProperty({ example: '2026-10-01', description: 'Fecha inicial (incluida), día local de la tienda, YYYY-MM-DD.' })
  @IsDateString()
  dateFrom!: string;

  @ApiProperty({ example: '2026-10-11', description: 'Fecha final (incluida), día local de la tienda, YYYY-MM-DD.' })
  @IsDateString()
  dateTo!: string;

  @ApiPropertyOptional({ description: 'Solo este producto (id de product.product en Odoo).' })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  productId?: number;

  @ApiPropertyOptional({ enum: InventoryLedgerEntryType, description: 'Solo este tipo de registro.' })
  @IsOptional()
  @IsEnum(InventoryLedgerEntryType)
  type?: InventoryLedgerEntryType;
}
