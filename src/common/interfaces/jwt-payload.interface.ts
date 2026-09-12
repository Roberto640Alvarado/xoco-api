import { Role } from '../../generated/prisma/index.js';

// Payload firmado dentro del JWT (lo que emite AuthService.login).
export interface JwtPayload {
  sub: string;
  email: string;
  role: Role;
}

// Lo que JwtStrategy.validate() deja en request.user tras verificar el
// token — siempre re-consultado contra la base (ver JwtStrategy), nunca
// se confía ciegamente en lo firmado en el payload.
export interface AuthenticatedUser {
  id: string;
  email: string;
  role: Role;
  posConfigId: number | null;
}
