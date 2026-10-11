import { IsDateString, IsOptional } from 'class-validator';
import { ApiPropertyOptional } from '@nestjs/swagger';

export class FindMovementNotificationsQueryDto {
  @ApiPropertyOptional({
    example: '2026-10-11T15:00:00.000Z',
    description:
      'Solo VENDEDOR: cuenta como "resuelto sin ver" lo que Admin/Finanzas confirmó o rechazó después de esta fecha (última vez que el Vendedor abrió Movimientos). Por defecto, los últimos 7 días.',
  })
  @IsOptional()
  @IsDateString()
  since?: string;
}
