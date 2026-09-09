import { Module } from '@nestjs/common';
import { SalesModule } from '../sales/sales.module.js';
import { TicketGoalsController } from './controllers/ticket-goals.controller.js';
import { TicketGoalsService } from './services/ticket-goals.service.js';
import { TicketGoalsRepository } from './repositories/ticket-goals.repository.js';

@Module({
  imports: [SalesModule],
  controllers: [TicketGoalsController],
  providers: [TicketGoalsService, TicketGoalsRepository],
})
export class TicketGoalsModule {}
