import { Expose } from 'class-transformer';
import { ApiProperty } from '@nestjs/swagger';
import { Role } from '../../generated/prisma/index.js';
import { MODULE_KEYS } from '../../common/constants/module-keys.const.js';

// Una fila de la matriz que devuelve GET /permissions — una por cada
// (role, moduleKey) que SÍ está dentro del techo original de @Roles()
// (MODULE_KEY_CEILING). El panel nunca recibe ni renderiza un toggle
// para una combinación fuera de ese techo (ej. nunca aparece "Ventas
// mayoreo" en la pestaña de Vendedor).
export class RoleModuleAccessResponseDoc {
  @Expose()
  @ApiProperty({ enum: Role })
  role: Role;

  @Expose()
  @ApiProperty({ enum: MODULE_KEYS })
  moduleKey: string;

  @Expose()
  @ApiProperty({ description: 'true si no hay documento explícito (default-allow).' })
  enabled: boolean;

  @Expose()
  @ApiProperty({ required: false, nullable: true })
  updatedAt: Date | null;

  @Expose()
  @ApiProperty({ required: false, nullable: true })
  updatedByEmail: string | null;
}
