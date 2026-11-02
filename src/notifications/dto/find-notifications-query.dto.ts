import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsISO8601, IsOptional } from 'class-validator';

export class FindNotificationsQueryDto {
  @ApiPropertyOptional({ description: 'Solo Vendedor: última vez que abrió Movimientos (lo resuelto después cuenta como novedad). Por defecto, 7 días.' })
  @IsOptional()
  @IsISO8601()
  sinceMovements?: string;
}
