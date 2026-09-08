import { Module } from '@nestjs/common';
import { APP_GUARD } from '@nestjs/core';
import { AppController } from './app.controller.js';
import { AppService } from './app.service.js';
import { PrismaModule } from './prisma/prisma.module.js';
import { UsersModule } from './users/users.module.js';
import { AuthModule } from './auth/auth.module.js';
import { OdooModule } from './odoo/odoo.module.js';
import { SalesModule } from './sales/sales.module.js';
import { JwtAuthGuard } from './common/guards/jwt-auth.guard.js';
import { RolesGuard } from './common/guards/roles.guard.js';

// @nestjs/observe (tracing/logs/métricas hospedado) quedó deliberadamente
// SIN configurar (decisión explícita: "Dejarlo por ahora, sin
// configurar"). Antes estaba registrado igual con credenciales de
// ejemplo ('YOUR_APP_KEY'/'YOUR_APP_SECRET'), lo que hacía que la app SÍ
// intentara mandar telemetría a observe.nestjs.com en cada arranque y
// recibiera un 401 (el ERROR que viste en consola) — inofensivo para la
// API en sí (arranca y sirve normal), pero ruido/una llamada de red de
// más que nunca iba a funcionar con esas credenciales. Quitado del todo
// por ahora; para activarlo de verdad más adelante: crear cuenta en
// https://observe.nestjs.com, y volver a agregar `createObserveModule()`
// + `ObserveModule.forRoot({ appKey, appSecret, serviceId })` aquí con
// las credenciales reales (idealmente desde variables de entorno, no
// hardcodeadas), y pasar `instrument: ObserveInstrument` en main.ts.
@Module({
  imports: [PrismaModule, UsersModule, AuthModule, OdooModule, SalesModule],
  controllers: [AppController],
  providers: [
    AppService,
    // Orden importa: primero autenticación (JWT), luego autorización (rol).
    // Endpoints marcados @Public() (ej. POST /auth/login) omiten ambos.
    { provide: APP_GUARD, useClass: JwtAuthGuard },
    { provide: APP_GUARD, useClass: RolesGuard },
  ],
})
export class AppModule {}
