import { Controller, Get, Param, Patch, Query } from '@nestjs/common';
import { ApiCookieAuth, ApiOperation, ApiResponse, ApiTags } from '@nestjs/swagger';
import { CurrentUser } from '../auth/guards';
import { Principal } from '../common/domain';
import { ObjectIdPipe } from '../common/http';
import { NotificationQueryDto } from './notifications.dto';
import { NotificationsService } from './notifications.service';

@ApiTags('Notifications')
@ApiCookieAuth()
@Controller('notifications')
export class NotificationsController {
  constructor(private readonly notificationsService: NotificationsService) {}

  @Get()
  @ApiOperation({ summary: 'List in-app notifications for logged-in user (paginated)' })
  @ApiResponse({ status: 200, description: 'Paginated notifications list' })
  async list(@CurrentUser() actor: Principal, @Query() query: NotificationQueryDto) {
    return this.notificationsService.listForUser(actor.id, query.page, query.limit);
  }

  @Get('unread-count')
  @ApiOperation({ summary: 'Get total unread in-app notification count for logged-in user' })
  @ApiResponse({ status: 200, description: 'Unread count' })
  async unreadCount(@CurrentUser() actor: Principal) {
    return this.notificationsService.getUnreadCount(actor.id);
  }

  @Patch(':id/read')
  @ApiOperation({ summary: 'Mark a specific in-app notification as read' })
  @ApiResponse({ status: 200, description: 'Notification marked as read' })
  async markRead(
    @CurrentUser() actor: Principal,
    @Param('id', ObjectIdPipe) id: string,
  ) {
    return this.notificationsService.markAsRead(actor.id, id);
  }

  @Patch('read-all')
  @ApiOperation({ summary: 'Mark all in-app notifications as read for logged-in user' })
  @ApiResponse({ status: 200, description: 'All notifications marked as read' })
  async markAllRead(@CurrentUser() actor: Principal) {
    return this.notificationsService.markAllAsRead(actor.id);
  }
}

