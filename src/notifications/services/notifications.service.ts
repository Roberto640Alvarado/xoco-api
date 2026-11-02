import { Injectable } from '@nestjs/common';
import { InventoryMovementStatus, InventoryMovementType, Role, StockRequestStatus } from '../../generated/prisma/index.js';
import type { AuthenticatedUser } from '../../common/interfaces/jwt-payload.interface.js';
import { OdooService } from '../../odoo/services/odoo.service.js';
import { InventoryMovementsService } from '../../inventory/services/inventory-movements.service.js';
import { StockRequestsService } from '../../stock-requests/services/stock-requests.service.js';

export type NotificationTone = 'info' | 'warning' | 'success' | 'danger';

export interface NotificationDoc {
  id: string;
  kind: 'request' | 'movement';
  tone: NotificationTone;
  title: string;
  description: string;
  /** Cuándo pasó (para ordenar y mostrar "hace 5 min"). */
  at: Date;
  /** Pantalla donde se atiende. */
  href: string;
}

const TYPE_LABEL: Record<InventoryMovementType, string> = {
  ENTRADA: 'Entrada',
  MERMA: 'Merma',
  REGALIA: 'Regalía',
  DEGUSTACION: 'Degustación',
  TRASLADO: 'Traslado',
};

const REQUESTS_HREF = '/dashboard/inventario/solicitudes';
const MOVEMENTS_HREF = '/dashboard/inventario/movimientos';
const MAX = 50;

const code = (number: number) => `SOL-${String(number).padStart(4, '0')}`;
const qty = (value: number) => (Number.isInteger(value) ? String(value) : value.toFixed(2));

// Campana de notificaciones del panel: junta, según el rol, las solicitudes
// de stock y los movimientos de inventario que piden atención (los mismos que
// cuentan los globos del menú), con un texto listo para mostrar.
@Injectable()
export class NotificationsService {
  constructor(
    private readonly requests: StockRequestsService,
    private readonly movements: InventoryMovementsService,
    private readonly odooService: OdooService,
  ) {}

  async find(user: AuthenticatedUser, sinceMovements?: Date): Promise<{ items: NotificationDoc[]; total: number }> {
    const [requests, movements] = await Promise.all([
      this.requests.findNotificationItems(user),
      this.movements.findNotificationItems(user, sinceMovements),
    ]);
    const storeNames = movements.length ? await this.storeNames() : new Map<number, string>();
    const items: NotificationDoc[] = [];

    for (const request of requests) {
      const products = request.lines.filter((line) => !line.addedByPlant).length;
      const productsText = `${products} producto${products === 1 ? '' : 's'}`;
      if (user.role === Role.PLANTA) {
        const toAnswer = request.status === StockRequestStatus.SOLICITADA;
        items.push({
          id: `request-${request.id}`,
          kind: 'request',
          tone: toAnswer ? 'warning' : 'info',
          title: toAnswer ? `Nueva solicitud de ${request.storeName}` : `Lista para despachar: ${code(request.number)}`,
          description: toAnswer ? `${code(request.number)} · ${productsText} · por responder` : `${request.storeName} · ${productsText} · en preparación`,
          at: request.updatedAt,
          href: REQUESTS_HREF,
        });
        continue;
      }
      // Vendedor
      if (request.status === StockRequestStatus.EN_CAMINO && request.posConfigId === user.posConfigId) {
        items.push({
          id: `request-${request.id}`,
          kind: 'request',
          tone: 'info',
          title: `Tu pedido ${code(request.number)} va en camino`,
          description: `Desde ${request.sourceName}. Confirma lo que llegó.`,
          at: request.updatedAt,
          href: REQUESTS_HREF,
        });
      } else {
        items.push({
          id: `request-${request.id}`,
          kind: 'request',
          tone: 'warning',
          title: `${request.storeName} te pide productos`,
          description: `${code(request.number)} · ${productsText} · ${request.status === StockRequestStatus.SOLICITADA ? 'por responder' : 'en preparación'}`,
          at: request.updatedAt,
          href: REQUESTS_HREF,
        });
      }
    }

    for (const movement of movements) {
      const label = TYPE_LABEL[movement.type];
      const what = `${movement.productName} · ${qty(movement.quantity)}`;
      if (movement.status === InventoryMovementStatus.PENDIENTE) {
        items.push({
          id: `movement-${movement.id}`,
          kind: 'movement',
          tone: 'warning',
          title: `${label} por confirmar en ${storeNames.get(movement.posConfigId) ?? `Tienda ${movement.posConfigId}`}`,
          description: `${what} · registró ${movement.registeredByEmail}`,
          at: movement.occurredAt,
          href: MOVEMENTS_HREF,
        });
      } else {
        const confirmed = movement.status === InventoryMovementStatus.CONFIRMADO;
        items.push({
          id: `movement-${movement.id}`,
          kind: 'movement',
          tone: confirmed ? 'success' : 'danger',
          title: confirmed ? `Confirmaron tu ${label.toLowerCase()}` : `Rechazaron tu ${label.toLowerCase()}`,
          description: confirmed ? what : `${what} · motivo: ${movement.rejectionReason ?? 'sin motivo'}`,
          at: movement.resolvedAt ?? movement.occurredAt,
          href: MOVEMENTS_HREF,
        });
      }
    }

    items.sort((a, b) => new Date(b.at).getTime() - new Date(a.at).getTime());
    return { items: items.slice(0, MAX), total: items.length };
  }

  private async storeNames(): Promise<Map<number, string>> {
    const configs = await this.odooService.findPosConfigs({ domain: [['active', '=', true]] });
    return new Map(configs.map((config) => [config.id, config.name]));
  }
}
