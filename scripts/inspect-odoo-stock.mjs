// Script EXPLORATORIO (no forma parte de la app) para ver qué hay
// disponible en Odoo para diseñar el módulo de Inventario antes de
// escribir nada: bodegas (stock.warehouse), qué bodega tiene cada tienda
// (pos.config.warehouse_id, ya lo usa OdooRepository.findPosConfigs),
// existencias (stock.quant), movimientos (stock.move.line — la materia
// prima del "Kardex") y tipos de operación (stock.picking.type, para ver
// si ya existe algo tipo "Planta -> Tienda").
//
// Usa las MISMAS credenciales que ya usa la API en producción: el API
// key vive en Mongo (colección odoo_config, vía Prisma), y
// ODOO_BASE_URL/ODOO_DB salen de tu .env — mismo patrón que
// prisma/backfill-role-module-access.mjs (node puro, sin compilar TS).
//
// Uso:
//   node scripts/inspect-odoo-stock.mjs
//
// Nota: esto es solo para leer/inspeccionar — ningún search_read de acá
// escribe nada en Odoo.

import 'dotenv/config';
import axios from 'axios';
import pkg from '../src/generated/prisma/index.js';

const { PrismaClient } = pkg;
const prisma = new PrismaClient();

async function main() {
  const baseUrl = process.env.ODOO_BASE_URL;
  const db = process.env.ODOO_DB;
  if (!baseUrl || !db) {
    throw new Error('Falta ODOO_BASE_URL o ODOO_DB en tu .env');
  }

  const config = await prisma.odooConfig.findFirst({
    where: { isActive: true },
    orderBy: { updatedAt: 'desc' },
  });
  if (!config) throw new Error('No hay un OdooConfig activo en Mongo (odoo_config).');
  if (config.expiresAt.getTime() <= Date.now()) {
    console.warn('⚠️  El API key de Odoo está vencido — esto probablemente va a fallar. Rótalo desde el panel primero.');
  }

  const { uid, apiKey } = config;
  let requestId = 0;

  async function executeKw(model, method, args, kwargs = {}) {
    const response = await axios.post(baseUrl, {
      jsonrpc: '2.0',
      method: 'call',
      params: { service: 'object', method: 'execute_kw', args: [db, uid, apiKey, model, method, args, kwargs] },
      id: ++requestId,
    });
    if (response.data.error) {
      throw new Error(`Odoo [${response.data.error.code}] ${model}.${method}: ${response.data.error.message}`);
    }
    return response.data.result;
  }

  console.log('\n=== Bodegas (stock.warehouse) ===');
  const warehouses = await executeKw('stock.warehouse', 'search_read', [[]], {
    fields: ['id', 'name', 'code', 'lot_stock_id'],
    limit: 50,
  });
  console.table(warehouses.map((w) => ({ id: w.id, name: w.name, code: w.code, lot_stock: w.lot_stock_id?.[1] })));

  console.log('\n=== Tiendas -> bodega (pos.config) ===');
  const posConfigs = await executeKw('pos.config', 'search_read', [[]], {
    fields: ['id', 'name', 'warehouse_id', 'active'],
    limit: 50,
  });
  console.table(posConfigs.map((p) => ({ id: p.id, name: p.name, warehouse: p.warehouse_id?.[1] ?? '(sin warehouse_id)', active: p.active })));

  console.log('\n=== Existencias con stock > 0 (stock.quant) — muestra de 10 ===');
  const quants = await executeKw('stock.quant', 'search_read', [[['quantity', '>', 0]]], {
    fields: ['id', 'product_id', 'location_id', 'warehouse_id', 'quantity', 'reserved_quantity'],
    limit: 10,
  });
  console.table(quants.map((q) => ({
    product: q.product_id?.[1],
    location: q.location_id?.[1],
    warehouse: q.warehouse_id?.[1] ?? '(sin warehouse_id)',
    quantity: q.quantity,
    reserved: q.reserved_quantity,
  })));

  console.log('\n=== Movimientos más recientes (stock.move.line) — muestra de 10 ===');
  const moveLines = await executeKw('stock.move.line', 'search_read', [[]], {
    fields: ['id', 'product_id', 'location_id', 'location_dest_id', 'qty_done', 'date', 'reference', 'picking_id'],
    order: 'date desc',
    limit: 10,
  });
  console.table(moveLines.map((m) => ({
    date: m.date,
    product: m.product_id?.[1],
    from: m.location_id?.[1],
    to: m.location_dest_id?.[1],
    qty: m.qty_done,
    picking: m.picking_id?.[1] ?? '—',
    reference: m.reference,
  })));

  console.log('\n=== Tipos de operación (stock.picking.type) — ¿ya existe algo tipo "Planta -> Tienda"? ===');
  const pickingTypes = await executeKw('stock.picking.type', 'search_read', [[]], {
    fields: ['id', 'name', 'code', 'warehouse_id'],
    limit: 50,
  });
  console.table(pickingTypes.map((t) => ({ id: t.id, name: t.name, code: t.code, warehouse: t.warehouse_id?.[1] ?? '—' })));
}

main()
  .catch((error) => {
    console.error('\n❌', error.message);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
