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
import { OdooCredentials, OdooSearchReadOptions } from '../types/odoo-common.types.js';

// Única puerta de entrada al módulo Odoo para el resto de la app. Resuelve
// las credenciales (uid/apiKey desde Mongo, baseUrl/db desde env) en cada
// llamada, valida que el API key no esté vencido, y traduce cualquier
// falla de Odoo (timeout, key vencida/ausente, error de Odoo) a una
// excepción propia de Nest en vez de dejar pasar el error crudo.
@Injectable()
export class OdooService {
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

    return { baseUrl, db, uid: config.uid, apiKey: config.apiKey };
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
}
