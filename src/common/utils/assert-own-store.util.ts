import { ForbiddenException } from '@nestjs/common';
import { Role } from '../../generated/prisma/index.js';
import { AuthenticatedUser } from '../interfaces/jwt-payload.interface.js';

// Complemento de scopedPosConfigId para endpoints donde la tienda va en
// la URL (path param), no en un query opcional — ahí no se puede
// "reemplazar en silencio" lo que pidió el cliente (el :posConfigId ya
// quedó fijo en la ruta), así que un Vendedor pidiendo la tienda de
// OTRO simplemente se rechaza con 403, en vez de redirigirlo a la suya.
// Para SUPER_ADMIN/FINANZAS nunca rechaza (sin restricción de tienda).
export function assertOwnStoreOrThrow(user: AuthenticatedUser, posConfigId: number): void {
  if (user.role !== Role.VENDEDOR) return;
  if (user.posConfigId === posConfigId) return;
  throw new ForbiddenException('No tenés acceso a esta tienda.');
}
