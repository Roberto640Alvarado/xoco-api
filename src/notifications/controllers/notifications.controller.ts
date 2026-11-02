import { Controller, Get, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { Role } from '../../generated/prisma/index.js';
import { Roles } from '../../common/decorators/roles.decorator.js';
import { User } from '../../common/decorators/user.decorator.js';
import type { AuthenticatedUser } from '../../common/interfaces/jwt-payload.interface.js';
import { FindNotificationsQueryDto } from '../dto/find-notifications-query.dto.js';
import { NotificationsService } from '../services/notifications.service.js';

@ApiTags('notifications')
@ApiBearerAuth()
@Roles(Role.SUPER_ADMIN, Role.FINANZAS, Role.VENDEDOR, Role.PLANTA)
@Controller('notifications')
export class NotificationsController {
  constructor(private readonly notificationsService: NotificationsService) {}

  @Get()
  @ApiOperation({
    summary: 'Notificaciones del usuario según su rol: solicitudes de stock y movimientos de inventario que piden atención.',
  })
  find(@User() user: AuthenticatedUser, @Query() query: FindNotificationsQueryDto) {
    return this.notificationsService.find(user, query.sinceMovements ? new Date(query.sinceMovements) : undefined);
  }
}
