import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  ArrayMaxSize,
  ArrayMinSize,
  IsArray,
  IsInt,
  IsNumber,
  IsOptional,
  IsString,
  Max,
  MaxLength,
  Min,
  ValidateNested,
} from 'class-validator';

export const MAX_REQUEST_LINES = 300;
export const MAX_LINE_QUANTITY = 100_000;

export class StockRequestLineInputDto {
  @ApiProperty({ description: 'id de product.product en Odoo, tal como lo devuelve GET /inventory/requests/catalog.' })
  @IsInt()
  @Min(1)
  productId: number;

  @ApiProperty({ example: 12, description: 'Cantidad que pide la tienda (piezas enteras, o kg para producto a granel).' })
  @IsNumber()
  @Min(0.01, { message: 'La cantidad debe ser mayor a 0.' })
  @Max(MAX_LINE_QUANTITY)
  quantity: number;
}

export class CreateStockRequestDto {
  @ApiPropertyOptional({ description: 'Nota general para planta (ej. "urgente para el fin de semana").' })
  @IsOptional()
  @IsString()
  @MaxLength(500)
  note?: string;

  @ApiProperty({ type: [StockRequestLineInputDto], description: 'Productos que se piden, uno por línea (sin repetir).' })
  @IsArray()
  @ArrayMinSize(1, { message: 'Agrega al menos un producto a la solicitud.' })
  @ArrayMaxSize(MAX_REQUEST_LINES)
  @ValidateNested({ each: true })
  @Type(() => StockRequestLineInputDto)
  lines: StockRequestLineInputDto[];
}
