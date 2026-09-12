import { ApiProperty } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { ArrayMinSize, IsArray, IsIn, IsInt, IsNumber, IsString, Max, Min, ValidateNested } from 'class-validator';
import { WHOLESALE_CLIENTS } from '../../sales/constants/wholesale-clients.const.js';

const WHOLESALE_CLIENT_KEYS = WHOLESALE_CLIENTS.map((client) => client.key);

class WholesaleGoalEntryDto {
  @ApiProperty({
    enum: WHOLESALE_CLIENT_KEYS,
    description: 'key del cliente de mayoreo, tal como lo devuelve GET /wholesale-goals/clients.',
  })
  @IsString()
  @IsIn(WHOLESALE_CLIENT_KEYS)
  clientKey: string;

  @ApiProperty({
    example: 0.08,
    description:
      'Porcentaje de crecimiento de venta ($) sobre la meta del mes anterior, como fracción (0.08 = 8%). Puede ser negativo (meta de decrecimiento).',
  })
  @IsNumber()
  @Min(-1)
  @Max(5)
  growthPercent: number;
}

export class UpsertWholesaleGoalsBulkDto {
  @ApiProperty({ example: 2026 })
  @IsInt()
  @Min(2000)
  @Max(2100)
  year: number;

  @ApiProperty({ example: 9, description: 'Mes 1-12.' })
  @IsInt()
  @Min(1)
  @Max(12)
  month: number;

  @ApiProperty({
    type: [WholesaleGoalEntryDto],
    description:
      'Una entrada por cliente de mayoreo a actualizar. Para "mismo % para todos" el frontend manda una entrada ' +
      'por cada cliente con el mismo growthPercent; para "% distinto por cliente" manda el valor que haya puesto ' +
      'en cada uno.',
  })
  @IsArray()
  @ArrayMinSize(1)
  @ValidateNested({ each: true })
  @Type(() => WholesaleGoalEntryDto)
  entries: WholesaleGoalEntryDto[];
}
