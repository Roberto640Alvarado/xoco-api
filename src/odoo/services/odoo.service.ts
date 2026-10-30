import {
  BadGatewayException,
  Injectable,
  ServiceUnavailableException,
} from '@nestjs/common';
import { OdooConfigRepository } from '../repositories/odoo-config.repository.js';
import {
  OdooRepository,
  OdooRequestError,
} from '../repositories/odoo.repository.js';
import {
  OdooCredentials,
  OdooReadGroupOptions,
  OdooSearchReadOptions,
} from '../types/odoo-common.types.js';

// Única puerta de entrada al módulo Odoo para el resto de la app. Resuelve
// las credenciales (uid/apiKey desde Mongo, baseUrl/db desde env) en cada
// llamada, valida que el API key no esté vencido, y traduce cualquier
// falla de Odoo (timeout, key vencida/ausente, error de Odoo) a una
// excepción propia de Nest en vez de dejar pasar el error crudo.
// El idioma del usuario de Odoo casi nunca cambia: se pregunta una vez por
// uid y se guarda una hora.
const LANG_TTL_MS = 60 * 60 * 1000;

@Injectable()
export class OdooService {
  private langCache: { uid: number; lang: string | null; expiresAt: number } | null = null;

  constructor(
    private readonly odooConfigRepository: OdooConfigRepository,
    private readonly odooRepository: OdooRepository,
  ) {}

  private async resolveCredentials(): Promise<OdooCredentials> {
    const baseUrl = process.env.ODOO_BASE_URL;
    const db = process.env.ODOO_DB;
    if (!baseUrl || !db) {
      throw new ServiceUnavailableException(
        'Falta ODOO_BASE_URL o ODOO_DB en las variables de entorno.',
      );
    }

    const config = await this.odooConfigRepository.findActive();
    if (!config) {
      throw new ServiceUnavailableException(
        'No hay un API key de Odoo configurado. Un SUPER_ADMIN debe registrar uno.',
      );
    }
    if (config.expiresAt.getTime() <= Date.now()) {
      throw new ServiceUnavailableException(
        'El API key de Odoo venció. Un SUPER_ADMIN debe rotarlo desde el panel.',
      );
    }

    const credentials: OdooCredentials = { baseUrl, db, uid: config.uid, apiKey: config.apiKey };
    const lang = await this.resolveLang(credentials);
    return lang ? { ...credentials, lang } : credentials;
  }

  // Si no se puede leer el idioma, se sigue sin él (inglés) en vez de
  // tumbar la consulta: los números no cambian, solo los nombres.
  private async resolveLang(credentials: OdooCredentials): Promise<string | null> {
    const now = Date.now();
    if (this.langCache && this.langCache.uid === credentials.uid && this.langCache.expiresAt > now) {
      return this.langCache.lang;
    }
    let lang: string | null = null;
    try {
      lang = await this.odooRepository.findUserLang(credentials);
    } catch {
      lang = null;
    }
    this.langCache = { uid: credentials.uid, lang, expiresAt: now + LANG_TTL_MS };
    return lang;
  }

  private async run<T>(fn: (credentials: OdooCredentials) => Promise<T>): Promise<T> {
    const credentials = await this.resolveCredentials();
    try {
      return await fn(credentials);
    } catch (error) {
      if (error instanceof OdooRequestError) {
        throw new BadGatewayException(`Odoo respondió con un error: ${error.message}`);
      }
      throw error;
    }
  }

  findProducts(options?: OdooSearchReadOptions) {
    return this.run((credentials) => this.odooRepository.findProducts(credentials, options));
  }

  findCategories(options?: OdooSearchReadOptions) {
    return this.run((credentials) => this.odooRepository.findCategories(credentials, options));
  }

  findPosConfigs(options?: OdooSearchReadOptions) {
    return this.run((credentials) => this.odooRepository.findPosConfigs(credentials, options));
  }

  findPosSessions(options?: OdooSearchReadOptions) {
    return this.run((credentials) => this.odooRepository.findPosSessions(credentials, options));
  }

  findPosOrders(options?: OdooSearchReadOptions) {
    return this.run((credentials) => this.odooRepository.findPosOrders(credentials, options));
  }

  findPosOrderLines(options?: OdooSearchReadOptions) {
    return this.run((credentials) => this.odooRepository.findPosOrderLines(credentials, options));
  }

  findPosPaymentMethods(options?: OdooSearchReadOptions) {
    return this.run((credentials) => this.odooRepository.findPosPaymentMethods(credentials, options));
  }

  countPosOrders(domain?: unknown[]) {
    return this.run((credentials) => this.odooRepository.countPosOrders(credentials, domain));
  }

  findAccountMoves(options?: OdooSearchReadOptions) {
    return this.run((credentials) => this.odooRepository.findAccountMoves(credentials, options));
  }

  readGroupPosOrders(options: OdooReadGroupOptions) {
    return this.run((credentials) => this.odooRepository.readGroupPosOrders(credentials, options));
  }

  readGroupAccountMoves(options: OdooReadGroupOptions) {
    return this.run((credentials) =>
      this.odooRepository.readGroupAccountMoves(credentials, options),
    );
  }

  readGroupPosPayments(options: OdooReadGroupOptions) {
    return this.run((credentials) => this.odooRepository.readGroupPosPayments(credentials, options));
  }
}
