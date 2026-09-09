import { ApiProperty } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { ArrayMinSize, IsArray, IsInt, IsNumber, Max, Min, ValidateNested } from 'class-validator';

class TicketGoalEntryDto {
  @ApiProperty({ description: 'id de pos.config (tienda), tal como lo devuelve GET /sales/stores.' })
  @IsInt()
  @Min(1)
  posConfigId: number;

  @ApiProperty({
    example: 0.03,
    description:
      'Porcentaje de crecimiento del ticket promedio sobre la meta del mes anterior, como fracción (0.03 = 3%). Puede ser negativo (meta de decrecimiento).',
  })
  @IsNumber()
  @Min(-1)
  @Max(5)
  growthPercent: number;
}

export class UpsertTicketGoalsBulkDto {
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
    type: [TicketGoalEntryDto],
    description:
      'Una entrada por tienda a actualizar. Para "mismo % para todas" el frontend manda una entrada por cada tienda con el mismo growthPercent; para "% distinto por tienda" manda el valor que haya puesto en cada una.',
  })
  @IsArray()
  @ArrayMinSize(1)
  @ValidateNested({ each: true })
  @Type(() => TicketGoalEntryDto)
  entries: TicketGoalEntryDto[];
}
