import { SetMetadata } from '@nestjs/common';
import { Role } from '../../generated/prisma/index.js';

export const ROLES_KEY = 'roles';

/**
 * Restringe el acceso a un endpoint a los roles indicados.
 * Debe usarse junto con RolesGuard. Sin este decorador, cualquier usuario
 * autenticado (SUPER_ADMIN o FINANZAS) puede acceder.
 */
export const Roles = (...roles: Role[]) => SetMetadata(ROLES_KEY, roles);
