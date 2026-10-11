import { ApiProperty } from '@nestjs/swagger';
import { IsBoolean } from 'class-validator';

export class SetInventoryAccessDto {
  @ApiProperty({ example: true, description: 'true habilita Inventario para los Vendedores de la tienda; false lo oculta.' })
  @IsBoolean()
  enabled: boolean;
}
