import { Type } from 'class-transformer';
import { IsDateString, IsInt, IsOptional } from 'class-validator';
import { ApiPropertyOptional } from '@nestjs/swagger';

export class FindDailySummaryQueryDto {
  @ApiPropertyOptional({
    example: '2026-08-09',
    description: 'Fecha inicial (incluida), formato YYYY-MM-DD. Filtra por el día LOCAL de la tienda en que se cobró la orden.',
  })
  @IsDateString()
  dateFrom!: string;

  @ApiPropertyOptional({
    example: '2026-09-08',
    description: 'Fecha final (incluida). Si se omite, se usa el mismo valor que dateFrom.',
  })
  @IsOptional()
  @IsDateString()
  dateTo?: string;

  @ApiPropertyOptional({ description: 'id de pos.config (tienda). Si se omite, se agregan todas las tiendas.' })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  posConfigId?: number;
}
