import { IsIn } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export const MOVEMENTS_INBOX_KINDS = ['requests', 'movements'] as const;
export type MovementsInboxKind = (typeof MOVEMENTS_INBOX_KINDS)[number];

export class FindMovementsInboxQueryDto {
  @ApiProperty({
    enum: MOVEMENTS_INBOX_KINDS,
    description:
      '"requests": solicitudes de stock (ENTRADA) abiertas — PENDIENTE, EN_CAMINO o RECIBIDO. "movements": merma/regalía/degustación PENDIENTES.',
  })
  @IsIn(MOVEMENTS_INBOX_KINDS)
  kind: MovementsInboxKind;
}
