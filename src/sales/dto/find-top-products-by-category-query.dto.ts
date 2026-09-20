import { Type } from 'class-transformer';
import { IsDateString, IsIn, IsInt, IsOptional, Min } from 'class-validator';
import { ApiPropertyOptional } from '@nestjs/swagger';
import type { ProductRankOrder } from './find-top-products-query.dto.js';
import type { CategoryProductUnit } from '../doc/sales.doc.js';

// 'revenue' = ingresos ($), comparable entre un producto por pieza y uno
// a granel (comportamiento histórico, default). 'quantity' = cantidad
// vendida en la unidad propia de CADA producto (unidades o Kg, ver
// CategoryProductDoc.unit) — no sirve para comparar un producto a granel
// contra uno por pieza, pero es lo que pidió el negocio para ver "qué se
// mueve más" dentro de categorías que no mezclan ambos tipos.
export type TopProductsByCategoryMetric = 'revenue' | 'quantity';

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
    description: '"desc" = más primero (según `metric`) dentro de cada categoría. "asc" = menos primero.',
  })
  @IsOptional()
  @IsIn(['desc', 'asc'])
  order: ProductRankOrder = 'desc';

  @ApiPropertyOptional({
    default: 'revenue',
    enum: ['revenue', 'quantity'],
    description:
      '"revenue" ordena los productos de cada categoría por ingresos ($) — comparable entre un producto por ' +
      'pieza y uno a granel. "quantity" ordena por la cantidad vendida en la unidad propia de cada producto ' +
      '(unidades o Kg, ver `unit` en la respuesta) — no mezcla piezas con Kg en un mismo número. Las CATEGORÍAS ' +
      'siempre se ordenan por ingresos, sin importar este valor.',
  })
  @IsOptional()
  @IsIn(['revenue', 'quantity'])
  metric: TopProductsByCategoryMetric = 'revenue';
}
