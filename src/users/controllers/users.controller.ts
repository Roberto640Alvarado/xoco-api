import { Body, Controller, Get, HttpCode, HttpStatus, Param, Patch, Post } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiResponse, ApiTags } from '@nestjs/swagger';
import { plainToInstance } from 'class-transformer';
import { Role } from '../../generated/prisma/index.js';
import { Roles } from '../../common/decorators/roles.decorator.js';
import { User } from '../../common/decorators/user.decorator.js';
import { UsersService } from '../services/users.service.js';
import { CreateUserDto } from '../dto/create-user.dto.js';
import { SetUserActiveDto } from '../dto/set-user-active.dto.js';
import { SetUserPasswordDto } from '../dto/set-user-password.dto.js';
import { UserResponseDoc } from '../doc/user-response.doc.js';

// Exclusivo de SUPER_ADMIN (ver CLAUDE.md, "Autorización") — FINANZAS no
// administra cuentas, solo consume ventas/reportes.
@ApiTags('users')
@ApiBearerAuth()
@Roles(Role.SUPER_ADMIN)
@Controller('users')
export class UsersController {
  constructor(private readonly usersService: UsersService) {}

  @Get()
  @ApiOperation({ summary: 'Lista todos los usuarios (SUPER_ADMIN y FINANZAS), sin exponer la contraseña.' })
  @ApiResponse({ status: 200, type: [UserResponseDoc] })
  async findAll(): Promise<UserResponseDoc[]> {
    const users = await this.usersService.findAll();
    return users.map((user) =>
      plainToInstance(UserResponseDoc, user, { excludeExtraneousValues: true }),
    );
  }

  @Post()
  @ApiOperation({
    summary: 'Crea un usuario nuevo con la contraseña que el admin le asigna.',
    description:
      '`password` y `confirmPassword` deben coincidir — el admin la escribe 2 veces para evitar un error de ' +
      'tecleo. No hay envío de correo ni link de activación: la contraseña queda lista para usarse de inmediato, ' +
      'el admin se la comparte al usuario por su cuenta.',
  })
  @ApiResponse({ status: 201, type: UserResponseDoc })
  @ApiResponse({ status: 400, description: 'Las contraseñas no coinciden, o algún campo es inválido.' })
  @ApiResponse({ status: 409, description: 'Ya existe un usuario con ese correo.' })
  @HttpCode(HttpStatus.CREATED)
  async create(@Body() dto: CreateUserDto): Promise<UserResponseDoc> {
    const user = await this.usersService.createUser(dto);
    return plainToInstance(UserResponseDoc, user, { excludeExtraneousValues: true });
  }

  @Patch(':id/active')
  @ApiOperation({ summary: 'Activa o desactiva una cuenta (no la borra) — una cuenta inactiva no puede iniciar sesión.' })
  @ApiResponse({ status: 200, type: UserResponseDoc })
  @ApiResponse({ status: 403, description: 'Un SUPER_ADMIN no puede desactivar su propia cuenta.' })
  @ApiResponse({ status: 404, description: 'Usuario no encontrado.' })
  async setActive(
    @Param('id') id: string,
    @Body() dto: SetUserActiveDto,
    @User('id') actingUserId: string,
  ): Promise<UserResponseDoc> {
    const user = await this.usersService.setActive(id, dto.isActive, actingUserId);
    return plainToInstance(UserResponseDoc, user, { excludeExtraneousValues: true });
  }

  @Patch(':id/password')
  @ApiOperation({
    summary: 'Restablece la contraseña de una cuenta existente.',
    description:
      '`password` y `confirmPassword` deben coincidir. No hay envío de correo: el admin comparte la nueva ' +
      'contraseña con el usuario por su cuenta.',
  })
  @ApiResponse({ status: 200, type: UserResponseDoc })
  @ApiResponse({ status: 400, description: 'Las contraseñas no coinciden, o son inválidas.' })
  @ApiResponse({ status: 404, description: 'Usuario no encontrado.' })
  async setPassword(
    @Param('id') id: string,
    @Body() dto: SetUserPasswordDto,
  ): Promise<UserResponseDoc> {
    const user = await this.usersService.setPassword(id, dto);
    return plainToInstance(UserResponseDoc, user, { excludeExtraneousValues: true });
  }
}
