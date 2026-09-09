import { BadRequestException, ConflictException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import * as bcrypt from 'bcryptjs';
import { UsersRepository } from '../repositories/users.repository.js';
import { CreateUserDto } from '../dto/create-user.dto.js';

// Costo de bcrypt — mismo valor que usa prisma/seed.mjs para el
// SUPER_ADMIN inicial, para que todas las cuentas queden hasheadas igual
// de fuerte sin importar si se crearon por seed o desde el panel.
const BCRYPT_COST = 12;

/**
 * Lógica de negocio de usuarios. La gestión (crear/listar/activar) es
 * exclusiva de SUPER_ADMIN (ver UsersController) — no hay endpoint
 * público de auto-registro (ver CLAUDE.md, "Autenticación").
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

  findAll() {
    return this.usersRepository.findAll();
  }

  validatePassword(
    plainPassword: string,
    hashedPassword: string,
  ): Promise<boolean> {
    return bcrypt.compare(plainPassword, hashedPassword);
  }

  async createUser(dto: CreateUserDto) {
    if (dto.password !== dto.confirmPassword) {
      throw new BadRequestException('Las contraseñas no coinciden.');
    }

    const email = dto.email.toLowerCase().trim();
    const existing = await this.usersRepository.findByEmail(email);
    if (existing) {
      throw new ConflictException('Ya existe un usuario con ese correo.');
    }

    const hashedPassword = await bcrypt.hash(dto.password, BCRYPT_COST);

    return this.usersRepository.create({
      email,
      name: dto.name?.trim() || null,
      role: dto.role,
      hashedPassword,
    });
  }

  // `actingUserId` es quien hace la petición (ver UsersController) — se
  // usa para que un SUPER_ADMIN no pueda desactivar su propia cuenta y
  // quedarse afuera del panel sin que nadie más pueda reactivarlo.
  async setActive(targetUserId: string, isActive: boolean, actingUserId: string) {
    if (!isActive && targetUserId === actingUserId) {
      throw new ForbiddenException('No puedes desactivar tu propia cuenta.');
    }

    const target = await this.usersRepository.findById(targetUserId);
    if (!target) {
      throw new NotFoundException('Usuario no encontrado.');
    }

    return this.usersRepository.setActive(targetUserId, isActive);
  }
}
