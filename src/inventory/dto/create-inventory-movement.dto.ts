import { ApiProperty } from '@nestjs/swagger';
import { IsIn, IsInt, IsNumber, IsOptional, IsString, Min, MinLength } from 'class-validator';
import { InventoryMovementType } from '../../generated/prisma/index.js';

// Salidas (MERMA/REGALIA/DEGUSTACION) y ENTRADA manual: mercadería que
// llega sin pasar por una solicitud (ej. la traen de planta a mano o de
// un proveedor). Las ENTRADA de solicitudes nacen solas al recibirlas.
export const MANUAL_MOVEMENT_TYPES = [
  InventoryMovementType.ENTRADA,
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
    description: 'ENTRADA suma al inventario (mercadería que llegó sin solicitud); MERMA, REGALIA y DEGUSTACION restan.',
  })
  @IsIn(MANUAL_MOVEMENT_TYPES, { message: 'El tipo debe ser ENTRADA, MERMA, REGALIA o DEGUSTACION.' })
  type: InventoryMovementType;

  @ApiProperty({ example: 2, description: 'Unidades que entran o salen del inventario (siempre positivo).' })
  @IsNumber()
  @Min(0.01)
  quantity: number;

  @ApiProperty({ required: false, description: 'Detalle opcional (ej. de dónde vino, a qué cliente, por qué se dañó).' })
  @IsOptional()
  @IsString()
  @MinLength(1)
  note?: string;
}
