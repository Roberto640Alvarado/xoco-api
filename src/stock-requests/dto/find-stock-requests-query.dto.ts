import { ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { IsDateString, IsEnum, IsInt, IsOptional, Min } from 'class-validator';
import { StockRequestStatus } from '../../generated/prisma/index.js';

export class FindStockRequestsQueryDto {
  @ApiPropertyOptional({ enum: StockRequestStatus, description: 'Solo solicitudes en este estado.' })
  @IsOptional()
  @IsEnum(StockRequestStatus)
  status?: StockRequestStatus;

  @ApiPropertyOptional({ description: 'Solo esta tienda. Para el Vendedor se ignora: siempre es la suya.' })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  posConfigId?: number;

  @ApiPropertyOptional({ example: '2026-10-01', description: 'Creadas desde este día (incluido), UTC.' })
  @IsOptional()
  @IsDateString()
  dateFrom?: string;

  @ApiPropertyOptional({ example: '2026-10-31', description: 'Creadas hasta este día (incluido), UTC.' })
  @IsOptional()
  @IsDateString()
  dateTo?: string;
}
