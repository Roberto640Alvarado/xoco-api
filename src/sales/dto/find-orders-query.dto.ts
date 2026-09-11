import { Type } from 'class-transformer';
import { IsDateString, IsInt, IsOptional, Min } from 'class-validator';
import { ApiPropertyOptional } from '@nestjs/swagger';

export class FindOrdersQueryDto {
  @ApiPropertyOptional({ example: '2026-09-01', description: 'Fecha inicial (incluida), formato YYYY-MM-DD. Filtra por el día LOCAL de la tienda en que se cobró la orden.' })
  @IsDateString()
  dateFrom!: string;

  @ApiPropertyOptional({ example: '2026-09-08', description: 'Fecha final (incluida). Si se omite, se usa el mismo valor que dateFrom (un solo día).' })
  @IsOptional()
  @IsDateString()
  dateTo?: string;

  @ApiPropertyOptional({ description: 'id de pos.config (tienda). Si se omite, se traen todas las tiendas mezcladas en una sola lista.' })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  posConfigId?: number;

  @ApiPropertyOptional({ default: 1 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  page: number = 1;

  @ApiPropertyOptional({ default: 20 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  limit: number = 20;
}
