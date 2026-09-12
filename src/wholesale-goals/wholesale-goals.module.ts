import { Module } from '@nestjs/common';
import { SalesModule } from '../sales/sales.module.js';
import { WholesaleGoalsController } from './controllers/wholesale-goals.controller.js';
import { WholesaleGoalsService } from './services/wholesale-goals.service.js';
import { WholesaleGoalsRepository } from './repositories/wholesale-goals.repository.js';

@Module({
  imports: [SalesModule],
  controllers: [WholesaleGoalsController],
  providers: [WholesaleGoalsService, WholesaleGoalsRepository],
})
export class WholesaleGoalsModule {}
