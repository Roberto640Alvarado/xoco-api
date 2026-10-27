import { ApiProperty } from '@nestjs/swagger';
import { IsIn, IsInt, IsNumber, IsOptional, IsString, Min, MinLength } from 'class-validator';
import { InventoryMovementType } from '../../generated/prisma/index.js';

// Solo salidas: ENTRADA nace al recibir una solicitud de stock.
export const MANUAL_MOVEMENT_TYPES = [
  InventoryMovementType.MERMA,
  InventoryMovementType.REGALIA,
  InventoryMovementType.DEGUSTACION,
];

export class CreateInventoryMovementDto {
  @ApiProperty({ description: 'id de product.product en Odoo, tal como lo devuelve GET .../items.' })
  @IsInt()
  @Min(1)
  productId: number;

  @ApiProperty({
    enum: MANUAL_MOVEMENT_TYPES,
    description: 'Motivo de la salida. Las entradas ya no se registran a mano: llegan con una solicitud recibida.',
  })
  @IsIn(MANUAL_MOVEMENT_TYPES, { message: 'El tipo debe ser MERMA, REGALIA o DEGUSTACION.' })
  type: InventoryMovementType;

  @ApiProperty({ example: 2, description: 'Unidades que salen del inventario (siempre positivo).' })
  @IsNumber()
  @Min(0.01)
  quantity: number;

  @ApiProperty({ required: false, description: 'Detalle opcional (ej. a qué cliente, por qué se dañó).' })
  @IsOptional()
  @IsString()
  @MinLength(1)
  note?: string;
}
