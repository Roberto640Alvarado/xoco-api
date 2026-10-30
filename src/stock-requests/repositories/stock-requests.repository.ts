import { Injectable, NotFoundException } from '@nestjs/common';
import { Prisma, StockRequestStatus, StoreStockRequest } from '../../generated/prisma/index.js';
import { PrismaService } from '../../prisma/prisma.service.js';

const COUNTER_ID = 'stock-request';
const COUNTER_RETRIES = 3;

export interface StockRequestFilters {
  status?: StockRequestStatus;
  statuses?: StockRequestStatus[];
  /** Tienda que pide. */
  posConfigId?: number;
  /** Quién surte: 'plant' = planta; un número = esa tienda. */
  source?: 'plant' | number;
  /** La tienda participa como la que pide O como la que surte (vista del Vendedor). */
  involvingStore?: number;
  createdFrom?: Date;
  createdTo?: Date;
}

// Las solicitudes anteriores a las solicitudes entre tiendas no traen el
// campo: "de planta" es null o ausente.
const FROM_PLANT: Prisma.StoreStockRequestWhereInput = {
  OR: [{ sourcePosConfigId: null }, { sourcePosConfigId: { isSet: false } }],
};

function toWhere(filters: StockRequestFilters): Prisma.StoreStockRequestWhereInput {
  const and: Prisma.StoreStockRequestWhereInput[] = [];
  if (filters.status) and.push({ status: filters.status });
  else if (filters.statuses) and.push({ status: { in: filters.statuses } });
  if (filters.posConfigId !== undefined) and.push({ posConfigId: filters.posConfigId });
  if (filters.source === 'plant') and.push(FROM_PLANT);
  else if (filters.source !== undefined) and.push({ sourcePosConfigId: filters.source });
  if (filters.involvingStore !== undefined) {
    and.push({ OR: [{ posConfigId: filters.involvingStore }, { sourcePosConfigId: filters.involvingStore }] });
  }
  if (filters.createdFrom || filters.createdTo) {
    and.push({
      createdAt: {
        ...(filters.createdFrom ? { gte: filters.createdFrom } : {}),
        ...(filters.createdTo ? { lte: filters.createdTo } : {}),
      },
    });
  }
  return and.length ? { AND: and } : {};
}

export type CreateStockRequestData = Omit<
  Prisma.StoreStockRequestUncheckedCreateInput,
  'id' | 'createdAt' | 'updatedAt' | 'dispatchedAt' | 'receivedAt'
>;

// Tope de la lista: una solicitud trae todas sus líneas, así que la bandeja
// no se pagina — se acota por fechas/estado/tienda y, por seguridad, por
// cantidad (las más recientes primero).
const LIST_LIMIT = 500;

// Único acceso a datos permitido a store_stock_requests — el resto de la
// app pasa siempre por StockRequestsService (ver CLAUDE.md, Repository
// Pattern).
@Injectable()
export class StockRequestsRepository {
  constructor(private readonly prisma: PrismaService) {}

  // Siguiente número corrido (SOL-0001, 0002...). Mongo no tiene
  // autoincrement, así que se usa un documento contador con un upsert
  // atómico. Si dos solicitudes crean el contador a la vez, una choca con
  // el índice único: se reintenta.
  async nextNumber(): Promise<number> {
    for (let attempt = 1; ; attempt++) {
      try {
        const counter = await this.prisma.counter.upsert({
          where: { id: COUNTER_ID },
          update: { seq: { increment: 1 } },
          create: { id: COUNTER_ID, seq: 1 },
        });
        return counter.seq;
      } catch (error) {
        const isUniqueConflict = error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002';
        if (!isUniqueConflict || attempt >= COUNTER_RETRIES) throw error;
      }
    }
  }

  create(data: CreateStockRequestData): Promise<StoreStockRequest> {
    return this.prisma.storeStockRequest.create({ data });
  }

  findById(id: string): Promise<StoreStockRequest | null> {
    // Un id que no es un ObjectId válido revienta en Prisma: para el
    // cliente es simplemente "no existe".
    if (!/^[0-9a-f]{24}$/i.test(id)) return Promise.resolve(null);
    return this.prisma.storeStockRequest.findUnique({ where: { id } });
  }

  async findByIdOrThrow(id: string): Promise<StoreStockRequest> {
    const request = await this.findById(id);
    if (!request) throw new NotFoundException('No se encontró la solicitud.');
    return request;
  }

  findMany(filters: StockRequestFilters): Promise<StoreStockRequest[]> {
    return this.prisma.storeStockRequest.findMany({ where: toWhere(filters), orderBy: { createdAt: 'desc' }, take: LIST_LIMIT });
  }

  count(filters: StockRequestFilters): Promise<number> {
    return this.prisma.storeStockRequest.count({ where: toWhere(filters) });
  }

  // Guarda un cambio SOLO si nadie más tocó la solicitud desde que se leyó
  // (mismo updatedAt): evita que dos personas pisen la respuesta de planta
  // o que la tienda reciba dos veces el mismo envío. Devuelve false si
  // alguien se adelantó.
  async updateIfUnchanged(
    current: StoreStockRequest,
    data: Prisma.StoreStockRequestUncheckedUpdateManyInput,
  ): Promise<boolean> {
    const result = await this.prisma.storeStockRequest.updateMany({
      where: { id: current.id, updatedAt: current.updatedAt },
      data,
    });
    return result.count === 1;
  }
}
