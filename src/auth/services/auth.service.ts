import { Injectable, UnauthorizedException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { plainToInstance } from 'class-transformer';
import { UsersService } from '../../users/services/users.service.js';
import { UserResponseDoc } from '../../users/doc/user-response.doc.js';
import { JwtPayload } from '../../common/interfaces/jwt-payload.interface.js';
import { LoginDto } from '../dto/login.dto.js';
import { AuthResponseDoc } from '../doc/auth-response.doc.js';

@Injectable()
export class AuthService {
  constructor(
    private readonly usersService: UsersService,
    private readonly jwtService: JwtService,
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

    return {
      accessToken,
      user: plainToInstance(UserResponseDoc, user, {
        excludeExtraneousValues: true,
      }),
    };
  }

  async getProfile(userId: string): Promise<UserResponseDoc> {
    const user = await this.usersService.findById(userId);

    if (!user) {
      throw new UnauthorizedException('Usuario no encontrado.');
    }

    return plainToInstance(UserResponseDoc, user, {
      excludeExtraneousValues: true,
    });
  }
}
