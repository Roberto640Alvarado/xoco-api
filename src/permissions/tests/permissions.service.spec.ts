import { describe, expect, it } from 'vitest';
import { PermissionsService } from '../services/permissions.service.js';
import { Role } from '../../generated/prisma/index.js';

function serviceWith(rows: Array<{ role: Role; moduleKey: string; enabled: boolean }>) {
  const repository = {
    findAll: async () => rows.map((row) => ({ ...row, updatedAt: new Date(), updatedByEmail: null })),
  };
  return new PermissionsService(repository as never);
}

describe('PermissionsService.isEnabledForRole', () => {
  it('sin fila y dentro del techo, el módulo está habilitado', async () => {
    const service = serviceWith([]);
    expect(await service.isEnabledForRole(Role.VENDEDOR, 'dashboard.visitas')).toBe(true);
  });

  it('una fila apagada bloquea el módulo', async () => {
    const service = serviceWith([{ role: Role.VENDEDOR, moduleKey: 'dashboard.visitas', enabled: false }]);
    expect(await service.isEnabledForRole(Role.VENDEDOR, 'dashboard.visitas')).toBe(false);
  });

  it('un módulo fuera del techo del rol nunca cuenta como habilitado, aunque no haya fila', async () => {
    const service = serviceWith([]);
    expect(await service.isEnabledForRole(Role.VENDEDOR, 'dashboard.venta-mensual')).toBe(false);
    expect(await service.isEnabledForRole(Role.VENDEDOR, 'dashboard.trafico-tiendas')).toBe(false);
    expect(await service.isEnabledForRole(Role.VENDEDOR, 'dashboard.ticket-promedio')).toBe(false);
    expect(await service.isEnabledForRole(Role.FINANZAS, 'dashboard.venta-mensual')).toBe(true);
  });

  it('los permisos efectivos del Vendedor no incluyen las pantallas solo de Admin y Finanzas', async () => {
    const permissions = await serviceWith([]).getEffectivePermissions(Role.VENDEDOR);
    expect(permissions).not.toHaveProperty('dashboard.venta-mensual');
    expect(permissions['dashboard.venta-diaria']).toBe(true);
  });
});
