import { ApiProperty } from '@nestjs/swagger';
import { IsEmail, IsEnum, IsOptional, IsString } from 'class-validator';
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
  @IsEnum(Role, { message: 'El rol debe ser SUPER_ADMIN o FINANZAS.' })
  role: Role;
}
