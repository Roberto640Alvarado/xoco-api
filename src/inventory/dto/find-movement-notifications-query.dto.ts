import { IsDateString, IsOptional } from 'class-validator';
import { ApiPropertyOptional } from '@nestjs/swagger';

export class FindMovementNotificationsQueryDto {
  @ApiPropertyOptional({
    example: '2026-10-11T15:00:00.000Z',
    description:
      'Solo VENDEDOR: última vez que abrió Movimientos — cuenta como novedad lo que Admin/Finanzas confirmó o rechazó después. Por defecto, los últimos 7 días.',
  })
  @IsOptional()
  @IsDateString()
  sinceMovements?: string;
}
