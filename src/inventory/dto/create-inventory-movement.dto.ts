import { ApiProperty } from '@nestjs/swagger';
import { IsEnum, IsInt, IsNumber, IsOptional, IsString, Min, MinLength } from 'class-validator';
import { InventoryMovementType } from '../../generated/prisma/index.js';

export class CreateInventoryMovementDto {
  @ApiProperty({ description: 'id de product.product en Odoo, tal como lo devuelve GET .../items.' })
  @IsInt()
  @Min(1)
  productId: number;

  @ApiProperty({ enum: InventoryMovementType, description: 'Motivo de la salida.' })
  @IsEnum(InventoryMovementType)
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
