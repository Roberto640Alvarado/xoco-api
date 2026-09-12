import { Role } from '../../generated/prisma/index.js';
import { AuthenticatedUser } from '../interfaces/jwt-payload.interface.js';

// Punto único donde se aplica la regla de aislamiento por tienda de
// Vendedor (Fase 2 de RBAC): un Vendedor SOLO puede ver su propia
// tienda, sin importar qué `posConfigId` mande el cliente por query
// string — el valor pedido se ignora por completo y se reemplaza por el
// de `user.posConfigId` (que a su vez viene siempre de una relectura
// fresca de la base en JwtStrategy.validate, nunca del JWT firmado).
//
// Para cualquier otro rol (SUPER_ADMIN, FINANZAS) se respeta tal cual lo
// que pidió el cliente (incluyendo "sin filtro" = todas las tiendas).
export function scopedPosConfigId(user: AuthenticatedUser, requested?: number): number | undefined {
  if (user.role === Role.VENDEDOR) return user.posConfigId ?? undefined;
  return requested;
}
