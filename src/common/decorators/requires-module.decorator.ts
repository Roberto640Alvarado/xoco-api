import { SetMetadata } from '@nestjs/common';
import type { ModuleKey } from '../constants/module-keys.const.js';

export const REQUIRES_MODULE_KEY = 'requiresModule';

/**
 * Restringe un endpoint a los roles que tengan habilitado, en la tabla
 * `RoleModuleAccess` (panel "Permisos", Fase 3 de RBAC), AL MENOS UNO de
 * los moduleKey indicados — debe usarse junto con ModuleAccessGuard.
 *
 * Se acepta una LISTA (no un solo moduleKey) porque algunos endpoints
 * respaldan varias pantallas del dashboard a la vez con el mismo dato
 * (ej. GET /sales/daily-summary respalda Resumen/Visitas/Tráfico
 * diario/Venta diaria/Ticket detallado) — no hay forma de saber, del
 * lado del servidor, cuál pantalla originó la llamada sin confiar en un
 * parámetro mandado por el cliente (y confiar en eso sería un boquete:
 * un rol bloqueado de una pantalla podría simplemente decir que es otra).
 * Por eso la regla es "permite si CUALQUIERA de las N está habilitada" —
 * la única forma de bloquear de verdad el dato compartido es apagar
 * las N pantallas que lo comparten.
 *
 * Nunca se usa en UsersController, en el controller de config de Odoo, ni
 * en PermissionsController — Administración queda fuera de este
 * mecanismo por completo (ver module-keys.const.ts).
 */
export const RequiresModule = (...moduleKeys: ModuleKey[]) =>
  SetMetadata(REQUIRES_MODULE_KEY, moduleKeys);
