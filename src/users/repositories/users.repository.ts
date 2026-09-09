import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service.js';
import { Role } from '../../generated/prisma/index.js';

interface CreateUserData {
  email: string;
  name: string | null;
  role: Role;
  hashedPassword: string;
}

interface UpdateUserData {
  email: string;
  name: string | null;
  role: Role;
}

// Único acceso a datos permitido a la colección users — el resto de la
// app pasa siempre por UsersService, nunca por Prisma directo.
@Injectable()
export class UsersRepository {
  constructor(private readonly prisma: PrismaService) {}

  findByEmail(email: string) {
    return this.prisma.user.findUnique({ where: { email } });
  }

  findById(id: string) {
    return this.prisma.user.findUnique({ where: { id } });
  }

  findAll() {
    return this.prisma.user.findMany({ orderBy: { createdAt: 'asc' } });
  }

  create(data: CreateUserData) {
    return this.prisma.user.create({
      data: {
        email: data.email,
        name: data.name,
        role: data.role,
        password: data.hashedPassword,
      },
    });
  }

  setActive(id: string, isActive: boolean) {
    return this.prisma.user.update({ where: { id }, data: { isActive } });
  }

  setPassword(id: string, hashedPassword: string) {
    return this.prisma.user.update({ where: { id }, data: { password: hashedPassword } });
  }

  updateUser(id: string, data: UpdateUserData) {
    return this.prisma.user.update({ where: { id }, data });
  }
}
