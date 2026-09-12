import { ApiProperty } from '@nestjs/swagger';
import { AuthMeResponseDoc } from './auth-me-response.doc.js';

export class AuthResponseDoc {
  @ApiProperty()
  accessToken: string;

  // Incluye `permissions` desde el login (no solo desde GET /auth/me):
  // el frontend puebla el store de sesión con este objeto directo tras
  // iniciar sesión, sin esperar a la próxima hidratación (ver
  // useLogin()/setSession en xoco-app) — si faltara acá, un usuario
  // recién logueado se quedaría sin `permissions` hasta refrescar.
  @ApiProperty({ type: AuthMeResponseDoc })
  user: AuthMeResponseDoc;
}
