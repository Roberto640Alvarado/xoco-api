import { ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { IsInt, IsOptional, Min } from 'class-validator';

export class FindTodaySalesQueryDto {
  @ApiPropertyOptional({ description: 'id de pos.config (tienda). Sin valor, todas las tiendas. Para un Vendedor se ignora: siempre su tienda.' })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  posConfigId?: number;
}
