import { Module } from '@nestjs/common';
import { PermissionsRepository } from './repositories/permissions.repository.js';
import { PermissionsService } from './services/permissions.service.js';
import { PermissionsController } from './controllers/permissions.controller.js';

@Module({
  controllers: [PermissionsController],
  providers: [PermissionsRepository, PermissionsService],
  exports: [PermissionsService],
})
export class PermissionsModule {}
