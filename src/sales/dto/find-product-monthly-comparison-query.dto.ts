import { Type } from 'class-transformer';
import { IsDateString, IsInt, IsOptional, Min } from 'class-validator';
import { ApiPropertyOptional } from '@nestjs/swagger';

export class FindProductMonthlyComparisonQueryDto {
  @ApiPropertyOptional({
    description: 'id de pos.config (tienda). Si se omite, se agregan ventas de todas las tiendas.',
  })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  posConfigId?: number;

  @ApiPropertyOptional({
    default: 10,
    description: 'Cuántos productos traer, ordenados por unidades vendidas en el mes en curso.',
  })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  limit: number = 10;

  @ApiPropertyOptional({
    example: '2026-09-12',
    description:
      'Fecha (YYYY-MM-DD) que define "hoy" para calcular el mes en curso (día 1 hasta esta fecha) y el mes ' +
      'anterior (completo, mes calendario). Pensado para pruebas — si se omite, se usa el día de hoy en hora ' +
      'local de la tienda.',
  })
  @IsOptional()
  @IsDateString()
  referenceDate?: string;
}
