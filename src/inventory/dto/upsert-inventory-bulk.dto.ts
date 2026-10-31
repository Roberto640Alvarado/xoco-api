import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { ArrayMinSize, IsArray, IsDateString, IsInt, IsNumber, IsOptional, Min, ValidateNested } from 'class-validator';

class InventoryItemEntryDto {
  @ApiProperty({ description: 'id de product.product en Odoo, tal como lo devuelve GET .../items.' })
  @IsInt()
  @Min(1)
  productId: number;

  @ApiProperty({
    example: 42,
    description: 'Cantidad física contada, en la unidad propia del producto (pieza o Kg — ver InventoryItemDoc.unit).',
  })
  @IsNumber()
  @Min(0)
  quantity: number;
}

export class UpsertInventoryBulkDto {
  @ApiProperty({
    type: [InventoryItemEntryDto],
    description:
      'Una entrada por cada producto cuya cantidad se está guardando — no hace falta mandar el catálogo completo, solo lo que el usuario cambió en esta sesión de captura.',
  })
  @IsArray()
  @ArrayMinSize(1)
  @ValidateNested({ each: true })
  @Type(() => InventoryItemEntryDto)
  entries: InventoryItemEntryDto[];

  @ApiPropertyOptional({
    example: '2026-10-30T13:00:00.000Z',
    description:
      'Cuándo se hizo el conteo físico (ISO). Las ventas y movimientos desde esa hora se restan/suman al conteo. ' +
      'Sin valor = ahora. No puede ser futuro ni de hace más de 7 días.',
  })
  @IsOptional()
  @IsDateString({}, { message: 'La hora del conteo no es válida.' })
  countedAt?: string;
}
