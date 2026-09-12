import { Body, Controller, Get, HttpCode, HttpStatus, Post } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiResponse, ApiTags } from '@nestjs/swagger';
import { Public } from '../../common/decorators/public.decorator.js';
import { User } from '../../common/decorators/user.decorator.js';
import { AuthService } from '../services/auth.service.js';
import { LoginDto } from '../dto/login.dto.js';
import { AuthResponseDoc } from '../doc/auth-response.doc.js';
import { AuthMeResponseDoc } from '../doc/auth-me-response.doc.js';

@ApiTags('auth')
@Controller('auth')
export class AuthController {
  constructor(private readonly authService: AuthService) {}

  @Public()
  @Post('login')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Inicia sesión con correo y contraseña.' })
  @ApiResponse({ status: 200, description: 'Inicio de sesión exitoso.', type: AuthResponseDoc })
  @ApiResponse({ status: 401, description: 'Credenciales inválidas.' })
  login(@Body() dto: LoginDto): Promise<AuthResponseDoc> {
    return this.authService.login(dto);
  }

  @Get('me')
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Retorna la información del usuario dueño del token.' })
  @ApiResponse({ status: 200, description: 'Información del usuario, incluyendo sus permisos efectivos por módulo.', type: AuthMeResponseDoc })
  @ApiResponse({ status: 401, description: 'Token inválido, expirado o no proporcionado.' })
  getProfile(@User('id') userId: string): Promise<AuthMeResponseDoc> {
    return this.authService.getProfile(userId);
  }
}
