// Script de DIAGNÓSTICO (no forma parte de la app): busca en Odoo productos
// por nombre y muestra por qué la API los ve o no — si el producto (plantilla)
// y su variante están activos, a qué compañía pertenecen y si el usuario del
// API key puede verlos. Solo lee; no escribe nada en Odoo.
//
// Uso:
//   node scripts/inspect-odoo-product.mjs "love"   -> busca por nombre
//   node scripts/inspect-odoo-product.mjs 316      -> un producto por su id (el número de la URL en Odoo)
//
// Usa las mismas credenciales que la API (API key en Mongo, ODOO_BASE_URL y
// ODOO_DB del .env), igual que scripts/inspect-odoo-stock.mjs.

import 'dotenv/config';
import axios from 'axios';
import pkg from '../src/generated/prisma/index.js';

const { PrismaClient } = pkg;
const prisma = new PrismaClient();
const term = process.argv[2] ?? 'love';

async function main() {
  const baseUrl = process.env.ODOO_BASE_URL;
  const db = process.env.ODOO_DB;
  if (!baseUrl || !db) throw new Error('Falta ODOO_BASE_URL o ODOO_DB en tu .env');
  const config = await prisma.odooConfig.findFirst({ where: { isActive: true }, orderBy: { updatedAt: 'desc' } });
  if (!config) throw new Error('No hay un OdooConfig activo en Mongo.');
  const { uid, apiKey } = config;
  let requestId = 0;

  async function call(model, method, args, kwargs = {}) {
    const response = await axios.post(baseUrl, {
      jsonrpc: '2.0',
      method: 'call',
      params: { service: 'object', method: 'execute_kw', args: [db, uid, apiKey, model, method, args, kwargs] },
      id: ++requestId,
    });
    if (response.data.error) throw new Error(`Odoo ${model}.${method}: ${response.data.error.data?.message ?? response.data.error.message}`);
    return response.data.result;
  }

  const [user] = await call('res.users', 'read', [[uid]], { fields: ['name', 'login', 'company_id', 'company_ids', 'lang'] });
  console.log(`\nUsuario del API key: ${user.name} (${user.login})`);
  console.log(`  Compañía actual: ${user.company_id?.[1]}`);
  console.log(`  Compañías permitidas: ${user.company_ids.length}`);
  console.log(`  Idioma del usuario: ${user.lang}`);

  // Por id: el nombre tal como lo ve la API (sin idioma = inglés) y en el idioma del usuario.
  if (/^\d+$/.test(term)) {
    const id = Number(term);
    const fields = ['id', 'name', 'active', 'company_id', 'product_variant_ids'];
    const [plain] = await call('product.template', 'read', [[id]], { fields, context: { active_test: false } });
    const [translated] = await call('product.template', 'read', [[id]], { fields: ['name'], context: { active_test: false, lang: user.lang } });
    console.log(`\nProducto ${id}:`);
    console.log(`  Nombre que ve la API (inglés):   ${plain?.name}`);
    console.log(`  Nombre en ${user.lang}:            ${translated?.name}`);
    console.log(`  activo=${plain?.active} · compañía=${plain?.company_id ? plain.company_id[1] : '(todas)'} · variantes=${plain?.product_variant_ids}`);
    if (plain && translated && plain.name !== translated.name) {
      console.log('\n=> El nombre cambia según el idioma: la API lo está viendo con el nombre en inglés.');
    }
    return;
  }

  const withArchived = { context: { active_test: false } };
  const templates = await call('product.template', 'search_read', [[['name', 'ilike', term]]], {
    fields: ['id', 'name', 'active', 'company_id', 'categ_id', 'available_in_pos', 'sale_ok', 'product_variant_ids'],
    ...withArchived,
  });
  console.log(`\nProductos (plantillas) que la API VE con "${term}": ${templates.length}`);
  for (const t of templates) {
    console.log(
      `  [${t.id}] ${t.name} · activo=${t.active} · compañía=${t.company_id ? t.company_id[1] : '(todas)'} · categoría=${t.categ_id?.[1]} · en POS=${t.available_in_pos} · variantes=${t.product_variant_ids.length}`,
    );
  }

  const variants = await call('product.product', 'search_read', [[['name', 'ilike', term]]], {
    fields: ['id', 'display_name', 'active', 'company_id'],
    ...withArchived,
  });
  console.log(`\nVariantes (lo que usa el catálogo del panel) con "${term}": ${variants.length}`);
  for (const v of variants) {
    console.log(`  [${v.id}] ${v.display_name} · activa=${v.active} · compañía=${v.company_id ? v.company_id[1] : '(todas)'}`);
  }

  const activeVariants = await call('product.product', 'search_count', [[['name', 'ilike', term]]]);
  console.log(`\nVariantes ACTIVAS visibles para la API: ${activeVariants}`);
  console.log(
    '\nSi aquí no aparecen pero en Odoo sí: el producto es de una compañía que el usuario del API key no tiene permitida.\n' +
      'Si aparecen con activo/activa=false: está archivado (la plantilla o solo la variante).\n',
  );
}

main()
  .catch((error) => {
    console.error(error.message ?? error);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
