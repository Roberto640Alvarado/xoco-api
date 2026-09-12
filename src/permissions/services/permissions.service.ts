import { BadRequestException, Injectable } from '@nestjs/common';
import { PermissionsRepository } from '../repositories/permissions.repository.js';
import { Role } from '../../generated/prisma/index.js';
import { MODULE_KEYS, MODULE_KEY_CEILING, ModuleKey } from '../../common/constants/module-keys.const.js';
import { SetRoleModuleAccessDto } from '../dto/set-role-module-access.dto.js';
import { RoleModuleAccessResponseDoc } from '../doc/role-module-access-response.doc.js';

interface RoleModuleAccessRow {
  role: Role;
  moduleKey: string;
  enabled: boolean;
  updatedAt: Date;
  updatedByEmail: string | null;
}

const CACHE_TTL_MS = 30_000;

// No hay Redis ni cache-manager en este backend (mismo criterio que el
// resto del proyecto) — la tabla role_module_access es chica (roles x
// módulos), así que un cache en memoria de proceso con TTL corto basta.
// Limitación aceptada: si el API llega a correr en más de una instancia,
// un toggle puede tardar hasta CACHE_TTL_MS en propagarse a las demás.
@Injectable()
export class PermissionsService {
  private cachedRows: { rows: RoleModuleAccessRow[]; expiresAt: number } | null = null;

  constructor(private readonly repository: PermissionsRepository) {}

  private async getRows(): Promise<RoleModuleAccessRow[]> {
    const now = Date.now();
    if (this.cachedRows && this.cachedRows.expiresAt > now) {
      return this.cachedRows.rows;
    }
    const rows = await this.repository.findAll();
    this.cachedRows = { rows, expiresAt: now + CACHE_TTL_MS };
    return rows;
  }

  private invalidateCache(): void {
    this.cachedRows = null;
  }

  // Usado por ModuleAccessGuard en el hot path de cada request. Sin fila
  // explícita para (role, moduleKey) => default-allow (true) — así un
  // bug o una fila faltante nunca degrada a un bloqueo sorpresa, solo a
  // "sin restricción nueva".
  async isEnabledForRole(role: Role, moduleKey: string): Promise<boolean> {
    const rows = await this.getRows();
    const row = rows.find((r) => r.role === role && r.moduleKey === moduleKey);
    return row ? row.enabled : true;
  }

  // Usado por GET /auth/me para calcular los permisos efectivos del
  // usuario que inicia sesión. Solo incluye los moduleKey dentro del
  // techo original de ese rol (MODULE_KEY_CEILING) — los que quedan
  // fuera del techo ya están bloqueados por el `roles` estático de
  // NAV_ITEMS en el frontend, no necesitan aparecer aquí.
  async getEffectivePermissions(role: Role): Promise<Record<string, boolean>> {
    const rows = await this.getRows();
    const result: Record<string, boolean> = {};

    for (const moduleKey of MODULE_KEYS) {
      if (!MODULE_KEY_CEILING[moduleKey].includes(role)) continue;
      const row = rows.find((r) => r.role === role && r.moduleKey === moduleKey);
      result[moduleKey] = row ? row.enabled : true;
    }

    return result;
  }

  // Matriz completa para el panel "Permisos" (GET /permissions) — siempre
  // fresca (no pasa por el cache de TTL) para que un SUPER_ADMIN vea de
  // inmediato el resultado de su propio cambio. Una fila por cada
  // (role, moduleKey) que sí está dentro del techo — nunca se sintetiza
  // una fila para una combinación fuera de él.
  async getFullMatrix(): Promise<RoleModuleAccessResponseDoc[]> {
    const rows = await this.repository.findAll();
    const matrix: RoleModuleAccessResponseDoc[] = [];

    for (const moduleKey of MODULE_KEYS) {
      for (const role of MODULE_KEY_CEILING[moduleKey]) {
        const row = rows.find((r) => r.role === role && r.moduleKey === moduleKey);
        matrix.push({
          role,
          moduleKey,
          enabled: row ? row.enabled : true,
          updatedAt: row?.updatedAt ?? null,
          updatedByEmail: row?.updatedByEmail ?? null,
        });
      }
    }

    return matrix;
  }

  // Segunda capa de aplicación de la "regla de oro": incluso llamando
  // directo a esta API de administración, es imposible habilitar un
  // (role, moduleKey) que nunca estuvo en el techo original de @Roles().
  async setAccess(dto: SetRoleModuleAccessDto, updatedByEmail: string): Promise<RoleModuleAccessResponseDoc> {
    const ceiling = MODULE_KEY_CEILING[dto.moduleKey as ModuleKey];
    if (!ceiling || !ceiling.includes(dto.role)) {
      throw new BadRequestException(
        `El rol ${dto.role} nunca tuvo acceso a "${dto.moduleKey}" — no se puede habilitar desde este panel.`,
      );
    }

    const updated = await this.repository.upsert(dto.role, dto.moduleKey, dto.enabled, updatedByEmail);
    this.invalidateCache();

    return {
      role: updated.role,
      moduleKey: updated.moduleKey,
      enabled: updated.enabled,
      updatedAt: updated.updatedAt,
      updatedByEmail: updated.updatedByEmail,
    };
  }
}
