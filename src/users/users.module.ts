import { Module } from '@nestjs/common';
import { UsersRepository } from './repositories/users.repository.js';
import { UsersService } from './services/users.service.js';
import { UsersController } from './controllers/users.controller.js';

@Module({
  controllers: [UsersController],
  providers: [UsersRepository, UsersService],
  exports: [UsersService],
})
export class UsersModule {}
