// Cierra las solicitudes de stock del flujo ANTERIOR (movimientos ENTRADA
// que pasaban por PENDIENTE -> EN_CAMINO -> RECIBIDO -> CONFIRMADO).
//
// Desde las solicitudes nuevas (tienda -> planta -> tienda, ver
// StoreStockRequest en schema.prisma) esas entradas ya no tienen cómo
// avanzar, así que las que hayan quedado abiertas se cierran una vez:
//
//   PENDIENTE  -> RECHAZADO  (nadie las atendió: que se vuelvan a pedir
//                             desde Inventario -> Solicitudes)
//   RECIBIDO   -> CONFIRMADO (la tienda ya dijo cuánto llegó, solo faltaba
//                             el visto bueno: así se suma al stock como
//                             hubiera pasado)
//   EN_CAMINO  -> no se toca, salvo con --close-in-transit (no se sabe si
//                 el envío ya llegó; lo revisa una persona). Con la bandera
//                 pasan a RECHAZADO: si de verdad llegó, se corrige en
//                 Inventario -> Conteo.
//
// Por defecto es una SIMULACIÓN: solo imprime lo que haría. Para aplicar:
//   node prisma/close-legacy-stock-entries.mjs --apply
//   node prisma/close-legacy-stock-entries.mjs --apply --close-in-transit
//
// Idempotente: solo toca ENTRADA abiertas y sin solicitud nueva
// (`stockRequestId` vacío); correrlo dos veces no cambia nada la segunda.

import 'dotenv/config';
import pkg from '../src/generated/prisma/index.js';

const { PrismaClient, InventoryMovementType, InventoryMovementStatus } = pkg;
const prisma = new PrismaClient();

const SISTEMA = 'Sistema';
const REJECTION_REASON =
  'Flujo anterior de solicitudes: vuelve a pedirlo desde Inventario → Solicitudes. Si ya llegó, ajústalo en Conteo.';

const apply = process.argv.includes('--apply');
const closeInTransit = process.argv.includes('--close-in-transit');

async function main() {
  const open = await prisma.storeInventoryMovement.findMany({
    where: {
      type: InventoryMovementType.ENTRADA,
      stockRequestId: null,
      status: {
        in: [InventoryMovementStatus.PENDIENTE, InventoryMovementStatus.EN_CAMINO, InventoryMovementStatus.RECIBIDO],
      },
    },
  });

  const byStatus = (status) => open.filter((movement) => movement.status === status);
  const pending = byStatus(InventoryMovementStatus.PENDIENTE);
  const received = byStatus(InventoryMovementStatus.RECIBIDO);
  const inTransit = byStatus(InventoryMovementStatus.EN_CAMINO);

  console.log(apply ? 'MODO APLICAR' : 'SIMULACIÓN (agrega --apply para guardar)');
  console.log(`PENDIENTE  -> RECHAZADO : ${pending.length}`);
  console.log(`RECIBIDO   -> CONFIRMADO: ${received.length}`);
  console.log(
    `EN_CAMINO  -> ${closeInTransit ? 'RECHAZADO ' : 'sin tocar '}: ${inTransit.length}` +
      (closeInTransit || inTransit.length === 0 ? '' : '  (usa --close-in-transit para cerrarlas)'),
  );
  if (!apply) return;

  const now = new Date();
  const toReject = closeInTransit ? [...pending, ...inTransit] : pending;
  if (toReject.length > 0) {
    await prisma.storeInventoryMovement.updateMany({
      where: { id: { in: toReject.map((movement) => movement.id) } },
      data: {
        status: InventoryMovementStatus.RECHAZADO,
        resolvedByEmail: SISTEMA,
        resolvedAt: now,
        rejectionReason: REJECTION_REASON,
      },
    });
  }
  if (received.length > 0) {
    await prisma.storeInventoryMovement.updateMany({
      where: { id: { in: received.map((movement) => movement.id) } },
      data: { status: InventoryMovementStatus.CONFIRMADO, resolvedByEmail: SISTEMA, resolvedAt: now },
    });
  }
  console.log('Listo.');
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
