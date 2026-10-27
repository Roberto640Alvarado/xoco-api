import { ApiProperty } from '@nestjs/swagger';
import { IsString, MaxLength, MinLength } from 'class-validator';

export class CancelStockRequestDto {
  @ApiProperty({ example: 'Planta no tiene existencia esta semana.', description: 'Motivo de la cancelación — lo ve la tienda.' })
  @IsString()
  @MinLength(3, { message: 'Escribe el motivo de la cancelación.' })
  @MaxLength(300)
  reason: string;
}
