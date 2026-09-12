import { ApiProperty } from '@nestjs/swagger';
import { IsEmail, IsEnum, IsInt, IsOptional, IsString, Min, MinLength, ValidateIf } from 'class-validator';
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
  @IsEnum(Role, { message: 'El rol debe ser SUPER_ADMIN, FINANZAS o VENDEDOR.' })
  role: Role;

  // Obligatorio SOLO cuando role=VENDEDOR — un Vendedor queda atado a
  // exactamente una tienda (ver UsersService.createUser, que además
  // valida que sea una tienda real). Se ignora/anula para cualquier
  // otro rol, aunque el cliente lo mande.
  @ApiProperty({ required: false, example: 4, description: 'Tienda asignada — requerido solo si role=VENDEDOR.' })
  @ValidateIf((o: CreateUserDto) => o.role === Role.VENDEDOR)
  @IsInt({ message: 'La tienda (posConfigId) debe ser un número entero.' })
  @Min(1)
  posConfigId?: number;

  @ApiProperty({ description: 'Contraseña asignada por el admin (mínimo 8 caracteres).' })
  @IsString()
  @MinLength(8, { message: 'La contraseña debe tener al menos 8 caracteres.' })
  password: string;

  @ApiProperty({ description: 'Debe ser exactamente igual a `password` — se pide 2 veces para evitar un error de tecleo.' })
  @IsString()
  @MinLength(8, { message: 'La contraseña debe tener al menos 8 caracteres.' })
  confirmPassword: string;
}
