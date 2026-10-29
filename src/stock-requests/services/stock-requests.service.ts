import { BadRequestException, ConflictException, ForbiddenException, Injectable, Logger } from '@nestjs/common';
import { OdooService } from '../../odoo/services/odoo.service.js';
import { InventoryMovementsService } from '../../inventory/services/inventory-movements.service.js';
import { InventoryAccessService } from '../../inventory/services/inventory-access.service.js';
import { fetchAllOdooPages } from '../../common/utils/odoo-pagination.util.js';
import { isWeightUom } from '../../common/utils/product-uom.util.js';
import { productCategoryName } from '../../common/utils/product-category.util.js';
import { assertOwnStoreOrThrow } from '../../common/utils/assert-own-store.util.js';
import type { AuthenticatedUser } from '../../common/interfaces/jwt-payload.interface.js';
import { Role, StockRequestStatus, StoreStockRequest } from '../../generated/prisma/index.js';
import { StockRequestsRepository } from '../repositories/stock-requests.repository.js';
import { CreateStockRequestDto } from '../dto/create-stock-request.dto.js';
import { SavePlantResponseDto } from '../dto/save-plant-response.dto.js';
import { ReceiveStockRequestDto } from '../dto/receive-stock-request.dto.js';
import { CancelStockRequestDto } from '../dto/cancel-stock-request.dto.js';
import { FindStockRequestsQueryDto } from '../dto/find-stock-requests-query.dto.js';
import {
  StockRequestCatalogItemDoc,
  StockRequestDoc,
  StockRequestNotificationsDoc,
} from '../doc/stock-request.doc.js';
import {
  OPEN_STATUSES,
  PLANT_EDITABLE_STATUSES,
  canCancel,
  dispatchKind,
  formatRequestCode,
  roundQuantity,
} from '../utils/stock-request-flow.util.js';

type RequestLine = StoreStockRequest['lines'][number];
type RequestEvent = StoreStockRequest['events'][number];
type Unit = 'unidad' | 'kg';

const CATALOG_TTL_MS = 60_000;
const STORES_TTL_MS = 5 * 60_000;
const STALE_MESSAGE = 'La solicitud cambió mientras la editabas. Recarga para ver lo último.';

// Solicitudes de stock tienda -> planta -> tienda (ver el modelo
// StoreStockRequest en schema.prisma para el flujo completo):
//
//   Tienda pide -> Planta toma, responde (qué sí / qué no / qué agrega) y
//   despacha -> Tienda confirma lo que llegó -> el stock se suma a la tienda.
//
// Admin/Finanzas solo ven el seguimiento (y pueden cancelar); actualizar el
// inventario a mano sigue siendo el Conteo. Aquí vive TODA la lógica de
// permisos por estado y por rol; el controller solo valida la entrada.
@Injectable()
export class StockRequestsService {
  private readonly logger = new Logger(StockRequestsService.name);
  private catalogCache: { items: StockRequestCatalogItemDoc[]; expiresAt: number } | null = null;
  private storesCache: { names: Map<number, string>; expiresAt: number } | null = null;

  constructor(
    private readonly repository: StockRequestsRepository,
    private readonly odooService: OdooService,
    private readonly movementsService: InventoryMovementsService,
    private readonly accessService: InventoryAccessService,
  ) {}

  // ---------------------------------------------------------------------
  // Catálogo y nombres (Odoo)
  // ---------------------------------------------------------------------

  // Todo producto activo con su categoría y unidad — lo que la tienda elige
  // al pedir y planta al agregar. Se guarda un minuto en memoria: abrir el
  // modal varias veces seguidas no vuelve a recorrer el catálogo de Odoo.
  async findCatalog(): Promise<StockRequestCatalogItemDoc[]> {
    const now = Date.now();
    if (this.catalogCache && this.catalogCache.expiresAt > now) return this.catalogCache.items;

    const products = await fetchAllOdooPages(
      (options) => this.odooService.findProducts(options),
      [],
      'StockRequestsService.findCatalog',
      this.logger,
    );
    const items = products
      .map(
        (product): StockRequestCatalogItemDoc => ({
          productId: product.id,
          productName: product.display_name,
          categoryName: productCategoryName(product.categ_id),
          unit: isWeightUom(product.uom_id) ? 'kg' : 'unidad',
        }),
      )
      .sort(
        (a, b) => a.categoryName.localeCompare(b.categoryName, 'es') || a.productName.localeCompare(b.productName, 'es'),
      );
    this.catalogCache = { items, expiresAt: now + CATALOG_TTL_MS };
    return items;
  }

  private async findStoreNames(): Promise<Map<number, string>> {
    const now = Date.now();
    if (this.storesCache && this.storesCache.expiresAt > now) return this.storesCache.names;
    const configs = await this.odooService.findPosConfigs({ domain: [['active', '=', true]] });
    const names = new Map(configs.map((config) => [config.id, config.name]));
    this.storesCache = { names, expiresAt: now + STORES_TTL_MS };
    return names;
  }

  // Productos pedidos por id, validados contra el catálogo: nadie puede
  // meter en una solicitud un producto que Odoo no conoce.
  private async resolveProducts(productIds: number[]): Promise<Map<number, StockRequestCatalogItemDoc>> {
    const catalog = await this.findCatalog();
    const byId = new Map(catalog.map((item) => [item.productId, item]));
    const missing = productIds.filter((id) => !byId.has(id));
    if (missing.length > 0) {
      throw new BadRequestException(`Hay productos que ya no existen en el catálogo (id ${missing.join(', ')}).`);
    }
    return byId;
  }

  // ---------------------------------------------------------------------
  // Armado de la respuesta
  // ---------------------------------------------------------------------

  private toDoc(request: StoreStockRequest, storeNames: Map<number, string>): StockRequestDoc {
    const lines = request.lines.map((line) => ({
      productId: line.productId,
      productName: line.productName,
      categoryName: line.categoryName,
      unit: line.unit as Unit,
      requestedQuantity: line.requestedQuantity,
      sentQuantity: line.sentQuantity,
      receivedQuantity: line.receivedQuantity,
      difference:
        line.sentQuantity !== null && line.receivedQuantity !== null
          ? roundQuantity(line.receivedQuantity - line.sentQuantity)
          : null,
      addedByPlant: line.addedByPlant,
      replacesProductId: line.replacesProductId ?? null,
      plantNote: line.plantNote,
      storeNote: line.storeNote,
    }));

    const dispatched = request.dispatchedAt !== null;
    const cancelEvent = [...request.events].reverse().find((event) => event.status === StockRequestStatus.CANCELADA);

    return {
      id: request.id,
      number: request.number,
      code: formatRequestCode(request.number),
      posConfigId: request.posConfigId,
      storeName: storeNames.get(request.posConfigId) ?? `Tienda ${request.posConfigId}`,
      status: request.status,
      note: request.note,
      createdByEmail: request.createdByEmail,
      createdAt: request.createdAt,
      updatedAt: request.updatedAt,
      dispatchedAt: request.dispatchedAt,
      receivedAt: request.receivedAt,
      dispatch: dispatched ? dispatchKind(request.lines) : null,
      cancelReason: cancelEvent?.note ?? null,
      lines,
      events: request.events.map((event) => ({
        status: event.status,
        at: event.at,
        byEmail: event.byEmail,
        byRole: event.byRole,
        note: event.note,
      })),
    };
  }

  private async toDocs(requests: StoreStockRequest[]): Promise<StockRequestDoc[]> {
    const storeNames = await this.findStoreNames();
    return requests.map((request) => this.toDoc(request, storeNames));
  }

  private async toDocOne(request: StoreStockRequest): Promise<StockRequestDoc> {
    return (await this.toDocs([request]))[0];
  }

  // ---------------------------------------------------------------------
  // Permisos y utilidades
  // ---------------------------------------------------------------------

  // Una tienda solo toca lo suyo, y solo si Inventario está habilitado
  // para ella. Planta, Admin y Finanzas ven todas las tiendas.
  private async assertCanAccess(user: AuthenticatedUser, request: StoreStockRequest): Promise<void> {
    assertOwnStoreOrThrow(user, request.posConfigId);
    await this.accessService.assertEnabledFor(user, request.posConfigId);
  }

  private async loadFor(id: string, user: AuthenticatedUser): Promise<StoreStockRequest> {
    const request = await this.repository.findByIdOrThrow(id);
    await this.assertCanAccess(user, request);
    return request;
  }

  private assertStatus(request: StoreStockRequest, allowed: StockRequestStatus[], message: string): void {
    if (!allowed.includes(request.status)) throw new BadRequestException(message);
  }

  private event(user: AuthenticatedUser, status: StockRequestStatus, note?: string | null): RequestEvent {
    return { status, at: new Date(), byEmail: user.email, byRole: user.role, note: note?.trim() || null };
  }

  private assertQuantity(unit: string, quantity: number, productName: string): void {
    if (unit === 'unidad' && !Number.isInteger(quantity)) {
      throw new BadRequestException(`"${productName}" se cuenta por pieza: la cantidad debe ser un número entero.`);
    }
  }

  private async save(
    current: StoreStockRequest,
    data: Parameters<StockRequestsRepository['updateIfUnchanged']>[1],
  ): Promise<StockRequestDoc> {
    const saved = await this.repository.updateIfUnchanged(current, { ...data, updatedAt: new Date() });
    if (!saved) throw new ConflictException(STALE_MESSAGE);
    return this.toDocOne(await this.repository.findByIdOrThrow(current.id));
  }

  // ---------------------------------------------------------------------
  // Consultas
  // ---------------------------------------------------------------------

  async findMany(query: FindStockRequestsQueryDto, user: AuthenticatedUser): Promise<StockRequestDoc[]> {
    let posConfigId = query.posConfigId;
    if (user.role === Role.VENDEDOR) {
      if (user.posConfigId == null) throw new ForbiddenException('Tu usuario no tiene una tienda asignada.');
      await this.accessService.assertEnabledFor(user, user.posConfigId);
      posConfigId = user.posConfigId;
    }

    const requests = await this.repository.findMany({
      status: query.status,
      posConfigId,
      createdFrom: query.dateFrom ? new Date(`${query.dateFrom.slice(0, 10)}T00:00:00.000Z`) : undefined,
      createdTo: query.dateTo ? new Date(`${query.dateTo.slice(0, 10)}T23:59:59.999Z`) : undefined,
    });
    return this.toDocs(requests);
  }

  async findOne(id: string, user: AuthenticatedUser): Promise<StockRequestDoc> {
    return this.toDocOne(await this.loadFor(id, user));
  }

  // El globo del menú: lo que ESTE usuario tiene que atender. Admin y
  // Finanzas no tienen nada "por atender": solo supervisan.
  async findNotifications(user: AuthenticatedUser): Promise<StockRequestNotificationsDoc> {
    if (user.role === Role.PLANTA) {
      return { pending: await this.repository.count(PLANT_EDITABLE_STATUSES) };
    }
    if (user.role === Role.VENDEDOR) {
      if (user.posConfigId == null || !(await this.accessService.isEnabledFor(user, user.posConfigId))) {
        return { pending: 0 };
      }
      return { pending: await this.repository.count([StockRequestStatus.EN_CAMINO], user.posConfigId) };
    }
    return { pending: 0 };
  }

  // ---------------------------------------------------------------------
  // 1. La tienda pide
  // ---------------------------------------------------------------------

  async create(dto: CreateStockRequestDto, user: AuthenticatedUser): Promise<StockRequestDoc> {
    if (user.posConfigId == null) throw new ForbiddenException('Tu usuario no tiene una tienda asignada.');
    await this.accessService.assertEnabledFor(user, user.posConfigId);

    const productIds = dto.lines.map((line) => line.productId);
    if (new Set(productIds).size !== productIds.length) {
      throw new BadRequestException('Hay productos repetidos en la solicitud: junta las cantidades en una sola línea.');
    }
    const catalog = await this.resolveProducts(productIds);

    const lines: RequestLine[] = dto.lines.map((input) => {
      const product = catalog.get(input.productId) as StockRequestCatalogItemDoc;
      this.assertQuantity(product.unit, input.quantity, product.productName);
      return {
        productId: product.productId,
        productName: product.productName,
        categoryName: product.categoryName,
        unit: product.unit,
        requestedQuantity: roundQuantity(input.quantity),
        sentQuantity: null,
        receivedQuantity: null,
        addedByPlant: false,
        replacesProductId: null,
        plantNote: null,
        storeNote: null,
      };
    });

    const request = await this.repository.create({
      number: await this.repository.nextNumber(),
      posConfigId: user.posConfigId,
      status: StockRequestStatus.SOLICITADA,
      note: dto.note?.trim() || null,
      lines,
      events: [this.event(user, StockRequestStatus.SOLICITADA)],
      createdByEmail: user.email,
    });
    return this.toDocOne(request);
  }

  // ---------------------------------------------------------------------
  // 2. Planta toma, responde y despacha
  // ---------------------------------------------------------------------

  // Planta abre la solicitud para trabajarla: la tienda ve que ya la tomaron.
  async start(id: string, user: AuthenticatedUser): Promise<StockRequestDoc> {
    const request = await this.loadFor(id, user);
    this.assertStatus(request, [StockRequestStatus.SOLICITADA], 'Esta solicitud ya fue tomada o resuelta.');
    return this.save(request, {
      status: StockRequestStatus.EN_PREPARACION,
      events: { set: [...request.events, this.event(user, StockRequestStatus.EN_PREPARACION)] },
    });
  }

  // Aplica la respuesta de planta sobre las líneas del pedido (ver
  // SavePlantResponseDto) y devuelve las líneas resultantes.
  private async applyPlantResponse(request: StoreStockRequest, dto: SavePlantResponseDto): Promise<RequestLine[]> {
    const inputs = new Map<number, SavePlantResponseDto['lines'][number]>();
    for (const input of dto.lines) {
      if (inputs.has(input.productId)) {
        throw new BadRequestException('Hay productos repetidos en la respuesta.');
      }
      inputs.set(input.productId, input);
    }

    const existingById = new Map(request.lines.map((line) => [line.productId, line]));
    const newProductIds = [...inputs.values()]
      .filter((input) => !existingById.has(input.productId))
      .map((input) => input.productId);
    const catalog = newProductIds.length > 0 ? await this.resolveProducts(newProductIds) : new Map();

    const lines: RequestLine[] = [];
    for (const line of request.lines) {
      const input = inputs.get(line.productId);
      // Una línea que planta agregó y ya no viene en su lista = la quitó.
      if (line.addedByPlant && !input) continue;
      if (!input) {
        lines.push(line);
        continue;
      }
      lines.push(this.withPlantInput(line, input));
    }
    for (const productId of newProductIds) {
      const input = inputs.get(productId) as SavePlantResponseDto['lines'][number];
      if (!input.added) {
        throw new BadRequestException('Para agregar un producto que la tienda no pidió, márcalo como agregado.');
      }
      const product = catalog.get(productId) as StockRequestCatalogItemDoc;
      lines.push(
        this.withPlantInput(
          {
            productId: product.productId,
            productName: product.productName,
            categoryName: product.categoryName,
            unit: product.unit,
            requestedQuantity: 0,
            sentQuantity: null,
            receivedQuantity: null,
            addedByPlant: true,
            replacesProductId: null,
            plantNote: null,
            storeNote: null,
          },
          input,
        ),
      );
    }
    this.assertReplacements(lines);
    return lines;
  }

  private withPlantInput(line: RequestLine, input: SavePlantResponseDto['lines'][number]): RequestLine {
    const sent = input.sentQuantity ?? null;
    if (sent !== null) this.assertQuantity(line.unit, sent, line.productName);
    const replacesProductId = input.replacesProductId ?? null;
    if (replacesProductId !== null && !line.addedByPlant) {
      throw new BadRequestException(`"${line.productName}" lo pidió la tienda: solo un producto agregado puede ir en lugar de otro.`);
    }
    return {
      ...line,
      sentQuantity: sent === null ? null : roundQuantity(sent),
      replacesProductId: line.addedByPlant ? replacesProductId : null,
      plantNote: input.note?.trim() || null,
    };
  }

  // Un sustituto ("en lugar de") siempre apunta a un producto que la tienda
  // SÍ pidió en esta solicitud — nunca a otro agregado ni a algo ajeno.
  private assertReplacements(lines: RequestLine[]): void {
    const requestedIds = new Set(lines.filter((line) => !line.addedByPlant).map((line) => line.productId));
    for (const line of lines) {
      if (line.replacesProductId == null) continue;
      if (!requestedIds.has(line.replacesProductId)) {
        throw new BadRequestException(`"${line.productName}" va en lugar de un producto que la tienda no pidió en esta solicitud.`);
      }
    }
  }

  // Guarda el avance de planta sin despachar (puede seguir mañana). La
  // primera vez, además, toma la solicitud.
  async savePlantResponse(id: string, dto: SavePlantResponseDto, user: AuthenticatedUser): Promise<StockRequestDoc> {
    const request = await this.loadFor(id, user);
    this.assertStatus(request, PLANT_EDITABLE_STATUSES, 'Esta solicitud ya no se puede modificar.');
    const lines = await this.applyPlantResponse(request, dto);

    const events =
      request.status === StockRequestStatus.SOLICITADA
        ? [...request.events, this.event(user, StockRequestStatus.EN_PREPARACION)]
        : request.events;
    return this.save(request, { status: StockRequestStatus.EN_PREPARACION, lines: { set: lines }, events: { set: events } });
  }

  // Despacha: cada línea debe estar respondida (0 = "no hay") y algo tiene
  // que salir. Queda EN_CAMINO y la tienda recibe el aviso.
  async dispatch(id: string, dto: SavePlantResponseDto, user: AuthenticatedUser): Promise<StockRequestDoc> {
    const request = await this.loadFor(id, user);
    this.assertStatus(request, PLANT_EDITABLE_STATUSES, 'Esta solicitud ya fue despachada o resuelta.');
    const lines = await this.applyPlantResponse(request, dto);

    const unanswered = lines.filter((line) => line.sentQuantity === null);
    if (unanswered.length > 0) {
      throw new BadRequestException(
        `Falta responder ${unanswered.length} producto${unanswered.length === 1 ? '' : 's'} (pon 0 si no hay).`,
      );
    }
    if (!lines.some((line) => (line.sentQuantity ?? 0) > 0)) {
      throw new BadRequestException('No hay nada que enviar. Si no tienes nada de lo pedido, cancela la solicitud con el motivo.');
    }

    const kind = dispatchKind(lines);
    const dispatchedAt = new Date();
    const note = [kind === 'COMPLETO' ? 'Despacho completo' : 'Despacho parcial', dto.note?.trim()]
      .filter(Boolean)
      .join('. ');
    return this.save(request, {
      status: StockRequestStatus.EN_CAMINO,
      lines: { set: lines },
      dispatchedAt,
      events: { set: [...request.events, { ...this.event(user, StockRequestStatus.EN_CAMINO, note), at: dispatchedAt }] },
    });
  }

  // ---------------------------------------------------------------------
  // 3. La tienda confirma lo que llegó
  // ---------------------------------------------------------------------

  async receive(id: string, dto: ReceiveStockRequestDto, user: AuthenticatedUser): Promise<StockRequestDoc> {
    const request = await this.loadFor(id, user);
    this.assertStatus(request, [StockRequestStatus.EN_CAMINO], 'Esta solicitud no está en camino: no se puede confirmar la recepción.');

    const inputs = new Map(dto.lines.map((input) => [input.productId, input]));
    if (inputs.size !== dto.lines.length) throw new BadRequestException('Hay productos repetidos en la recepción.');

    const lines: RequestLine[] = request.lines.map((line) => {
      const sent = line.sentQuantity ?? 0;
      // Lo que planta no envió no se recibe: queda en 0 sin preguntarle nada a la tienda.
      if (sent <= 0) return { ...line, receivedQuantity: 0 };

      const input = inputs.get(line.productId);
      if (!input) throw new BadRequestException(`Falta confirmar lo recibido de "${line.productName}".`);
      this.assertQuantity(line.unit, input.receivedQuantity, line.productName);
      const received = roundQuantity(input.receivedQuantity);
      const note = input.note?.trim() || null;
      if (received !== sent && !note) {
        throw new BadRequestException(`Explica la diferencia de "${line.productName}" (se envió ${sent} y recibiste ${received}).`);
      }
      return { ...line, receivedQuantity: received, storeNote: note };
    });

    const receivedAt = new Date();
    const hasDifferences = lines.some((line) => (line.receivedQuantity ?? 0) !== (line.sentQuantity ?? 0));
    const note = [hasDifferences ? 'Recibida con diferencias' : 'Recibida completa', dto.note?.trim()]
      .filter(Boolean)
      .join('. ');
    const doc = await this.save(request, {
      status: StockRequestStatus.RECIBIDA,
      lines: { set: lines },
      receivedAt,
      events: { set: [...request.events, { ...this.event(user, StockRequestStatus.RECIBIDA, note), at: receivedAt }] },
    });

    // Recién ahora, con la recepción ya guardada (y por eso imposible de
    // repetir), el stock sube. Si esto falla se avisa: el Conteo del Admin
    // sigue siendo la forma de corregir el inventario a mano.
    const entries = lines
      .filter((line) => (line.receivedQuantity ?? 0) > 0)
      .map((line) => ({ productId: line.productId, quantity: line.receivedQuantity as number }));
    try {
      await this.movementsService.createConfirmedEntries({
        posConfigId: request.posConfigId,
        stockRequestId: request.id,
        note: `Solicitud ${formatRequestCode(request.number)}`,
        occurredAt: receivedAt,
        entries,
        user,
      });
    } catch (error) {
      this.logger.error(
        `La solicitud ${formatRequestCode(request.number)} quedó RECIBIDA pero no se pudo sumar al inventario.`,
        error instanceof Error ? error.stack : String(error),
      );
      throw new ConflictException(
        'La recepción quedó confirmada, pero no se pudo sumar al inventario. Avisa al Admin para que lo ajuste en Conteo.',
      );
    }
    return doc;
  }

  // ---------------------------------------------------------------------
  // Cancelar
  // ---------------------------------------------------------------------

  async cancel(id: string, dto: CancelStockRequestDto, user: AuthenticatedUser): Promise<StockRequestDoc> {
    const request = await this.loadFor(id, user);
    if (!canCancel(user.role, request.status)) {
      throw new BadRequestException(
        OPEN_STATUSES.includes(request.status)
          ? 'En este estado ya no puedes cancelar la solicitud.'
          : 'Esta solicitud ya fue recibida o cancelada.',
      );
    }
    return this.save(request, {
      status: StockRequestStatus.CANCELADA,
      events: { set: [...request.events, this.event(user, StockRequestStatus.CANCELADA, dto.reason)] },
    });
  }
}
