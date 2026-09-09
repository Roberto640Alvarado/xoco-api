import { ApiProperty } from '@nestjs/swagger';
import { IsInt, Max, Min } from 'class-validator';

export class UpsertGoalDto {
  @ApiProperty({ description: 'id de pos.config (tienda), tal como lo devuelve GET /sales/stores.' })
  @IsInt()
  @Min(1)
  posConfigId: number;

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

  @ApiProperty({ description: 'Meta de órdenes (visitas) para esa tienda en ese mes.' })
  @IsInt()
  @Min(0)
  targetOrders: number;
}
