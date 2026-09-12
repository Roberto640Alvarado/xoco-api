import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service.js';
import { Role } from '../../generated/prisma/index.js';

// Único acceso a datos permitido a la colección role_module_access — el
// resto de la app pasa siempre por PermissionsService, nunca por Prisma
// directo (mismo criterio que UsersRepository).
@Injectable()
export class PermissionsRepository {
  constructor(private readonly prisma: PrismaService) {}

  findAll() {
    return this.prisma.roleModuleAccess.findMany();
  }

  findOne(role: Role, moduleKey: string) {
    return this.prisma.roleModuleAccess.findUnique({
      where: { role_moduleKey: { role, moduleKey } },
    });
  }

  upsert(role: Role, moduleKey: string, enabled: boolean, updatedByEmail: string) {
    return this.prisma.roleModuleAccess.upsert({
      where: { role_moduleKey: { role, moduleKey } },
      update: { enabled, updatedByEmail },
      create: { role, moduleKey, enabled, updatedByEmail },
    });
  }
}
