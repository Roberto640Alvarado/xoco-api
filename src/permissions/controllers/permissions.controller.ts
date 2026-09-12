import { Body, Controller, Get, Patch } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiResponse, ApiTags } from '@nestjs/swagger';
import { Role } from '../../generated/prisma/index.js';
import { Roles } from '../../common/decorators/roles.decorator.js';
import { User } from '../../common/decorators/user.decorator.js';
import { PermissionsService } from '../services/permissions.service.js';
import { SetRoleModuleAccessDto } from '../dto/set-role-module-access.dto.js';
import { RoleModuleAccessResponseDoc } from '../doc/role-module-access-response.doc.js';

// Exclusivo de SUPER_ADMIN, igual que UsersController — este panel
// controla qué módulos ve cada rol, incluyendo Finanzas y el propio
// Vendedor. Nunca lleva @RequiresModule(): Administración/Permisos
// queda deliberadamente fuera del catálogo de módulos configurables
// (ver module-keys.const.ts) para que SUPER_ADMIN nunca pueda quedar
// bloqueado de este mismo panel.
@ApiTags('permissions')
@ApiBearerAuth()
@Roles(Role.SUPER_ADMIN)
@Controller('permissions')
export class PermissionsController {
  constructor(private readonly permissionsService: PermissionsService) {}

  @Get()
  @ApiOperation({
    summary: 'Matriz completa de permisos por rol y módulo.',
    description:
      'Una fila por cada (role, moduleKey) que está dentro del techo original de @Roles() de ese módulo — ' +
      'nunca incluye una combinación que un rol nunca pudo ver (ej. Ventas mayoreo para Vendedor).',
  })
  @ApiResponse({ status: 200, type: [RoleModuleAccessResponseDoc] })
  getMatrix(): Promise<RoleModuleAccessResponseDoc[]> {
    return this.permissionsService.getFullMatrix();
  }

  @Patch()
  @ApiOperation({
    summary: 'Habilita o deshabilita un módulo del dashboard para un rol.',
    description:
      'Solo puede angostar el techo original de @Roles() de ese módulo, nunca ampliarlo — intentar habilitar ' +
      'un (role, moduleKey) que ese rol nunca tuvo responde 400.',
  })
  @ApiResponse({ status: 200, type: RoleModuleAccessResponseDoc })
  @ApiResponse({ status: 400, description: 'Ese rol nunca tuvo acceso a ese módulo.' })
  setAccess(
    @Body() dto: SetRoleModuleAccessDto,
    @User('email') actingUserEmail: string,
  ): Promise<RoleModuleAccessResponseDoc> {
    return this.permissionsService.setAccess(dto, actingUserEmail);
  }
}
