import { Type } from 'class-transformer';
import { IsDateString, IsIn, IsInt, IsOptional, Min } from 'class-validator';
import { ApiPropertyOptional } from '@nestjs/swagger';

export type ProductRankOrder = 'desc' | 'asc';

export class FindTopProductsQueryDto {
  @ApiPropertyOptional({ example: '2026-09-01', description: 'Fecha inicial (incluida), formato YYYY-MM-DD. Filtra por la fecha de la SESIÓN POS.' })
  @IsDateString()
  dateFrom!: string;

  @ApiPropertyOptional({ example: '2026-09-08', description: 'Fecha final (incluida). Si se omite, se usa el mismo valor que dateFrom.' })
  @IsOptional()
  @IsDateString()
  dateTo?: string;

  @ApiPropertyOptional({ description: 'id de pos.config (tienda). Si se omite, se agrega ventas de todas las tiendas.' })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  posConfigId?: number;

  @ApiPropertyOptional({ default: 10, description: 'Cuántos productos traer, ordenados por cantidad vendida (unidades).' })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  limit: number = 10;

  @ApiPropertyOptional({
    default: 'desc',
    enum: ['desc', 'asc'],
    description: '"desc" = más vendidos primero (top). "asc" = menos vendidos primero (bottom). Solo incluye productos con al menos una unidad vendida en el rango.',
  })
  @IsOptional()
  @IsIn(['desc', 'asc'])
  order: ProductRankOrder = 'desc';
}
