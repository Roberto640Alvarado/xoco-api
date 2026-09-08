// Script de seed inicial de Xocolatísimo API.
//
// Qué hace:
//   1. Crea (o rota, si ya existe) el documento de configuración de Odoo en
//      la colección `odoo_config`: guarda el API key y calcula su fecha de
//      expiración a partir de ODOO_UID/API_KEY_ODOO (leídos de .env) y una
//      duración de 30 días. A partir de aquí ese key SOLO vive en Mongo —
//      puedes borrar API_KEY_ODOO de tu .env cuando confirmes que corrió.
//   2. Crea el usuario SUPER_ADMIN inicial (o lo deja intacto si ya existe)
//      con el correo indicado. La contraseña se genera al azar si no la
//      diste por variable de entorno, y se imprime UNA sola vez en consola
//      — solo tú la ves, nunca se guarda en texto plano.
//
// Uso:
//   node prisma/seed.mjs
//
// Para fijar tú la contraseña del superadmin en vez de que se genere sola:
//   SEED_SUPERADMIN_PASSWORD="TuContraseñaSegura123!" node prisma/seed.mjs
//
// Re-ejecutable: si el superadmin ya existe, no lo toca (no pisa su
// contraseña); si el odoo_config ya existe, lo actualiza (rota la key y
// recalcula la expiración) — así este mismo script sirve para rotar la key
// más adelante mientras no haya UI en el panel.

import 'dotenv/config';
import { randomBytes } from 'node:crypto';
import bcrypt from 'bcryptjs';
import pkg from '../src/generated/prisma/index.js';

const { PrismaClient } = pkg;
const prisma = new PrismaClient();

const SUPERADMIN_EMAIL = 'xocoprojectsv@gmail.com';
const ODOO_DURATION_DAYS = 30;

function requireEnv(name) {
  const value = process.env[name];
  if (!value) {
    throw new Error(
      `Falta ${name} en tu .env — no se puede seedear sin este valor.`,
    );
  }
  return value;
}

function generatePassword() {
  // 24 caracteres en base64url — suficientemente fuerte para un password
  // temporal, y el usuario debería cambiarla desde su perfil apenas entre.
  return randomBytes(18).toString('base64url');
}

async function seedOdooConfig() {
  const apiKey = requireEnv('API_KEY_ODOO');
  const uid = Number(requireEnv('ODOO_UID'));
  const expiresAt = new Date(
    Date.now() + ODOO_DURATION_DAYS * 24 * 60 * 60 * 1000,
  );

  const existing = await prisma.odooConfig.findFirst({
    where: { isActive: true },
  });

  if (existing) {
    await prisma.odooConfig.update({
      where: { id: existing.id },
      data: { apiKey, uid, durationDays: ODOO_DURATION_DAYS, expiresAt },
    });
    console.log(
      `✔ odoo_config actualizado (rotado). Expira: ${expiresAt.toISOString()}`,
    );
  } else {
    await prisma.odooConfig.create({
      data: {
        apiKey,
        uid,
        durationDays: ODOO_DURATION_DAYS,
        expiresAt,
        isActive: true,
      },
    });
    console.log(
      `✔ odoo_config creado. Expira: ${expiresAt.toISOString()} (${ODOO_DURATION_DAYS} días)`,
    );
  }
}

async function seedSuperAdmin() {
  const existing = await prisma.user.findUnique({
    where: { email: SUPERADMIN_EMAIL },
  });

  if (existing) {
    console.log(
      `— Usuario ${SUPERADMIN_EMAIL} ya existe (rol: ${existing.role}). No se modifica su contraseña.`,
    );
    return;
  }

  const plainPassword =
    process.env.SEED_SUPERADMIN_PASSWORD || generatePassword();
  const hashed = await bcrypt.hash(plainPassword, 12);

  await prisma.user.create({
    data: {
      email: SUPERADMIN_EMAIL,
      password: hashed,
      role: 'SUPER_ADMIN',
      isActive: true,
    },
  });

  console.log(`✔ Usuario SUPER_ADMIN creado: ${SUPERADMIN_EMAIL}`);
  console.log(`  Contraseña (guárdala ahora, no se vuelve a mostrar):`);
  console.log(`  ${plainPassword}`);
}

async function main() {
  await seedOdooConfig();
  await seedSuperAdmin();
}

main()
  .catch((error) => {
    console.error('✖ Seed falló:', error.message);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
