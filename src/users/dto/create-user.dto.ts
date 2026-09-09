import { ApiProperty } from '@nestjs/swagger';
import { IsEmail, IsEnum, IsOptional, IsString, MinLength } from 'class-validator';
import { Role } from '../../generated/prisma/index.js';

export class CreateUserDto {
  @ApiProperty({ example: 'finanzas@xocolatisimo.com' })
  @IsEmail({}, { message: 'El correo no es válido.' })
  email: string;

  @ApiProperty({ required: false, example: 'María Pérez' })
  @IsOptional()
  @IsString()
  name?: string;

  @ApiProperty({ enum: Role, example: Role.FINANZAS })
  @IsEnum(Role, { message: 'El rol debe ser SUPER_ADMIN o FINANZAS.' })
  role: Role;

  @ApiProperty({ description: 'Contraseña asignada por el admin (mínimo 8 caracteres).' })
  @IsString()
  @MinLength(8, { message: 'La contraseña debe tener al menos 8 caracteres.' })
  password: string;

  @ApiProperty({ description: 'Debe ser exactamente igual a `password` — se pide 2 veces para evitar un error de tecleo.' })
  @IsString()
  @MinLength(8, { message: 'La contraseña debe tener al menos 8 caracteres.' })
  confirmPassword: string;
}
