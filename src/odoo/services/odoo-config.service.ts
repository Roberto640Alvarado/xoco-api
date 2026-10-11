import { Injectable } from '@nestjs/common';
import { OdooConfigRepository } from '../repositories/odoo-config.repository.js';
import { RotateOdooConfigDto } from '../dto/rotate-odoo-config.dto.js';
import { maskApiKey, OdooConfigHistoryItemDoc, OdooConfigResponseDoc } from '../doc/odoo-config-response.doc.js';

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

  async rotate(dto: RotateOdooConfigDto, createdByEmail: string | null): Promise<OdooConfigResponseDoc> {
    const config = await this.odooConfigRepository.rotate(
      { apiKey: dto.apiKey, uid: dto.uid, durationDays: dto.durationDays },
      createdByEmail,
    );

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

  async getHistory(): Promise<OdooConfigHistoryItemDoc[]> {
    const rows = await this.odooConfigRepository.findAll();
    return rows.map((row) => ({
      id: row.id,
      apiKeyMasked: maskApiKey(row.apiKey),
      uid: row.uid,
      durationDays: row.durationDays,
      createdAt: row.createdAt,
      expiresAt: row.expiresAt,
      isActive: row.isActive,
      isExpired: row.expiresAt.getTime() <= Date.now(),
      createdByEmail: row.createdByEmail ?? null,
    }));
  }
}
