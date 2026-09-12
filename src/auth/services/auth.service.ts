import { Injectable, UnauthorizedException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { plainToInstance } from 'class-transformer';
import { UsersService } from '../../users/services/users.service.js';
import { AuthMeResponseDoc } from '../doc/auth-me-response.doc.js';
import { PermissionsService } from '../../permissions/services/permissions.service.js';
import { JwtPayload } from '../../common/interfaces/jwt-payload.interface.js';
import { LoginDto } from '../dto/login.dto.js';
import { AuthResponseDoc } from '../doc/auth-response.doc.js';

@Injectable()
export class AuthService {
  constructor(
    private readonly usersService: UsersService,
    private readonly jwtService: JwtService,
    private readonly permissionsService: PermissionsService,
  ) {}

  async login(dto: LoginDto): Promise<AuthResponseDoc> {
    const user = await this.usersService.findByEmail(dto.email);

    if (!user) {
      throw new UnauthorizedException('Credenciales inválidas.');
    }

    const isPasswordValid = await this.usersService.validatePassword(
      dto.password,
      user.password,
    );

    if (!isPasswordValid) {
      throw new UnauthorizedException('Credenciales inválidas.');
    }

    if (!user.isActive) {
      throw new UnauthorizedException('Esta cuenta se encuentra desactivada.');
    }

    const payload: JwtPayload = { sub: user.id, email: user.email, role: user.role };
    const accessToken = this.jwtService.sign(payload);
    const permissions = await this.permissionsService.getEffectivePermissions(user.role);

    return {
      accessToken,
      user: plainToInstance(
        AuthMeResponseDoc,
        { ...user, permissions },
        { excludeExtraneousValues: true },
      ),
    };
  }

  async getProfile(userId: string): Promise<AuthMeResponseDoc> {
    const user = await this.usersService.findById(userId);

    if (!user) {
      throw new UnauthorizedException('Usuario no encontrado.');
    }

    const permissions = await this.permissionsService.getEffectivePermissions(user.role);

    return plainToInstance(
      AuthMeResponseDoc,
      { ...user, permissions },
      { excludeExtraneousValues: true },
    );
  }
}
