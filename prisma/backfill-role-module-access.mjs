// Backfill: crea explícitamente, para cada (role, moduleKey) permitido
// HOY por el @Roles() ya hardcodeado de cada endpoint, un documento
// role_module_access con enabled=true — así lanzar la Fase 3 del
// proyecto de RBAC (panel "Permisos") no cambia NADA hasta que un
// SUPER_ADMIN apague un módulo a mano desde ese panel.
//
// Administración queda fuera a propósito (ver
// src/common/constants/module-keys.const.ts): nunca se inserta un
// moduleKey dashboard.admin*, así SUPER_ADMIN nunca puede perder ese
// acceso desde el mismo panel que administra.
//
// MODULE_ROLE_CEILING de abajo debe mantenerse en sync a mano con
// src/common/constants/module-keys.const.ts (MODULE_KEY_CEILING) — se
// duplica aquí en JS plano a propósito, igual que backfill-goal-audit.mjs:
// este script corre con `node` puro, sin poder importar el .ts.
//
// Idempotente: usa upsert con `update: {}` — si ya existe un documento
// (incluso si un admin ya lo puso en enabled=false después del deploy),
// NO se toca. Solo crea los que faltan. Re-ejecutable sin riesgo.
//
// Uso (una sola vez, después de desplegar el cambio de schema):
//   node prisma/backfill-role-module-access.mjs

import 'dotenv/config';
import pkg from '../src/generated/prisma/index.js';

const { PrismaClient, Role } = pkg;
const prisma = new PrismaClient();
const SISTEMA = 'Sistema';

const MODULE_ROLE_CEILING = [
  { moduleKey: 'dashboard.resumen', roles: [Role.SUPER_ADMIN, Role.FINANZAS, Role.VENDEDOR] },
  { moduleKey: 'dashboard.visitas', roles: [Role.SUPER_ADMIN, Role.FINANZAS, Role.VENDEDOR] },
  { moduleKey: 'dashboard.trafico-diario', roles: [Role.SUPER_ADMIN, Role.FINANZAS, Role.VENDEDOR] },
  { moduleKey: 'dashboard.venta-diaria', roles: [Role.SUPER_ADMIN, Role.FINANZAS, Role.VENDEDOR] },
  { moduleKey: 'dashboard.ticket-detallado', roles: [Role.SUPER_ADMIN, Role.FINANZAS, Role.VENDEDOR] },
  { moduleKey: 'dashboard.ordenes', roles: [Role.SUPER_ADMIN, Role.FINANZAS, Role.VENDEDOR] },
  { moduleKey: 'dashboard.productos', roles: [Role.SUPER_ADMIN, Role.FINANZAS, Role.VENDEDOR] },
  { moduleKey: 'dashboard.categorias', roles: [Role.SUPER_ADMIN, Role.FINANZAS, Role.VENDEDOR] },
  { moduleKey: 'dashboard.comparacion-productos', roles: [Role.SUPER_ADMIN, Role.FINANZAS, Role.VENDEDOR] },
  { moduleKey: 'dashboard.efectivo-otros-medios', roles: [Role.SUPER_ADMIN, Role.FINANZAS, Role.VENDEDOR] },
  // Solo Admin y Finanzas: son pantallas que el Vendedor nunca ve (ver
  // MODULE_KEY_CEILING en module-keys.const.ts).
  { moduleKey: 'dashboard.trafico-tiendas', roles: [Role.SUPER_ADMIN, Role.FINANZAS] },
  { moduleKey: 'dashboard.venta-mensual', roles: [Role.SUPER_ADMIN, Role.FINANZAS] },
  { moduleKey: 'dashboard.ticket-promedio', roles: [Role.SUPER_ADMIN, Role.FINANZAS] },
  { moduleKey: 'dashboard.ventas-mayoreo', roles: [Role.SUPER_ADMIN, Role.FINANZAS] },
  { moduleKey: 'dashboard.buscar-compradores', roles: [Role.SUPER_ADMIN, Role.FINANZAS] },
  // Cierre del mes no tiene endpoint propio (combina los summary de
  // /goals, /sales-goals y /ticket-goals, cada uno ya sembrado arriba) —
  // se siembra igual para que el panel Permisos y /auth/me lo incluyan;
  // su enforcement es solo de frontend (ver plan de Fase 3).
  { moduleKey: 'dashboard.cierre-mes', roles: [Role.SUPER_ADMIN, Role.FINANZAS] },
  // Inventario (Conteo y Registro): Vendedor solo LEE el de su tienda; la
  // captura del conteo es exclusiva de Admin/Finanzas (ver
  // module-keys.const.ts).
  { moduleKey: 'dashboard.inventario', roles: [Role.SUPER_ADMIN, Role.FINANZAS, Role.VENDEDOR] },
  // Segundo tramo: Vendedor sí entra a merma/regalías/degustaciones (ver
  // module-keys.const.ts) — se siembra para que el panel Permisos y
  // /auth/me lo incluyan desde el día 1.
  { moduleKey: 'dashboard.inventario-movimientos', roles: [Role.SUPER_ADMIN, Role.FINANZAS, Role.VENDEDOR] },
  // Solicitudes de stock tienda -> planta -> tienda. Es el único módulo
  // que ve el rol Planta (ver module-keys.const.ts).
  { moduleKey: 'dashboard.inventario-solicitudes', roles: [Role.SUPER_ADMIN, Role.FINANZAS, Role.VENDEDOR, Role.PLANTA] },
];

async function main() {
  for (const { moduleKey, roles } of MODULE_ROLE_CEILING) {
    for (const role of roles) {
      const result = await prisma.roleModuleAccess.upsert({
        where: { role_moduleKey: { role, moduleKey } },
        update: {},
        create: { role, moduleKey, enabled: true, updatedByEmail: SISTEMA },
      });
      console.log(`✔ ${role} / ${moduleKey}: enabled=${result.enabled}`);
    }
  }
}

main()
  .catch((error) => {
    console.error('✖ Backfill falló:', error.message);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
