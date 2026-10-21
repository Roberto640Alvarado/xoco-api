import { Transform, Type } from 'class-transformer';
import { IsDateString, IsEnum, IsInt, IsOptional, IsString, Max, MaxLength, Min } from 'class-validator';
import { ApiPropertyOptional } from '@nestjs/swagger';
import { PosTicketSort } from '../enums/pos-ticket-sort.enum.js';

export const MAX_TICKETS_PAGE_SIZE = 100;

export class FindPosTicketsQueryDto {
  @ApiPropertyOptional({ example: '2026-10-01', description: 'Fecha inicial (incluida), YYYY-MM-DD, día LOCAL de la tienda.' })
  @IsDateString({}, { message: 'La fecha inicial no es válida.' })
  dateFrom!: string;

  @ApiPropertyOptional({ example: '2026-10-20', description: 'Fecha final (incluida). Si se omite, se usa dateFrom.' })
  @IsOptional()
  @IsDateString({}, { message: 'La fecha final no es válida.' })
  dateTo?: string;

  @ApiPropertyOptional({
    description: 'id de pos.config (tienda). Sin valor = todas las tiendas. Para un Vendedor se ignora y se usa su tienda.',
  })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  posConfigId?: number;

  @ApiPropertyOptional({ description: 'Busca por número de orden, número de recibo o nombre del cliente.' })
  @IsOptional()
  @Transform(({ value }: { value: unknown }) => (typeof value === 'string' ? value.trim() : value))
  @IsString()
  @MaxLength(100, { message: 'La búsqueda no puede tener más de 100 caracteres.' })
  search?: string;

  @ApiPropertyOptional({ enum: PosTicketSort, default: PosTicketSort.DATE_DESC })
  @IsOptional()
  @IsEnum(PosTicketSort, { message: 'El orden pedido no es válido.' })
  sort: PosTicketSort = PosTicketSort.DATE_DESC;

  @ApiPropertyOptional({ default: 1 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  page: number = 1;

  @ApiPropertyOptional({ default: 20, maximum: MAX_TICKETS_PAGE_SIZE })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(MAX_TICKETS_PAGE_SIZE, { message: `No se pueden pedir más de ${MAX_TICKETS_PAGE_SIZE} órdenes por página.` })
  limit: number = 20;
}
