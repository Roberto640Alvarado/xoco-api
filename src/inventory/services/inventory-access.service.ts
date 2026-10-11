import { ForbiddenException, Injectable } from '@nestjs/common';
import { Role } from '../../generated/prisma/index.js';
import type { AuthenticatedUser } from '../../common/interfaces/jwt-payload.interface.js';
import { InventoryAccessRepository } from '../repositories/inventory-access.repository.js';
import { InventoryAccessDoc } from '../doc/inventory-access.doc.js';

// Habilitación del módulo de Inventario por tienda. Admin y Finanzas
// trabajan con el módulo siempre (cargan primero el stock manual de cada
// tienda); el Vendedor solo entra cuando el Super admin habilitó SU tienda.
@Injectable()
export class InventoryAccessService {
  constructor(private readonly repository: InventoryAccessRepository) {}

  async findAccess(): Promise<InventoryAccessDoc> {
    return { enabledPosConfigIds: await this.repository.findEnabledPosConfigIds() };
  }

  async setEnabled(posConfigId: number, enabled: boolean, updatedByEmail: string): Promise<InventoryAccessDoc> {
    await this.repository.upsert(posConfigId, enabled, updatedByEmail);
    return this.findAccess();
  }

  // ¿Puede este usuario usar Inventario en esta tienda? Solo restringe al
  // Vendedor; Admin/Finanzas siempre pasan.
  async isEnabledFor(user: AuthenticatedUser, posConfigId: number | null): Promise<boolean> {
    if (user.role !== Role.VENDEDOR) return true;
    if (posConfigId == null) return false;
    return this.repository.isEnabled(posConfigId);
  }

  async assertEnabledFor(user: AuthenticatedUser, posConfigId: number | null): Promise<void> {
    if (await this.isEnabledFor(user, posConfigId)) return;
    throw new ForbiddenException('El inventario todavía no está habilitado para tu tienda.');
  }
}
