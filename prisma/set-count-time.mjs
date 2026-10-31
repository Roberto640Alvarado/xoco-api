// Corrige la HORA de conteos ya guardados: cuando se contó físicamente
// antes de capturarlo en el panel (ej. se contó a las 7:00 y se guardó a
// las 11:00), las ventas de en medio no se restaban de la existencia
// estimada. Esto mueve la hora del conteo (countedAt) de los productos de
// una tienda guardados ese día a la hora real del conteo.
//
// Solo toca conteos de --store guardados el mismo día (hora local de El
// Salvador) que --at y DESPUÉS de --at; nunca mueve un conteo hacia
// adelante. Actualiza también el historial de conteos (Registro/Kardex).
//
// Para ver primero cuándo se guardaron los conteos de cada tienda:
//   node prisma/set-count-time.mjs --list
//
// Por defecto es una SIMULACIÓN:
//   node prisma/set-count-time.mjs --store 4 --at "2026-10-30 07:00"
//   node prisma/set-count-time.mjs --store 4 --at "2026-10-30 07:00" --apply
//
// Con --hasta se incluyen también los guardados hasta esa fecha y hora (ej. si
// parte del conteo del 30 se capturó el 31):
//   node prisma/set-count-time.mjs --store 1 --at "2026-10-30 07:00" --hasta "2026-10-31 23:59"

import 'dotenv/config';
import pkg from '../src/generated/prisma/index.js';

const { PrismaClient } = pkg;
const prisma = new PrismaClient();

const arg = (name) => {
  const index = process.argv.indexOf(name);
  return index >= 0 ? process.argv[index + 1] : undefined;
};
const apply = process.argv.includes('--apply');
const store = Number(arg('--store'));
const atText = arg('--at');

// "2026-10-30 07:00" en hora de El Salvador (UTC-6, sin horario de verano).
function localToDate(text) {
  const match = /^(\d{4}-\d{2}-\d{2})[ T](\d{1,2}):(\d{2})$/.exec(text ?? '');
  if (!match) return null;
  return new Date(`${match[1]}T${match[2].padStart(2, '0')}:${match[3]}:00-06:00`);
}
const fmt = (date) => date.toLocaleString('es-SV', { timeZone: 'America/El_Salvador', dateStyle: 'short', timeStyle: 'short' });

// Cuántos productos se guardaron en Conteo por tienda, día y hora (hora de El Salvador).
async function listSaves() {
  const items = await prisma.storeInventoryItem.findMany({
    select: { posConfigId: true, updatedAt: true, countedAt: true },
  });
  const groups = new Map();
  for (const item of items) {
    const when = item.countedAt ?? item.updatedAt;
    const local = new Date(when.getTime() - 6 * 60 * 60 * 1000).toISOString();
    const key = `tienda ${item.posConfigId} - ${local.slice(0, 10)} ${local.slice(11, 13)}:00`;
    groups.set(key, (groups.get(key) ?? 0) + 1);
  }
  console.log('\nProductos contados por tienda, día y hora en que se guardaron (hora de El Salvador):');
  for (const key of [...groups.keys()].sort()) console.log(`  ${key}  ->  ${groups.get(key)} productos`);
}

async function main() {
  if (process.argv.includes('--list')) {
    await listSaves();
    return;
  }
  const at = localToDate(atText);
  if (!Number.isInteger(store) || store <= 0 || !at) {
    console.log('Uso: node prisma/set-count-time.mjs --store <posConfigId> --at "AAAA-MM-DD HH:MM" [--apply]');
    process.exitCode = 1;
    return;
  }
  const dayStart = new Date(`${atText.slice(0, 10)}T00:00:00-06:00`);
  const untilText = arg('--hasta');
  const until = untilText ? localToDate(untilText) : null;
  if (untilText && !until) {
    console.log('--hasta debe ser "AAAA-MM-DD HH:MM".');
    process.exitCode = 1;
    return;
  }
  // Por defecto, solo lo guardado el mismo día que --at.
  const dayEnd = until ? new Date(until.getTime() + 60 * 1000) : new Date(dayStart.getTime() + 24 * 60 * 60 * 1000);

  const items = await prisma.storeInventoryItem.findMany({
    where: { posConfigId: store, updatedAt: { gt: at, lt: dayEnd } },
    orderBy: { updatedAt: 'asc' },
  });
  const logs = await prisma.storeInventoryCountLog.count({
    where: { posConfigId: store, countedAt: { gt: at, lt: dayEnd } },
  });

  console.log(`\nTienda ${store}: conteos guardados después de ${fmt(at)}${until ? ` y hasta ${fmt(until)}` : ' ese mismo día'} -> ${items.length} productos, ${logs} registros de historial.`);
  if (items.length) {
    console.log(`  Guardados entre ${fmt(items[0].updatedAt)} y ${fmt(items[items.length - 1].updatedAt)}.`);
    console.log(`  Pasarán a contar desde: ${fmt(at)} (las ventas desde esa hora se restan).`);
  }
  if (!apply) {
    console.log('\nSIMULACIÓN: no se cambió nada. Agrega --apply para guardar.');
    return;
  }

  const [updatedItems, updatedLogs] = await prisma.$transaction([
    prisma.storeInventoryItem.updateMany({
      where: { posConfigId: store, updatedAt: { gt: at, lt: dayEnd } },
      data: { countedAt: at },
    }),
    prisma.storeInventoryCountLog.updateMany({
      where: { posConfigId: store, countedAt: { gt: at, lt: dayEnd } },
      data: { countedAt: at },
    }),
  ]);
  console.log(`\nListo: ${updatedItems.count} productos y ${updatedLogs.count} registros ahora cuentan desde ${fmt(at)}.`);
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
