import { Module } from '@nestjs/common';
import { SalesModule } from '../sales/sales.module.js';
import { SalesGoalsController } from './controllers/sales-goals.controller.js';
import { SalesGoalsService } from './services/sales-goals.service.js';
import { SalesGoalsRepository } from './repositories/sales-goals.repository.js';

@Module({
  imports: [SalesModule],
  controllers: [SalesGoalsController],
  providers: [SalesGoalsService, SalesGoalsRepository],
})
export class SalesGoalsModule {}
