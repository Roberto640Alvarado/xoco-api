import { Module } from '@nestjs/common';
import { SalesModule } from '../sales/sales.module.js';
import { GoalsController } from './controllers/goals.controller.js';
import { GoalsService } from './services/goals.service.js';
import { GoalsRepository } from './repositories/goals.repository.js';

@Module({
  imports: [SalesModule],
  controllers: [GoalsController],
  providers: [GoalsService, GoalsRepository],
})
export class GoalsModule {}
