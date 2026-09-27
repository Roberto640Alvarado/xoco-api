import { ApiProperty } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { ArrayMinSize, IsArray, IsInt, IsNumber, Min, ValidateNested } from 'class-validator';

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
}
