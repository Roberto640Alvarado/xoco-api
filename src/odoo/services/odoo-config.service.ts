import { Injectable } from '@nestjs/common';
import { OdooConfigRepository } from '../repositories/odoo-config.repository.js';
import { RotateOdooConfigDto } from '../dto/rotate-odoo-config.dto.js';
import { maskApiKey, OdooConfigResponseDoc } from '../doc/odoo-config-response.doc.js';

// Administración del API key de Odoo (solo SUPER_ADMIN, ver
// OdooConfigController) — separado de OdooService (que solo LEE la config
// activa para hacer llamadas a Odoo, nunca la modifica).
@Injectable()
export class OdooConfigService {
  constructor(private readonly odooConfigRepository: OdooConfigRepository) {}

  async getCurrent(): Promise<OdooConfigResponseDoc | null> {
    const config = await this.odooConfigRepository.findActive();
    if (!config) return null;

    return {
      apiKeyMasked: maskApiKey(config.apiKey),
      uid: config.uid,
      durationDays: config.durationDays,
      expiresAt: config.expiresAt,
      isExpired: config.expiresAt.getTime() <= Date.now(),
      isActive: config.isActive,
      updatedAt: config.updatedAt,
    };
  }

  async rotate(dto: RotateOdooConfigDto): Promise<OdooConfigResponseDoc> {
    const config = await this.odooConfigRepository.rotate({
      apiKey: dto.apiKey,
      uid: dto.uid,
      durationDays: dto.durationDays,
    });

    return {
      apiKeyMasked: maskApiKey(config.apiKey),
      uid: config.uid,
      durationDays: config.durationDays,
      expiresAt: config.expiresAt,
      isExpired: config.expiresAt.getTime() <= Date.now(),
      isActive: config.isActive,
      updatedAt: config.updatedAt,
    };
  }
}
