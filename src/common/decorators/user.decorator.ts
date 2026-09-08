import { createParamDecorator, ExecutionContext } from '@nestjs/common';
import type { Request } from 'express';
import { AuthenticatedUser } from '../interfaces/jwt-payload.interface.js';

interface RequestWithUser extends Request {
  user: AuthenticatedUser;
}

/**
 * Extrae el usuario autenticado inyectado por JwtStrategy en request.user.
 * Uso: @User() user: AuthenticatedUser
 * Uso con propiedad: @User('id') userId: string
 */
export const User = createParamDecorator(
  (data: keyof AuthenticatedUser | undefined, ctx: ExecutionContext) => {
    const request = ctx.switchToHttp().getRequest<RequestWithUser>();
    const user = request.user;

    return data ? user?.[data] : user;
  },
);
