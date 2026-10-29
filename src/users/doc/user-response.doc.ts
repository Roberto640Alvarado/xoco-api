import { Expose, Transform } from 'class-transformer';
import { ApiProperty } from '@nestjs/swagger';
import { Role } from '../../generated/prisma/index.js';

// Nunca incluye `password` — solo los campos explícitamente @Expose()
// sobreviven a plainToInstance(..., { excludeExtraneousValues: true }).
export class UserResponseDoc {
  @Expose()
  @ApiProperty()
  id: string;

  @Expose()
  @ApiProperty()
  email: string;

  @Expose()
  @ApiProperty({ required: false, nullable: true })
  name: string | null;

  @Expose()
  @ApiProperty({ enum: Role })
  role: Role;

  @Expose()
  @ApiProperty()
  isActive: boolean;

  // Tienda asignada — solo presente (no null) para role=VENDEDOR (Planta no tiene tienda).
  @Expose()
  @ApiProperty({ required: false, nullable: true })
  posConfigId: number | null;

  // Acceso individual a Inventario — solo tiene efecto para role=VENDEDOR.
  // null/ausente en Mongo se expone como false.
  @Expose()
  @Transform(({ value }) => value === true)
  @ApiProperty({ description: 'Acceso individual a Inventario (solo aplica a Vendedores).' })
  inventoryEnabled: boolean;

  @Expose()
  @ApiProperty()
  createdAt: Date;
}
