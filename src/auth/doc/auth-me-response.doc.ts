import { Expose } from 'class-transformer';
import { ApiProperty } from '@nestjs/swagger';
import { UserResponseDoc } from '../../users/doc/user-response.doc.js';

// Extiende UserResponseDoc SOLO para la respuesta de GET /auth/me — no se
// toca UserResponseDoc en sí (compartido con GET/POST/PATCH /users) para
// no acoplar UsersModule con PermissionsModule sin necesidad: listar
// otros usuarios no necesita resolver su matriz de permisos.
//
// Una moduleKey AUSENTE en `permissions` se interpreta en el frontend
// como permitida (mismo default-allow que ModuleAccessGuard) — nunca
// como oculta.
export class AuthMeResponseDoc extends UserResponseDoc {
  @Expose()
  @ApiProperty({
    type: 'object',
    additionalProperties: { type: 'boolean' },
    description:
      'Permisos efectivos por moduleKey, solo para los módulos dentro del techo de @Roles() de este usuario. ' +
      'Una llave ausente se interpreta como permitida.',
  })
  permissions: Record<string, boolean>;
}
