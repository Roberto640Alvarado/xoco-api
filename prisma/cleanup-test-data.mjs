// Borra datos de PRUEBA de Inventario de las tiendas que se indiquen:
//   - solicitudes de stock (store_stock_requests) de esas tiendas,
//   - su inventario: conteos guardados (store_inventory_items), historial de
//     conteos (store_inventory_count_logs) y movimientos
//     (store_inventory_movements: mermas, regalías, degustaciones y entradas).
//
// Solo toca las tiendas de --stores; cualquier otra (ej. Centrika, que se
// está llenando) queda intacta. No toca usuarios, permisos ni qué tiendas
// tienen Inventario habilitado.
//
// Por defecto es una SIMULACIÓN: muestra qué hay por tienda y qué borraría.
//   node prisma/cleanup-test-data.mjs                     -> lista lo que hay por tienda
//   node prisma/cleanup-test-data.mjs --stores 12         -> simula borrar la tienda 12
//   node prisma/cleanup-test-data.mjs --stores 12 --apply -> borra de verdad (no se puede deshacer)
//
// Si después de borrar no queda ninguna solicitud en ninguna tienda, el
// número corrido vuelve a empezar (la próxima será SOL-0001).

import 'dotenv/config';
import pkg from '../src/generated/prisma/index.js';

const { PrismaClient } = pkg;
const prisma = new PrismaClient();

const COUNTER_ID = 'stock-request'; // mismo id que StockRequestsRepository
const apply = process.argv.includes('--apply');
const storesArg = process.argv[process.argv.indexOf('--stores') + 1];
const stores =
  process.argv.includes('--stores') && storesArg
    ? storesArg.split(',').map((value) => Number(value.trim())).filter((value) => Number.isInteger(value) && value > 0)
    : [];

const code = (number) => `SOL-${String(number).padStart(4, '0')}`;

async function summary() {
  const [requests, items, logs, movements] = await Promise.all([
    prisma.storeStockRequest.findMany({ select: { posConfigId: true, number: true, status: true }, orderBy: { number: 'asc' } }),
    prisma.storeInventoryItem.groupBy({ by: ['posConfigId'], _count: { _all: true } }),
    prisma.storeInventoryCountLog.groupBy({ by: ['posConfigId'], _count: { _all: true } }),
    prisma.storeInventoryMovement.groupBy({ by: ['posConfigId'], _count: { _all: true } }),
  ]);
  const ids = new Set([...requests, ...items, ...logs, ...movements].map((row) => row.posConfigId));
  const countOf = (rows, id) => rows.find((row) => row.posConfigId === id)?._count._all ?? 0;
  console.log('\nDatos de Inventario por tienda (posConfigId):');
  for (const id of [...ids].sort((a, b) => a - b)) {
    const own = requests.filter((r) => r.posConfigId === id);
    console.log(
      `  tienda ${id}: ${own.length} solicitudes${own.length ? ` (${own.map((r) => `${code(r.number)} ${r.status}`).join(', ')})` : ''}, ` +
        `${countOf(items, id)} productos contados, ${countOf(logs, id)} conteos en historial, ${countOf(movements, id)} movimientos` +
        (stores.includes(id) ? '   <- SE BORRA' : ''),
    );
  }
  if (ids.size === 0) console.log('  (no hay datos)');
}

async function main() {
  await summary();
  if (stores.length === 0) {
    console.log('\nNo se borró nada. Indica las tiendas a limpiar con --stores <id>[,<id>...].');
    return;
  }

  const where = { posConfigId: { in: stores } };
  console.log(`\n${apply ? 'BORRANDO' : 'SIMULACIÓN (agrega --apply para borrar)'} tiendas: ${stores.join(', ')}`);
  if (!apply) return;

  const [requests, movements, logs, items] = await prisma.$transaction([
    prisma.storeStockRequest.deleteMany({ where }),
    prisma.storeInventoryMovement.deleteMany({ where }),
    prisma.storeInventoryCountLog.deleteMany({ where }),
    prisma.storeInventoryItem.deleteMany({ where }),
  ]);
  console.log(`Borrado: ${requests.count} solicitudes, ${movements.count} movimientos, ${logs.count} conteos en historial, ${items.count} productos contados.`);

  if ((await prisma.storeStockRequest.count()) === 0) {
    await prisma.counter.deleteMany({ where: { id: COUNTER_ID } });
    console.log('No quedan solicitudes: la próxima será SOL-0001.');
  }
  await summary();
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
