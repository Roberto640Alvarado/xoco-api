// Backfill: rellena `updatedByEmail` en los registros de metas que ya
// existían antes de agregar la auditoría (Fase 1 del proyecto de RBAC).
//
// Qué hace:
//   Recorre los 4 modelos de "meta" (% de crecimiento) — storeGoal,
//   storeSalesGoal, storeTicketGoal, wholesaleClientGoal — y en cada uno
//   pone `updatedByEmail: "Sistema"` en todos los documentos donde ese
//   campo NO EXISTA todavía (los que se crearon antes de este cambio de
//   schema). No toca los documentos que ya tengan el campo (aunque sea
//   null), para no pisar nada que ya se haya escrito después del deploy.
//
//   Usa `$runCommandRaw` con `$exists: false` en vez de un `updateMany` de
//   Prisma normal, porque el conector de Mongo de Prisma traduce
//   `equals: null` como "el campo existe y vale null", y por lo tanto NO
//   encuentra los documentos legacy donde el campo simplemente no existe
//   (confirmado: con updateMany({ where: { updatedByEmail: null } })
//   Prisma reportaba 0 documentos afectados, aunque sí había muchos con
//   el campo ausente).
//
// Uso (una sola vez, después de desplegar el cambio de schema):
//   node prisma/backfill-goal-audit.mjs
//
// Re-ejecutable sin riesgo: si se corre de nuevo, ya no encuentra
// documentos sin el campo y no hace nada.

import 'dotenv/config';
import pkg from '../src/generated/prisma/index.js';

const { PrismaClient } = pkg;
const prisma = new PrismaClient();

const SISTEMA = 'Sistema';

const COLLECTIONS = [
  { name: 'store_goals', label: 'store_goals (Tráfico de tiendas)' },
  { name: 'store_sales_goals', label: 'store_sales_goals (Venta Mensual)' },
  { name: 'store_ticket_goals', label: 'store_ticket_goals (Ticket Promedio)' },
  { name: 'wholesale_client_goals', label: 'wholesale_client_goals (Ventas Mayoreo)' },
];

async function backfillCollection({ name, label }) {
  const result = await prisma.$runCommandRaw({
    update: name,
    updates: [
      {
        q: { updatedByEmail: { $exists: false } },
        u: { $set: { updatedByEmail: SISTEMA } },
        multi: true,
      },
    ],
  });
  const modified = result?.nModified ?? result?.n ?? 0;
  console.log(`✔ ${label}: ${modified} documento(s) actualizado(s) con updatedByEmail="${SISTEMA}"`);
}

async function main() {
  for (const collection of COLLECTIONS) {
    await backfillCollection(collection);
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
