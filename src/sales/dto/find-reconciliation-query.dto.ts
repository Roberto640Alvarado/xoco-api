import { Type } from 'class-transformer';
import { IsDateString, IsInt, IsOptional } from 'class-validator';
import { ApiPropertyOptional } from '@nestjs/swagger';

export class FindReconciliationQueryDto {
  @ApiPropertyOptional({
    example: '2026-06-01',
    description: 'Fecha inicial (incluida), formato YYYY-MM-DD.',
  })
  @IsDateString()
  dateFrom!: string;

  @ApiPropertyOptional({
    example: '2026-06-30',
    description: 'Fecha final (incluida). Si se omite, se usa el mismo valor que dateFrom.',
  })
  @IsOptional()
  @IsDateString()
  dateTo?: string;

  @ApiPropertyOptional({ description: 'id de pos.config (tienda). Si se omite, se devuelve una fila por cada tienda.' })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  posConfigId?: number;
}
