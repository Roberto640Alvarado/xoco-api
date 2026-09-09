import { BadRequestException, ConflictException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import * as bcrypt from 'bcryptjs';
import { UsersRepository } from '../repositories/users.repository.js';
import { CreateUserDto } from '../dto/create-user.dto.js';
import { SetUserPasswordDto } from '../dto/set-user-password.dto.js';
import { UpdateUserDto } from '../dto/update-user.dto.js';

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

  // Restablece la contraseña de una cuenta existente — mismo criterio que
  // createUser (password + confirmPassword deben coincidir, se hashea al
  // mismo costo). No hay envío de correo: el admin se la comparte al
  // usuario por su cuenta, igual que al crear la cuenta.
  async setPassword(targetUserId: string, dto: SetUserPasswordDto) {
    if (dto.password !== dto.confirmPassword) {
      throw new BadRequestException('Las contraseñas no coinciden.');
    }

    const target = await this.usersRepository.findById(targetUserId);
    if (!target) {
      throw new NotFoundException('Usuario no encontrado.');
    }

    const hashedPassword = await bcrypt.hash(dto.password, BCRYPT_COST);
    return this.usersRepository.setPassword(targetUserId, hashedPassword);
  }

  // Edita correo/nombre/rol de una cuenta existente (nunca la contraseña,
  // ver setPassword). Un SUPER_ADMIN no puede cambiar su propio rol desde
  // acá — mismo criterio de "no quedarte afuera sin que nadie más pueda
  // arreglarlo" que ya aplica setActive con la auto-desactivación; sí
  // puede editar su propio correo/nombre sin restricción.
  async updateUser(targetUserId: string, dto: UpdateUserDto, actingUserId: string) {
    const target = await this.usersRepository.findById(targetUserId);
    if (!target) {
      throw new NotFoundException('Usuario no encontrado.');
    }

    const email = dto.email.toLowerCase().trim();
    if (email !== target.email) {
      const existing = await this.usersRepository.findByEmail(email);
      if (existing) {
        throw new ConflictException('Ya existe un usuario con ese correo.');
      }
    }

    if (dto.role !== target.role && targetUserId === actingUserId) {
      throw new ForbiddenException('No puedes cambiar tu propio rol.');
    }

    return this.usersRepository.updateUser(targetUserId, {
      email,
      name: dto.name?.trim() || null,
      role: dto.role,
    });
  }
}
