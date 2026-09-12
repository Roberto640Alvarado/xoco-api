import { Module } from '@nestjs/common';
import { SalesModule } from '../sales/sales.module.js';
import { UsersRepository } from './repositories/users.repository.js';
import { UsersService } from './services/users.service.js';
import { UsersController } from './controllers/users.controller.js';

@Module({
  // SalesModule: UsersService necesita SalesService.findStores() para
  // validar que la tienda asignada a un Vendedor sea una tienda real
  // (ver createUser/updateUser).
  imports: [SalesModule],
  controllers: [UsersController],
  providers: [UsersRepository, UsersService],
  exports: [UsersService],
})
export class UsersModule {}
