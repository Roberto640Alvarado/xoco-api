import { ApiProperty } from '@nestjs/swagger';
import { IsEmail, IsEnum, IsInt, IsOptional, IsString, Min, ValidateIf } from 'class-validator';
import { Role } from '../../generated/prisma/index.js';

export class UpdateUserDto {
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

  // Mismo criterio que CreateUserDto: requerido solo si role=VENDEDOR,
  // se ignora/anula para cualquier otro rol (ver UsersService.updateUser).
  @ApiProperty({ required: false, example: 4, description: 'Tienda asignada — requerido solo si role=VENDEDOR.' })
  @ValidateIf((o: UpdateUserDto) => o.role === Role.VENDEDOR)
  @IsInt({ message: 'La tienda (posConfigId) debe ser un número entero.' })
  @Min(1)
  posConfigId?: number;
}
