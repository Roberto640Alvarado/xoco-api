import { ApiProperty } from '@nestjs/swagger';
import { IsBoolean, IsIn } from 'class-validator';
import { Role } from '../../generated/prisma/index.js';
import { MODULE_KEYS } from '../../common/constants/module-keys.const.js';
import type { ModuleKey } from '../../common/constants/module-keys.const.js';

export class SetRoleModuleAccessDto {
  @ApiProperty({ enum: Role, example: Role.VENDEDOR })
  @IsIn(Object.values(Role), { message: 'El rol debe ser SUPER_ADMIN, FINANZAS o VENDEDOR.' })
  role: Role;

  @ApiProperty({ enum: MODULE_KEYS, example: 'dashboard.venta-diaria' })
  @IsIn(MODULE_KEYS, { message: 'moduleKey desconocido.' })
  moduleKey: ModuleKey;

  @ApiProperty({ example: false, description: 'false apaga el módulo para ese rol; true lo vuelve a habilitar.' })
  @IsBoolean()
  enabled: boolean;
}
