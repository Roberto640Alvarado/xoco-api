import { ApiProperty } from '@nestjs/swagger';
import { IsBoolean } from 'class-validator';

export class SetUserActiveDto {
  @ApiProperty({ example: false, description: 'false desactiva la cuenta (no puede volver a iniciar sesión); true la reactiva.' })
  @IsBoolean()
  isActive: boolean;
}
