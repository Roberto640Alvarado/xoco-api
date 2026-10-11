import { ApiProperty } from '@nestjs/swagger';
import { IsString, MaxLength, MinLength } from 'class-validator';

export class RejectMovementDto {
  @ApiProperty({ example: 'No hay existencia en planta esta semana.', description: 'Motivo del rechazo — lo ve el Vendedor.' })
  @IsString()
  @MinLength(3)
  @MaxLength(300)
  reason: string;
}
