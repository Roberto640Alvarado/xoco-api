import { Role } from '../../generated/prisma/index.js';

// Catálogo de los 14 módulos NO administrativos del dashboard, cuyo
// acceso por rol se puede configurar desde el panel "Permisos" (Fase 3
// de RBAC). Administración (/dashboard/admin/*) NUNCA tiene moduleKey —
// se mantiene fuera de este catálogo por completo (ver
// RoleModuleAccess en schema.prisma) para que sea estructuralmente
// imposible que este panel afecte el acceso de SUPER_ADMIN a
// Administración/Permisos.
//
// Debe mantenerse en sync a mano con:
//   - xoco-app/app/dashboard/layout.tsx (moduleKey por cada NAV_ITEMS leaf)
//   - xoco-app/features/permissions/types/permissions.types.ts
//   - prisma/backfill-role-module-access.mjs (MODULE_ROLE_CEILING, duplicado
//     ahí en JS plano porque ese script corre con `node` puro, sin poder
//     importar este archivo .ts)
export const MODULE_KEYS = [
  'dashboard.resumen',
  'dashboard.visitas',
  'dashboard.trafico-diario',
  'dashboard.trafico-tiendas',
  'dashboard.venta-diaria',
  'dashboard.venta-mensual',
  'dashboard.efectivo-otros-medios',
  'dashboard.ventas-mayoreo',
  'dashboard.buscar-compradores',
  'dashboard.ticket-promedio',
  'dashboard.ticket-detallado',
  'dashboard.productos',
  'dashboard.categorias',
  'dashboard.cierre-mes',
] as const;

export type ModuleKey = (typeof MODULE_KEYS)[number];

export function isModuleKey(value: string): value is ModuleKey {
  return (MODULE_KEYS as readonly string[]).includes(value);
}

// Techo ORIGINAL de @Roles() por módulo, tal como quedó fijado en código
// en las Fases 1 y 2 — es la fuente única de verdad que
// PermissionsService usa para rechazar (400) cualquier intento de
// habilitar, desde el panel de administración, un (role, moduleKey) que
// nunca estuvo permitido. El panel de Permisos SOLO puede angostar este
// techo, nunca ampliarlo.
//
// "Cierre del mes" no tiene endpoint propio (combina los summary de
// /goals, /sales-goals y /ticket-goals, cada uno ya gateado por su
// propio moduleKey) — su enforcement es solo de frontend, ver plan de
// Fase 3.
export const MODULE_KEY_CEILING: Record<ModuleKey, Role[]> = {
  'dashboard.resumen': [Role.SUPER_ADMIN, Role.FINANZAS, Role.VENDEDOR],
  'dashboard.visitas': [Role.SUPER_ADMIN, Role.FINANZAS, Role.VENDEDOR],
  'dashboard.trafico-diario': [Role.SUPER_ADMIN, Role.FINANZAS, Role.VENDEDOR],
  'dashboard.trafico-tiendas': [Role.SUPER_ADMIN, Role.FINANZAS, Role.VENDEDOR],
  'dashboard.venta-diaria': [Role.SUPER_ADMIN, Role.FINANZAS, Role.VENDEDOR],
  'dashboard.venta-mensual': [Role.SUPER_ADMIN, Role.FINANZAS, Role.VENDEDOR],
  'dashboard.efectivo-otros-medios': [Role.SUPER_ADMIN, Role.FINANZAS, Role.VENDEDOR],
  'dashboard.ventas-mayoreo': [Role.SUPER_ADMIN, Role.FINANZAS],
  'dashboard.buscar-compradores': [Role.SUPER_ADMIN, Role.FINANZAS],
  'dashboard.ticket-promedio': [Role.SUPER_ADMIN, Role.FINANZAS, Role.VENDEDOR],
  'dashboard.ticket-detallado': [Role.SUPER_ADMIN, Role.FINANZAS, Role.VENDEDOR],
  'dashboard.productos': [Role.SUPER_ADMIN, Role.FINANZAS, Role.VENDEDOR],
  'dashboard.categorias': [Role.SUPER_ADMIN, Role.FINANZAS, Role.VENDEDOR],
  'dashboard.cierre-mes': [Role.SUPER_ADMIN, Role.FINANZAS],
};
