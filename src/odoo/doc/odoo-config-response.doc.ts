import { ApiProperty } from '@nestjs/swagger';

// Nunca se expone el apiKey completo — ni al SUPER_ADMIN que lo consulta
// desde el panel. `apiKeyMasked` alcanza para confirmar "cuál key está
// activa" sin volver a mostrar el secreto completo (que de todos modos ya
// vio una vez al escribirlo).
export class OdooConfigResponseDoc {
  @ApiProperty({ example: '5c3c****...c391' })
  apiKeyMasked: string;

  @ApiProperty()
  uid: number;

  @ApiProperty()
  durationDays: number;

  @ApiProperty()
  expiresAt: Date;

  @ApiProperty()
  isExpired: boolean;

  @ApiProperty()
  isActive: boolean;

  @ApiProperty()
  updatedAt: Date;
}

// Una fila del historial de keys (Administración → Integración con Odoo).
export class OdooConfigHistoryItemDoc {
  @ApiProperty()
  id: string;

  @ApiProperty({ example: '5c3c****...c391' })
  apiKeyMasked: string;

  @ApiProperty()
  uid: number;

  @ApiProperty()
  durationDays: number;

  @ApiProperty({ description: 'Cuándo se registró la key.' })
  createdAt: Date;

  @ApiProperty()
  expiresAt: Date;

  @ApiProperty({ description: 'true solo en la key que usa el panel ahora.' })
  isActive: boolean;

  @ApiProperty()
  isExpired: boolean;

  @ApiProperty({ nullable: true, type: String })
  createdByEmail: string | null;
}

export function maskApiKey(apiKey: string): string {
  if (apiKey.length <= 8) {
    return '*'.repeat(apiKey.length);
  }
  return `${apiKey.slice(0, 4)}${'*'.repeat(Math.min(apiKey.length - 8, 10))}${apiKey.slice(-4)}`;
}
