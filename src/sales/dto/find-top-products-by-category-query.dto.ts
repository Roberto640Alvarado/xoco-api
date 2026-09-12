import { Type } from 'class-transformer';
import { IsDateString, IsIn, IsInt, IsOptional, Min } from 'class-validator';
import { ApiPropertyOptional } from '@nestjs/swagger';
import type { ProductRankOrder } from './find-top-products-query.dto.js';

export class FindTopProductsByCategoryQueryDto {
  @ApiPropertyOptional({ example: '2026-09-01', description: 'Fecha inicial (incluida), formato YYYY-MM-DD. Filtra por el día LOCAL de la tienda en que se cobró la orden.' })
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

  @ApiPropertyOptional({ default: 10, description: 'Cuántos productos traer POR CATEGORÍA, ordenados por ingresos.' })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  limit: number = 10;

  @ApiPropertyOptional({
    default: 'desc',
    enum: ['desc', 'asc'],
    description: '"desc" = más ingresos primero dentro de cada categoría. "asc" = menos ingresos primero.',
  })
  @IsOptional()
  @IsIn(['desc', 'asc'])
  order: ProductRankOrder = 'desc';
}
