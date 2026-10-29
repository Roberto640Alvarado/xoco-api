import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  ArrayMaxSize,
  ArrayMinSize,
  IsArray,
  IsBoolean,
  IsInt,
  IsNumber,
  IsOptional,
  IsString,
  Max,
  MaxLength,
  Min,
  ValidateIf,
  ValidateNested,
} from 'class-validator';
import { MAX_LINE_QUANTITY, MAX_REQUEST_LINES } from './create-stock-request.dto.js';

export class PlantLineInputDto {
  @ApiProperty({ description: 'id de product.product en Odoo.' })
  @IsInt()
  @Min(1)
  productId: number;

  @ApiPropertyOptional({
    nullable: true,
    example: 10,
    description: 'Lo que planta envía de este producto. 0 = no hay; null = todavía sin responder.',
  })
  @ValidateIf((line: PlantLineInputDto) => line.sentQuantity !== null && line.sentQuantity !== undefined)
  @IsNumber()
  @Min(0)
  @Max(MAX_LINE_QUANTITY)
  sentQuantity?: number | null;

  @ApiPropertyOptional({ nullable: true, example: 'Solo hay la mitad esta semana.' })
  @IsOptional()
  @IsString()
  @MaxLength(200)
  note?: string | null;

  @ApiPropertyOptional({ description: 'true si es un producto que planta agrega y la tienda no pidió.' })
  @IsOptional()
  @IsBoolean()
  added?: boolean;

  @ApiPropertyOptional({
    nullable: true,
    example: 200,
    description:
      'Solo para productos agregados: id del producto PEDIDO al que sustituye (ej. no hay tiramisú y se manda brownie). ' +
      'Debe ser un producto que la tienda pidió en esta solicitud.',
  })
  @ValidateIf((line: PlantLineInputDto) => line.replacesProductId !== null && line.replacesProductId !== undefined)
  @IsInt()
  @Min(1)
  replacesProductId?: number | null;
}

// Mismo cuerpo para guardar avance (PUT .../response) y para despachar
// (POST .../dispatch): describe cómo quedó el pedido en manos de planta.
// Las líneas que pidió la tienda se actualizan; las marcadas `added` que
// no existían se crean; las `added` que ya existían y no vienen aquí se
// quitan. Una línea pedida que no viene se queda como estaba.
export class SavePlantResponseDto {
  @ApiProperty({ type: [PlantLineInputDto] })
  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(MAX_REQUEST_LINES)
  @ValidateNested({ each: true })
  @Type(() => PlantLineInputDto)
  lines: PlantLineInputDto[];

  @ApiPropertyOptional({ description: 'Nota general de planta (ej. "sale en el camión de las 3").' })
  @IsOptional()
  @IsString()
  @MaxLength(500)
  note?: string;
}
