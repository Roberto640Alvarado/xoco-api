import { Type } from 'class-transformer';
import { IsDateString, IsInt, IsOptional, IsString, Min, MinLength } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class FindCustomerSearchQueryDto {
  @ApiProperty({
    example: 'selectos',
    description: 'Texto a buscar contra el nombre del cliente (partner_id.name de la factura), sin distinguir mayúsculas/acentos exactos — mínimo 2 caracteres.',
  })
  @IsString()
  @MinLength(2)
  q!: string;

  @ApiProperty({
    example: '2026-08-01',
    description: 'Fecha inicial (incluida), formato YYYY-MM-DD. Filtra por la fecha de la FACTURA (invoice_date de Odoo).',
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

  @ApiPropertyOptional({ default: 30, description: 'Cuántos clientes traer como máximo, ordenados por venta descendente.' })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  limit: number = 30;
}
