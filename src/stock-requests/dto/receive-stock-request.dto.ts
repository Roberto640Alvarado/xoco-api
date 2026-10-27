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
import { MAX_LINE_QUANTITY, MAX_REQUEST_LINES } from './create-stock-request.dto.js';

export class ReceivedLineInputDto {
  @ApiProperty({ description: 'id de product.product en Odoo.' })
  @IsInt()
  @Min(1)
  productId: number;

  @ApiProperty({ example: 10, description: 'Lo que de verdad llegó a la tienda (0 si no llegó).' })
  @IsNumber()
  @Min(0)
  @Max(MAX_LINE_QUANTITY)
  receivedQuantity: number;

  @ApiPropertyOptional({
    description: 'Observación. Obligatoria cuando lo recibido no coincide con lo enviado.',
  })
  @IsOptional()
  @IsString()
  @MaxLength(200)
  note?: string;
}

export class ReceiveStockRequestDto {
  @ApiProperty({ type: [ReceivedLineInputDto], description: 'Una entrada por cada producto que planta envió.' })
  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(MAX_REQUEST_LINES)
  @ValidateNested({ each: true })
  @Type(() => ReceivedLineInputDto)
  lines: ReceivedLineInputDto[];

  @ApiPropertyOptional({ description: 'Nota general al confirmar la recepción.' })
  @IsOptional()
  @IsString()
  @MaxLength(500)
  note?: string;
}
