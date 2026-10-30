import { beforeEach, describe, expect, it } from 'vitest';
import { BadRequestException, ConflictException, ForbiddenException } from '@nestjs/common';
import { StockRequestStatus } from '../../generated/prisma/index.js';
import { StockRequestsService } from '../services/stock-requests.service.js';
import type { StockRequestDoc } from '../doc/stock-request.doc.js';
import {
  CENTRO,
  FakeStockRequestsRepository,
  RAMBLAS,
  USERS,
  createAccessMock,
  createMovementsMock,
  createOdooMock,
} from './mocks/stock-requests.mocks.js';

function setup() {
  const repository = new FakeStockRequestsRepository();
  const odoo = createOdooMock();
  const access = createAccessMock();
  const movements = createMovementsMock();
  const service = new StockRequestsService(repository.service, odoo.service, movements.service, access.service);
  return { service, repository, odoo, access, movements };
}

type Ctx = ReturnType<typeof setup>;

// Una solicitud de la tienda Ramblas con dos productos, ya creada.
async function createRequest(ctx: Ctx): Promise<StockRequestDoc> {
  return ctx.service.create(
    {
      note: 'Para el fin de semana',
      lines: [
        { productId: 100, quantity: 10 },
        { productId: 200, quantity: 6 },
      ],
    },
    USERS.tienda,
  );
}

const lineOf = (doc: StockRequestDoc, productId: number) => doc.lines.find((line) => line.productId === productId)!;

describe('StockRequestsService', () => {
  let ctx: Ctx;
  beforeEach(() => {
    ctx = setup();
  });

  describe('create (la tienda pide)', () => {
    it('crea la solicitud SOLICITADA con número, categoría, unidad y primer evento', async () => {
      const doc = await createRequest(ctx);

      expect(doc).toMatchObject({
        code: 'SOL-0001',
        status: StockRequestStatus.SOLICITADA,
        posConfigId: RAMBLAS,
        storeName: 'Tienda Ramblas',
        note: 'Para el fin de semana',
        dispatch: null,
      });
      expect(doc.lines).toHaveLength(2);
      expect(lineOf(doc, 100)).toMatchObject({
        productName: 'Tableta Leche 70g',
        categoryName: 'Tabletas',
        unit: 'unidad',
        requestedQuantity: 10,
        sentQuantity: null,
        receivedQuantity: null,
        addedByPlant: false,
      });
      expect(doc.events).toHaveLength(1);
      expect(doc.events[0]).toMatchObject({ status: StockRequestStatus.SOLICITADA, byEmail: USERS.tienda.email });
    });

    it('numera las solicitudes en orden', async () => {
      await createRequest(ctx);
      const second = await createRequest(ctx);
      expect(second.code).toBe('SOL-0002');
    });

    it('rechaza productos repetidos, inexistentes y cantidades con decimales en piezas', async () => {
      await expect(
        ctx.service.create({ lines: [{ productId: 100, quantity: 1 }, { productId: 100, quantity: 2 }] }, USERS.tienda),
      ).rejects.toThrow('repetidos');
      await expect(ctx.service.create({ lines: [{ productId: 9999, quantity: 1 }] }, USERS.tienda)).rejects.toThrow(
        'ya no existen',
      );
      await expect(ctx.service.create({ lines: [{ productId: 100, quantity: 1.5 }] }, USERS.tienda)).rejects.toThrow(
        'número entero',
      );
    });

    it('acepta decimales en productos a granel (kg)', async () => {
      const doc = await ctx.service.create({ lines: [{ productId: 400, quantity: 2.5 }] }, USERS.tienda);
      expect(lineOf(doc, 400)).toMatchObject({ unit: 'kg', requestedQuantity: 2.5 });
    });

    it('el Admin pide para la tienda que elige; la tienda tiene que existir', async () => {
      const doc = await ctx.service.create({ posConfigId: CENTRO, lines: [{ productId: 100, quantity: 3 }] }, USERS.admin);
      expect(doc).toMatchObject({ posConfigId: CENTRO, storeName: 'Tienda Centro', createdByEmail: 'admin@xoco.com' });
      await expect(ctx.service.create({ lines: [{ productId: 100, quantity: 3 }] }, USERS.admin)).rejects.toThrow('Elige la tienda');
      await expect(ctx.service.create({ posConfigId: 999, lines: [{ productId: 100, quantity: 3 }] }, USERS.admin)).rejects.toThrow('no es válida');
    });

    it('el Vendedor siempre pide para su tienda aunque mande otra', async () => {
      const doc = await ctx.service.create({ posConfigId: CENTRO, lines: [{ productId: 100, quantity: 3 }] }, USERS.tienda);
      expect(doc.posConfigId).toBe(RAMBLAS);
    });

    it('exige que Inventario esté habilitado para la tienda y que el usuario tenga tienda', async () => {
      ctx.access.assertEnabledFor.mockRejectedValueOnce(new ForbiddenException('no habilitado'));
      await expect(createRequest(ctx)).rejects.toBeInstanceOf(ForbiddenException);

      await expect(
        ctx.service.create({ lines: [{ productId: 100, quantity: 1 }] }, { ...USERS.tienda, posConfigId: null }),
      ).rejects.toBeInstanceOf(ForbiddenException);
    });
  });

  describe('permisos por tienda', () => {
    it('una tienda no ve ni toca las solicitudes de otra', async () => {
      const doc = await createRequest(ctx);
      await expect(ctx.service.findOne(doc.id, USERS.otraTienda)).rejects.toBeInstanceOf(ForbiddenException);
      await expect(ctx.service.cancel(doc.id, { reason: 'ya no' }, USERS.otraTienda)).rejects.toBeInstanceOf(
        ForbiddenException,
      );
    });

    it('la tienda solo lista las suyas; planta y admin listan todas', async () => {
      await createRequest(ctx);
      await ctx.service.create({ lines: [{ productId: 100, quantity: 1 }] }, USERS.otraTienda);

      expect(await ctx.service.findMany({}, USERS.tienda)).toHaveLength(1);
      // Aunque pida otra tienda, a la tienda se le fuerza la suya.
      const forced = await ctx.service.findMany({ posConfigId: CENTRO }, USERS.tienda);
      expect(forced.every((doc) => doc.posConfigId === RAMBLAS)).toBe(true);
      expect(await ctx.service.findMany({}, USERS.planta)).toHaveLength(2);
      expect(await ctx.service.findMany({}, USERS.admin)).toHaveLength(2);
    });
  });

  describe('planta responde', () => {
    it('start pasa a EN_PREPARACION una sola vez', async () => {
      const doc = await createRequest(ctx);
      const started = await ctx.service.start(doc.id, USERS.planta);
      expect(started.status).toBe(StockRequestStatus.EN_PREPARACION);
      expect(started.events.map((event) => event.status)).toEqual([
        StockRequestStatus.SOLICITADA,
        StockRequestStatus.EN_PREPARACION,
      ]);
      await expect(ctx.service.start(doc.id, USERS.planta)).rejects.toBeInstanceOf(BadRequestException);
    });

    it('guardar avance toma la solicitud, guarda qué sí y qué no, y agrega productos', async () => {
      const doc = await createRequest(ctx);
      const saved = await ctx.service.savePlantResponse(
        doc.id,
        {
          lines: [
            { productId: 100, sentQuantity: 10 },
            { productId: 200, sentQuantity: 0, note: 'No hay esta semana' },
            { productId: 300, sentQuantity: 4, added: true, note: 'Sobró granola' },
          ],
        },
        USERS.planta,
      );

      expect(saved.status).toBe(StockRequestStatus.EN_PREPARACION);
      expect(lineOf(saved, 200)).toMatchObject({ sentQuantity: 0, plantNote: 'No hay esta semana' });
      expect(lineOf(saved, 300)).toMatchObject({
        addedByPlant: true,
        requestedQuantity: 0,
        sentQuantity: 4,
        categoryName: 'Welness',
      });
    });

    it('quita el producto que planta agregó si ya no viene en su lista', async () => {
      const doc = await createRequest(ctx);
      await ctx.service.savePlantResponse(
        doc.id,
        { lines: [{ productId: 100, sentQuantity: 10 }, { productId: 300, sentQuantity: 4, added: true }] },
        USERS.planta,
      );
      const saved = await ctx.service.savePlantResponse(doc.id, { lines: [{ productId: 100, sentQuantity: 9 }] }, USERS.planta);

      expect(saved.lines.map((line) => line.productId)).toEqual([100, 200]);
      expect(lineOf(saved, 100).sentQuantity).toBe(9);
    });

    it('agrega un sustituto "en lugar de" un producto pedido, con su comentario', async () => {
      const doc = await createRequest(ctx);
      const saved = await ctx.service.savePlantResponse(
        doc.id,
        {
          lines: [
            { productId: 100, sentQuantity: 10 },
            { productId: 200, sentQuantity: 0, note: 'No hay' },
            { productId: 101, sentQuantity: 6, added: true, replacesProductId: 200, note: 'Va esta en su lugar' },
          ],
        },
        USERS.planta,
      );

      expect(lineOf(saved, 101)).toMatchObject({ addedByPlant: true, replacesProductId: 200, plantNote: 'Va esta en su lugar' });
      expect(lineOf(saved, 100).replacesProductId).toBeNull();
    });

    it('un sustituto solo reemplaza a un producto que la tienda pidió', async () => {
      const doc = await createRequest(ctx);
      await expect(
        ctx.service.savePlantResponse(
          doc.id,
          { lines: [{ productId: 300, sentQuantity: 2, added: true, replacesProductId: 101 }] },
          USERS.planta,
        ),
      ).rejects.toThrow('no pidió');
      await expect(
        ctx.service.savePlantResponse(doc.id, { lines: [{ productId: 100, sentQuantity: 2, replacesProductId: 200 }] }, USERS.planta),
      ).rejects.toThrow('solo un producto agregado');
    });

    it('no deja agregar un producto nuevo sin marcarlo como agregado', async () => {
      const doc = await createRequest(ctx);
      await expect(
        ctx.service.savePlantResponse(doc.id, { lines: [{ productId: 300, sentQuantity: 4 }] }, USERS.planta),
      ).rejects.toThrow('márcalo como agregado');
    });

    it('rechaza cantidades con decimales en piezas', async () => {
      const doc = await createRequest(ctx);
      await expect(
        ctx.service.savePlantResponse(doc.id, { lines: [{ productId: 100, sentQuantity: 2.5 }] }, USERS.planta),
      ).rejects.toThrow('número entero');
    });
  });

  describe('dispatch (planta despacha)', () => {
    it('despacho COMPLETO: todo lo pedido sale; queda EN_CAMINO con su evento', async () => {
      const doc = await createRequest(ctx);
      const dispatched = await ctx.service.dispatch(
        doc.id,
        { lines: [{ productId: 100, sentQuantity: 10 }, { productId: 200, sentQuantity: 6 }], note: 'Sale a las 3' },
        USERS.planta,
      );

      expect(dispatched.status).toBe(StockRequestStatus.EN_CAMINO);
      expect(dispatched.dispatch).toBe('COMPLETO');
      expect(dispatched.dispatchedAt).not.toBeNull();
      const last = dispatched.events[dispatched.events.length - 1];
      expect(last.status).toBe(StockRequestStatus.EN_CAMINO);
      expect(last.note).toBe('Despacho completo. Sale a las 3');
    });

    it('despacho PARCIAL cuando algo no se envía', async () => {
      const doc = await createRequest(ctx);
      const dispatched = await ctx.service.dispatch(
        doc.id,
        { lines: [{ productId: 100, sentQuantity: 10 }, { productId: 200, sentQuantity: 0, note: 'No hay' }] },
        USERS.planta,
      );
      expect(dispatched.dispatch).toBe('PARCIAL');
    });

    it('exige responder todas las líneas y enviar algo', async () => {
      const doc = await createRequest(ctx);
      await expect(
        ctx.service.dispatch(doc.id, { lines: [{ productId: 100, sentQuantity: 10 }] }, USERS.planta),
      ).rejects.toThrow('Falta responder 1 producto');
      await expect(
        ctx.service.dispatch(
          doc.id,
          { lines: [{ productId: 100, sentQuantity: 0 }, { productId: 200, sentQuantity: 0 }] },
          USERS.planta,
        ),
      ).rejects.toThrow('No hay nada que enviar');
    });

    it('no se despacha dos veces ni se modifica después de despachar', async () => {
      const doc = await createRequest(ctx);
      const body = { lines: [{ productId: 100, sentQuantity: 10 }, { productId: 200, sentQuantity: 6 }] };
      await ctx.service.dispatch(doc.id, body, USERS.planta);
      await expect(ctx.service.dispatch(doc.id, body, USERS.planta)).rejects.toBeInstanceOf(BadRequestException);
      await expect(ctx.service.savePlantResponse(doc.id, body, USERS.planta)).rejects.toBeInstanceOf(BadRequestException);
    });

    it('si alguien más guardó primero, responde conflicto en vez de pisar su trabajo', async () => {
      const doc = await createRequest(ctx);
      ctx.repository.failNextUpdate = true;
      await expect(
        ctx.service.dispatch(
          doc.id,
          { lines: [{ productId: 100, sentQuantity: 10 }, { productId: 200, sentQuantity: 6 }] },
          USERS.planta,
        ),
      ).rejects.toBeInstanceOf(ConflictException);
    });
  });

  describe('receive (la tienda confirma)', () => {
    async function dispatched(): Promise<StockRequestDoc> {
      const doc = await createRequest(ctx);
      return ctx.service.dispatch(
        doc.id,
        {
          lines: [
            { productId: 100, sentQuantity: 10 },
            { productId: 200, sentQuantity: 0, note: 'No hay' },
            { productId: 300, sentQuantity: 4, added: true },
          ],
        },
        USERS.planta,
      );
    }

    it('confirma lo recibido, queda RECIBIDA y suma al inventario solo lo que llegó', async () => {
      const doc = await dispatched();
      const received = await ctx.service.receive(
        doc.id,
        { lines: [{ productId: 100, receivedQuantity: 10 }, { productId: 300, receivedQuantity: 4 }] },
        USERS.tienda,
      );

      expect(received.status).toBe(StockRequestStatus.RECIBIDA);
      expect(received.receivedAt).not.toBeNull();
      expect(lineOf(received, 200).receivedQuantity).toBe(0); // planta no la envió
      expect(received.events[received.events.length - 1].note).toBe('Recibida completa');

      expect(ctx.movements.createConfirmedEntries).toHaveBeenCalledTimes(1);
      const call = ctx.movements.createConfirmedEntries.mock.calls[0][0];
      expect(call).toMatchObject({ posConfigId: RAMBLAS, stockRequestId: doc.id, note: 'Solicitud SOL-0001' });
      expect(call.entries).toEqual([
        { productId: 100, quantity: 10 },
        { productId: 300, quantity: 4 },
      ]);
    });

    it('exige explicar la diferencia y la deja en la línea (DIF)', async () => {
      const doc = await dispatched();
      await expect(
        ctx.service.receive(
          doc.id,
          { lines: [{ productId: 100, receivedQuantity: 8 }, { productId: 300, receivedQuantity: 4 }] },
          USERS.tienda,
        ),
      ).rejects.toThrow('Explica la diferencia');

      const received = await ctx.service.receive(
        doc.id,
        {
          lines: [{ productId: 100, receivedQuantity: 8, note: 'Llegaron 2 rotas' }, { productId: 300, receivedQuantity: 4 }],
        },
        USERS.tienda,
      );
      expect(lineOf(received, 100)).toMatchObject({ receivedQuantity: 8, difference: -2, storeNote: 'Llegaron 2 rotas' });
      expect(received.events[received.events.length - 1].note).toBe('Recibida con diferencias');
      expect(ctx.movements.createConfirmedEntries.mock.calls[0][0].entries[0]).toEqual({ productId: 100, quantity: 8 });
    });

    it('exige confirmar cada producto que planta envió', async () => {
      const doc = await dispatched();
      await expect(
        ctx.service.receive(doc.id, { lines: [{ productId: 100, receivedQuantity: 10 }] }, USERS.tienda),
      ).rejects.toThrow('Falta confirmar');
    });

    it('solo se recibe un envío EN_CAMINO, y no se puede recibir dos veces', async () => {
      const doc = await createRequest(ctx);
      await expect(
        ctx.service.receive(doc.id, { lines: [{ productId: 100, receivedQuantity: 10 }] }, USERS.tienda),
      ).rejects.toThrow('no está en camino');

      const sent = await dispatched();
      const body = { lines: [{ productId: 100, receivedQuantity: 10 }, { productId: 300, receivedQuantity: 4 }] };
      await ctx.service.receive(sent.id, body, USERS.tienda);
      await expect(ctx.service.receive(sent.id, body, USERS.tienda)).rejects.toBeInstanceOf(BadRequestException);
      expect(ctx.movements.createConfirmedEntries).toHaveBeenCalledTimes(1);
    });

    it('si no se puede sumar al inventario, avisa pero la recepción queda guardada', async () => {
      const doc = await dispatched();
      ctx.movements.createConfirmedEntries.mockRejectedValueOnce(new Error('mongo caído'));
      await expect(
        ctx.service.receive(
          doc.id,
          { lines: [{ productId: 100, receivedQuantity: 10 }, { productId: 300, receivedQuantity: 4 }] },
          USERS.tienda,
        ),
      ).rejects.toThrow('no se pudo sumar al inventario');
      expect((await ctx.service.findOne(doc.id, USERS.admin)).status).toBe(StockRequestStatus.RECIBIDA);
    });
  });

  describe('cancel', () => {
    it('la tienda cancela solo antes de que planta la tome, y el motivo queda a la vista', async () => {
      const doc = await createRequest(ctx);
      const cancelled = await ctx.service.cancel(doc.id, { reason: 'Me equivoqué de tienda' }, USERS.tienda);
      expect(cancelled.status).toBe(StockRequestStatus.CANCELADA);
      expect(cancelled.cancelReason).toBe('Me equivoqué de tienda');

      const other = await createRequest(ctx);
      await ctx.service.start(other.id, USERS.planta);
      await expect(ctx.service.cancel(other.id, { reason: 'ya no' }, USERS.tienda)).rejects.toBeInstanceOf(
        BadRequestException,
      );
    });

    it('planta cancela si no tiene nada; admin cancela aun EN_CAMINO; nadie cancela una recibida', async () => {
      const first = await createRequest(ctx);
      await ctx.service.start(first.id, USERS.planta);
      expect((await ctx.service.cancel(first.id, { reason: 'Sin existencia' }, USERS.planta)).status).toBe(
        StockRequestStatus.CANCELADA,
      );

      const second = await createRequest(ctx);
      await ctx.service.dispatch(
        second.id,
        { lines: [{ productId: 100, sentQuantity: 10 }, { productId: 200, sentQuantity: 6 }] },
        USERS.planta,
      );
      await expect(ctx.service.cancel(second.id, { reason: 'x' }, USERS.planta)).rejects.toBeInstanceOf(BadRequestException);
      expect((await ctx.service.cancel(second.id, { reason: 'Camión averiado' }, USERS.admin)).status).toBe(
        StockRequestStatus.CANCELADA,
      );

      const third = await createRequest(ctx);
      await ctx.service.dispatch(
        third.id,
        { lines: [{ productId: 100, sentQuantity: 10 }, { productId: 200, sentQuantity: 6 }] },
        USERS.planta,
      );
      await ctx.service.receive(
        third.id,
        { lines: [{ productId: 100, receivedQuantity: 10 }, { productId: 200, receivedQuantity: 6 }] },
        USERS.tienda,
      );
      await expect(ctx.service.cancel(third.id, { reason: 'x' }, USERS.admin)).rejects.toBeInstanceOf(BadRequestException);
    });
  });

  describe('alertas', () => {
    it('planta ve lo que tiene por responder; la tienda, lo que viene en camino; admin nada', async () => {
      const first = await createRequest(ctx);
      await createRequest(ctx);
      expect(await ctx.service.findNotifications(USERS.planta)).toEqual({ pending: 2 });
      expect(await ctx.service.findNotifications(USERS.tienda)).toEqual({ pending: 0 });

      await ctx.service.dispatch(
        first.id,
        { lines: [{ productId: 100, sentQuantity: 10 }, { productId: 200, sentQuantity: 6 }] },
        USERS.planta,
      );
      expect(await ctx.service.findNotifications(USERS.planta)).toEqual({ pending: 1 });
      expect(await ctx.service.findNotifications(USERS.tienda)).toEqual({ pending: 1 });
      expect(await ctx.service.findNotifications(USERS.otraTienda)).toEqual({ pending: 0 });
      expect(await ctx.service.findNotifications(USERS.admin)).toEqual({ pending: 0 });
      expect(await ctx.service.findNotifications(USERS.finanzas)).toEqual({ pending: 0 });
    });

    it('una tienda sin Inventario habilitado no recibe alertas', async () => {
      await createRequest(ctx);
      ctx.access.isEnabledFor.mockResolvedValueOnce(false);
      expect(await ctx.service.findNotifications(USERS.tienda)).toEqual({ pending: 0 });
    });
  });

  describe('catálogo', () => {
    it('trae los productos con categoría y unidad, ordenados por categoría', async () => {
      const catalog = await ctx.service.findCatalog();
      expect(catalog.map((item) => item.categoryName)).toEqual(['Bombones', 'Grajeados', 'Tabletas', 'Tabletas', 'Welness']);
      expect(catalog.find((item) => item.productId === 400)?.unit).toBe('kg');
    });

    it('lo guarda un minuto: abrir el modal otra vez no vuelve a Odoo', async () => {
      await ctx.service.findCatalog();
      await ctx.service.findCatalog();
      expect(ctx.odoo.findProducts).toHaveBeenCalledTimes(1);
    });
  });

  describe('entre tiendas', () => {
    // Ramblas le pide a Centro.
    async function createTransfer(): Promise<StockRequestDoc> {
      return ctx.service.create(
        { sourcePosConfigId: CENTRO, lines: [{ productId: 100, quantity: 5 }, { productId: 200, quantity: 2 }] },
        USERS.tienda,
      );
    }

    it('la tienda pide a otra tienda; queda con su origen y Planta no la ve', async () => {
      const doc = await createTransfer();
      expect(doc).toMatchObject({ posConfigId: RAMBLAS, sourcePosConfigId: CENTRO, sourceName: 'Tienda Centro' });
      expect(await ctx.service.findMany({}, USERS.planta)).toEqual([]);
      await expect(ctx.service.findOne(doc.id, USERS.planta)).rejects.toBeInstanceOf(ForbiddenException);
      expect((await ctx.service.findMany({}, USERS.otraTienda)).map((item) => item.id)).toEqual([doc.id]);
    });

    it('no se puede pedir a la misma tienda ni a una sin Inventario', async () => {
      await expect(ctx.service.create({ sourcePosConfigId: RAMBLAS, lines: [{ productId: 100, quantity: 1 }] }, USERS.tienda)).rejects.toThrow(
        'misma tienda',
      );
      ctx.access.findAccess.mockResolvedValueOnce({ enabledPosConfigIds: [RAMBLAS] });
      await expect(ctx.service.create({ sourcePosConfigId: CENTRO, lines: [{ productId: 100, quantity: 1 }] }, USERS.tienda)).rejects.toThrow(
        'no tiene Inventario',
      );
    });

    it('responde y despacha la tienda que surte (no planta ni la que pide), y sale de su inventario', async () => {
      const doc = await createTransfer();
      const response = { lines: [{ productId: 100, sentQuantity: 5 }, { productId: 200, sentQuantity: 0, note: 'No hay' }] };
      await expect(ctx.service.dispatch(doc.id, response, USERS.planta)).rejects.toBeInstanceOf(ForbiddenException);
      await expect(ctx.service.dispatch(doc.id, response, USERS.tienda)).rejects.toThrow('tienda que surte');

      const sent = await ctx.service.dispatch(doc.id, response, USERS.otraTienda);
      expect(sent.status).toBe(StockRequestStatus.EN_CAMINO);
      expect(ctx.movements.createConfirmedTransfersOut).toHaveBeenCalledWith(
        expect.objectContaining({ posConfigId: CENTRO, entries: [{ productId: 100, quantity: 5 }] }),
      );

      const received = await ctx.service.receive(doc.id, { lines: [{ productId: 100, receivedQuantity: 5 }] }, USERS.tienda);
      expect(received.status).toBe(StockRequestStatus.RECIBIDA);
      expect(ctx.movements.createConfirmedEntries).toHaveBeenCalledWith(expect.objectContaining({ posConfigId: RAMBLAS }));
    });

    it('avisos: la que surte ve lo que le piden; ya despachada no se cancela', async () => {
      const doc = await createTransfer();
      expect(await ctx.service.findNotifications(USERS.otraTienda)).toEqual({ pending: 1 });
      expect(await ctx.service.findNotifications(USERS.planta)).toEqual({ pending: 0 });
      await ctx.service.dispatch(doc.id, { lines: [{ productId: 100, sentQuantity: 5 }, { productId: 200, sentQuantity: 2 }] }, USERS.otraTienda);
      expect(await ctx.service.findNotifications(USERS.tienda)).toEqual({ pending: 1 });
      await expect(ctx.service.cancel(doc.id, { reason: 'x' }, USERS.admin)).rejects.toThrow('ya salió');
    });

    it('la tienda que surte puede cancelar mientras la prepara', async () => {
      const doc = await createTransfer();
      const cancelled = await ctx.service.cancel(doc.id, { reason: 'No tenemos' }, USERS.otraTienda);
      expect(cancelled.status).toBe(StockRequestStatus.CANCELADA);
    });
  });
});
