import { ApiProperty } from '@nestjs/swagger';
import { IsString, MinLength } from 'class-validator';

export class SetUserPasswordDto {
  @ApiProperty({ description: 'Nueva contraseña asignada por el admin (mínimo 8 caracteres).' })
  @IsString()
  @MinLength(8, { message: 'La contraseña debe tener al menos 8 caracteres.' })
  password: string;

  @ApiProperty({ description: 'Debe ser exactamente igual a `password` — se pide 2 veces para evitar un error de tecleo.' })
  @IsString()
  @MinLength(8, { message: 'La contraseña debe tener al menos 8 caracteres.' })
  confirmPassword: string;
}
