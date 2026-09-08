import { Injectable, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { PrismaClient } from '../generated/prisma/index.js';

// Wrapper de Nest sobre el PrismaClient generado — conecta al iniciar el
// módulo y desconecta limpiamente al apagar la app, en vez de dejar que
// cada consumidor cree su propia instancia (una sola conexión compartida
// vía Dependency Injection).
@Injectable()
export class PrismaService
  extends PrismaClient
  implements OnModuleInit, OnModuleDestroy
{
  async onModuleInit() {
    await this.$connect();
  }

  async onModuleDestroy() {
    await this.$disconnect();
  }
}
