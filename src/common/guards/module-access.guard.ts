import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Injectable,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import type { Request } from 'express';
import { REQUIRES_MODULE_KEY } from '../decorators/requires-module.decorator.js';
import { ModuleKey } from '../constants/module-keys.const.js';
import { AuthenticatedUser } from '../interfaces/jwt-payload.interface.js';
import { PermissionsService } from '../../permissions/services/permissions.service.js';

interface RequestWithUser extends Request {
  user: AuthenticatedUser;
}

/**
 * Guard de autorización por módulo (panel "Permisos", Fase 3 de RBAC),
 * registrado en AppModule vía APP_GUARD como TERCER guard, después de
 * JwtAuthGuard y RolesGuard. Sin @RequiresModule() en la ruta, no agrega
 * ninguna restricción (comportamiento idéntico a hoy).
 *
 * Respeta la "regla de oro" de forma estructural, no solo por
 * convención: los APP_GUARD se evalúan en orden como AND — este guard
 * nunca se ejecuta si RolesGuard ya rechazó, y este guard en sí mismo NO
 * tiene ningún camino que devuelva `true` cuando RolesGuard habría
 * devuelto `false` — solo puede restar acceso, nunca sumarlo. Nunca se
 * usa @RequiresModule() en UsersController, en el controller de Odoo, ni
 * en PermissionsController, así que Administración queda fuera de este
 * código por completo.
 */
@Injectable()
export class ModuleAccessGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    private readonly permissionsService: PermissionsService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const moduleKeys = this.reflector.getAllAndOverride<ModuleKey[]>(
      REQUIRES_MODULE_KEY,
      [context.getHandler(), context.getClass()],
    );

    if (!moduleKeys || moduleKeys.length === 0) {
      return true;
    }

    const request = context.switchToHttp().getRequest<RequestWithUser>();
    const user = request.user;

    // Permite si CUALQUIERA de las moduleKeys declaradas está habilitada
    // para el rol — ver el comentario de @RequiresModule sobre por qué
    // un endpoint puede declarar varias (ej. GET /sales/daily-summary).
    const checks = await Promise.all(
      moduleKeys.map((moduleKey) => this.permissionsService.isEnabledForRole(user.role, moduleKey)),
    );

    if (checks.some(Boolean)) {
      return true;
    }

    throw new ForbiddenException({
      statusCode: 403,
      error: 'Forbidden',
      message: 'Este módulo no está disponible para tu rol.',
      code: 'MODULE_DISABLED',
    });
  }
}
