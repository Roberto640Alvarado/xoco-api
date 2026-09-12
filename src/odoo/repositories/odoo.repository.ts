import { Injectable, Logger } from '@nestjs/common';
import axios, { AxiosInstance } from 'axios';
import {
  OdooCredentials,
  OdooJsonRpcError,
  OdooJsonRpcSuccess,
  OdooReadGroupOptions,
  OdooSearchReadOptions,
} from '../types/odoo-common.types.js';
import {
  OdooAccountMove,
  OdooAccountMoveGroup,
  OdooPosConfig,
  OdooPosOrderGroup,
  OdooPosOrder,
  OdooPosOrderLine,
  OdooPosPaymentGroup,
  OdooPosPaymentMethod,
  OdooPosSession,
  OdooProduct,
  OdooProductCategory,
} from '../types/odoo-entities.types.js';

// Error propio, para que OdooService lo traduzca a una excepción de Nest
// en vez de dejar pasar el error crudo de axios/Odoo (ver CLAUDE.md,
// "Manejo de Errores").
export class OdooRequestError extends Error {
  constructor(
    message: string,
    readonly odooCode?: number,
  ) {
    super(message);
    this.name = 'OdooRequestError';
  }
}

// Único módulo que le habla a Odoo por HTTP — todo lo demás en la API
// pasa por OdooService, nunca directo por aquí ni por axios suelto (ver
// CLAUDE.md, "Repository Pattern" / "Nunca llamar a Odoo directamente...").
@Injectable()
export class OdooRepository {
  private readonly logger = new Logger(OdooRepository.name);
  private readonly http: AxiosInstance;
  private requestId = 0;

  constructor() {
    this.http = axios.create({ timeout: 15_000 });
  }

  private async executeKw<T>(
    credentials: OdooCredentials,
    model: string,
    method: string,
    args: unknown[],
    kwargs: Record<string, unknown> = {},
  ): Promise<T> {
    const { baseUrl, db, uid, apiKey } = credentials;

    let response;
    try {
      response = await this.http.post<
        OdooJsonRpcSuccess<T> | OdooJsonRpcError
      >(baseUrl, {
        jsonrpc: '2.0',
        method: 'call',
        params: {
          service: 'object',
          method: 'execute_kw',
          args: [db, uid, apiKey, model, method, args, kwargs],
        },
        id: ++this.requestId,
      });
    } catch (error) {
      const message =
        error instanceof Error ? error.message : 'Error de red desconocido';
      this.logger.error(`Fallo de red llamando a Odoo (${model}.${method}): ${message}`);
      throw new OdooRequestError(`No se pudo contactar a Odoo: ${message}`);
    }

    if ('error' in response.data) {
      const { code, message } = response.data.error;
      this.logger.error(`Odoo respondió error (${model}.${method}): [${code}] ${message}`);
      throw new OdooRequestError(message, code);
    }

    return response.data.result;
  }

  private toSearchReadArgs(options: OdooSearchReadOptions = {}) {
    const { domain = [], ...kwargs } = options;
    return { args: [domain], kwargs };
  }

  findProducts(credentials: OdooCredentials, options?: OdooSearchReadOptions) {
    const { args, kwargs } = this.toSearchReadArgs(options);
    return this.executeKw<OdooProduct[]>(
      credentials,
      'product.product',
      'search_read',
      args,
      {
        fields: [
          'id',
          'display_name',
          'default_code',
          'barcode',
          'categ_id',
          'type',
          'list_price',
          'standard_price',
          'uom_id',
          'qty_available',
          'active',
          'product_tmpl_id',
          'create_date',
          'write_date',
        ],
        limit: 100,
        ...kwargs,
      },
    );
  }

  findCategories(credentials: OdooCredentials, options?: OdooSearchReadOptions) {
    const { args, kwargs } = this.toSearchReadArgs(options);
    return this.executeKw<OdooProductCategory[]>(
      credentials,
      'product.category',
      'search_read',
      args,
      {
        fields: ['id', 'name', 'complete_name', 'parent_id', 'create_date', 'write_date'],
        limit: 100,
        ...kwargs,
      },
    );
  }

  findPosConfigs(credentials: OdooCredentials, options?: OdooSearchReadOptions) {
    const { args, kwargs } = this.toSearchReadArgs(options);
    return this.executeKw<OdooPosConfig[]>(
      credentials,
      'pos.config',
      'search_read',
      args,
      {
        fields: [
          'id',
          'name',
          'warehouse_id',
          'company_id',
          'active',
          'invoice_journal_id',
          'ccf_journal_id',
          'nr_journal_id',
          'fex_journal_id',
          'nc_journal_id',
          'nd_journal_id',
          'anu_journal_id',
          'create_date',
          'write_date',
        ],
        limit: 100,
        ...kwargs,
      },
    );
  }

  findPosSessions(credentials: OdooCredentials, options?: OdooSearchReadOptions) {
    const { args, kwargs } = this.toSearchReadArgs(options);
    return this.executeKw<OdooPosSession[]>(
      credentials,
      'pos.session',
      'search_read',
      args,
      {
        fields: [
          'id',
          'name',
          'config_id',
          'state',
          'start_at',
          'stop_at',
          'cash_register_balance_start',
          'cash_register_balance_end_real',
          'user_id',
          'create_date',
          'write_date',
        ],
        limit: 100,
        ...kwargs,
      },
    );
  }

  findPosOrders(credentials: OdooCredentials, options?: OdooSearchReadOptions) {
    const { args, kwargs } = this.toSearchReadArgs(options);
    return this.executeKw<OdooPosOrder[]>(
      credentials,
      'pos.order',
      'search_read',
      args,
      {
        fields: [
          'id',
          'name',
          'session_id',
          'config_id',
          'partner_id',
          'date_order',
          'state',
          'amount_total',
          'amount_tax',
          'amount_paid',
          'amount_return',
          'user_id',
          'company_id',
          'create_date',
          'write_date',
        ],
        limit: 100,
        ...kwargs,
      },
    );
  }

  findPosOrderLines(credentials: OdooCredentials, options?: OdooSearchReadOptions) {
    const { args, kwargs } = this.toSearchReadArgs(options);
    return this.executeKw<OdooPosOrderLine[]>(
      credentials,
      'pos.order.line',
      'search_read',
      args,
      {
        fields: [
          'id',
          'order_id',
          'product_id',
          'qty',
          'price_unit',
          'price_subtotal',
          'price_subtotal_incl',
          'discount',
          'full_product_name',
          'create_date',
          'write_date',
        ],
        limit: 100,
        ...kwargs,
      },
    );
  }

  findPosPaymentMethods(credentials: OdooCredentials, options?: OdooSearchReadOptions) {
    const { args, kwargs } = this.toSearchReadArgs(options);
    return this.executeKw<OdooPosPaymentMethod[]>(
      credentials,
      'pos.payment.method',
      'search_read',
      args,
      {
        fields: ['id', 'name', 'type', 'active', 'company_id', 'create_date', 'write_date'],
        limit: 100,
        ...kwargs,
      },
    );
  }


  // read_group sobre pos.payment (pagos de las órdenes de caja) — mismo
  // mecanismo que readGroupPosOrders/readGroupAccountMoves. Lo usa
  // SalesService.findPaymentMethodsSummary para agrupar por método de
  // pago (Efectivo vs. otros medios).
  readGroupPosPayments(credentials: OdooCredentials, options: OdooReadGroupOptions) {
    const { domain = [], fields, groupby, ...kwargs } = options;
    return this.executeKw<OdooPosPaymentGroup[]>(
      credentials,
      'pos.payment',
      'read_group',
      [domain, fields, groupby],
      { lazy: false, ...kwargs },
    );
  }
  // search_count — total de registros que matchean un domain, sin traer
  // los datos. Se usa para armar `meta.total` en endpoints paginados.
  countPosOrders(credentials: OdooCredentials, domain: unknown[] = []) {
    return this.executeKw<number>(credentials, 'pos.order', 'search_count', [domain]);
  }

  findAccountMoves(credentials: OdooCredentials, options?: OdooSearchReadOptions) {
    const { args, kwargs } = this.toSearchReadArgs(options);
    return this.executeKw<OdooAccountMove[]>(
      credentials,
      'account.move',
      'search_read',
      args,
      {
        fields: [
          'id',
          'journal_id',
          'invoice_user_id',
          'partner_id',
          'commercial_partner_id',
          'pos_order_ids',
          // Variantes `_signed`: una nota de crédito viene en negativo,
          // así que sumarlas deja el monto NETO, igual que la lista de
          // facturas de Odoo.
          'amount_untaxed_signed',
          'amount_total_signed',
        ],
        limit: 100,
        ...kwargs,
      },
    );
  }

  // read_group sobre pos.order — mismo mecanismo que
  // readGroupAccountMoves (ver abajo).
  readGroupPosOrders(credentials: OdooCredentials, options: OdooReadGroupOptions) {
    const { domain = [], fields, groupby, ...kwargs } = options;
    return this.executeKw<OdooPosOrderGroup[]>(
      credentials,
      'pos.order',
      'read_group',
      [domain, fields, groupby],
      { lazy: false, ...kwargs },
    );
  }

  // read_group sobre account.move (facturas) — Odoo agrupa y suma del
  // lado del servidor, igual que cuando se agrupa la lista de facturas en
  // su interfaz. `lazy: false` es lo que hace que cada fila traiga
  // `__count` y todos los groupby resueltos en una sola llamada (con
  // `lazy: true`, el default, Odoo solo expande el primer groupby).
  readGroupAccountMoves(credentials: OdooCredentials, options: OdooReadGroupOptions) {
    const { domain = [], fields, groupby, ...kwargs } = options;
    return this.executeKw<OdooAccountMoveGroup[]>(
      credentials,
      'account.move',
      'read_group',
      [domain, fields, groupby],
      { lazy: false, ...kwargs },
    );
  }
}
