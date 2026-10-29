import { ApiProperty } from '@nestjs/swagger';
import { IsBoolean, IsEmail, IsEnum, IsInt, IsOptional, IsString, Min, ValidateIf } from 'class-validator';
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
  @IsEnum(Role, { message: 'El rol debe ser SUPER_ADMIN, FINANZAS, VENDEDOR o PLANTA.' })
  role: Role;

  // Mismo criterio que CreateUserDto: requerido solo si role=VENDEDOR,
  // se ignora/anula para cualquier otro rol (ver UsersService.updateUser).
  @ApiProperty({ required: false, example: 4, description: 'Tienda asignada — requerido solo si role=VENDEDOR.' })
  @ValidateIf((o: UpdateUserDto) => o.role === Role.VENDEDOR)
  @IsInt({ message: 'La tienda (posConfigId) debe ser un número entero.' })
  @Min(1)
  posConfigId?: number;

  // Acceso individual a Inventario — solo se guarda para role=VENDEDOR
  // (para cualquier otro rol queda en false, ver UsersService.updateUser).
  // Si se omite, se conserva el valor actual.
  @ApiProperty({ required: false, example: true, description: 'Acceso individual a Inventario — solo aplica si role=VENDEDOR.' })
  @IsOptional()
  @IsBoolean({ message: 'El acceso a Inventario debe ser verdadero o falso.' })
  inventoryEnabled?: boolean;
}
