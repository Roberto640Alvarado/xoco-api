import { Injectable } from '@nestjs/common';
import * as bcrypt from 'bcryptjs';
import { UsersRepository } from '../repositories/users.repository.js';

/**
 * Lógica de negocio de usuarios. No existe endpoint público de registro
 * (ver CLAUDE.md, "Autenticación") — los usuarios (SUPER_ADMIN/FINANZAS)
 * se crean directamente en la base de datos (ver prisma/seed.mjs para el
 * SUPER_ADMIN inicial). Este service hoy solo sirve al módulo Auth.
 */
@Injectable()
export class UsersService {
  constructor(private readonly usersRepository: UsersRepository) {}

  findByEmail(email: string) {
    return this.usersRepository.findByEmail(email.toLowerCase().trim());
  }

  findById(id: string) {
    return this.usersRepository.findById(id);
  }

  validatePassword(
    plainPassword: string,
    hashedPassword: string,
  ): Promise<boolean> {
    return bcrypt.compare(plainPassword, hashedPassword);
  }
}
