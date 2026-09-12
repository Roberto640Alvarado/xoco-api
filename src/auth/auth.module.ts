import { Module } from '@nestjs/common';
import { JwtModule, JwtModuleOptions } from '@nestjs/jwt';
import { PassportModule } from '@nestjs/passport';
import { AuthController } from './controllers/auth.controller.js';
import { AuthService } from './services/auth.service.js';
import { JwtStrategy } from './strategies/jwt.strategy.js';
import { UsersModule } from '../users/users.module.js';
import { PermissionsModule } from '../permissions/permissions.module.js';

@Module({
  imports: [
    UsersModule,
    PermissionsModule,
    PassportModule.register({ defaultStrategy: 'jwt' }),
    // useFactory se evalúa al instanciar el módulo (durante el bootstrap de
    // Nest), no al importar el archivo — para ese momento, process.env.JWT_SECRET
    // ya está poblado (PrismaModule, importado antes en AppModule, dispara la
    // carga del .env como efecto secundario de instanciar el cliente Prisma
    // generado — igual que hace OdooService con ODOO_BASE_URL/ODOO_DB).
    JwtModule.registerAsync({
      useFactory: (): JwtModuleOptions => {
        const secret = process.env.JWT_SECRET;

        if (!secret) {
          throw new Error('JWT_SECRET no está definido en las variables de entorno.');
        }

        return {
          secret,
          signOptions: {
            expiresIn: process.env.JWT_EXPIRATION ?? '7d',
          } as JwtModuleOptions['signOptions'],
        };
      },
    }),
  ],
  controllers: [AuthController],
  providers: [AuthService, JwtStrategy],
})
export class AuthModule {}
