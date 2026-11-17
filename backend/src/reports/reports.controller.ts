import { Body, Controller, Post } from '@nestjs/common';
import { ApiCookieAuth, ApiOperation, ApiResponse, ApiTags } from '@nestjs/swagger';
import { CurrentUser } from '../auth/guards';
import { Principal } from '../common/domain';
import { CreateReportDto } from './reports.dto';
import { ReportsService } from './reports.service';

@ApiTags('Reports')
@ApiCookieAuth()
@Controller('reports')
export class ReportsController {
  constructor(private readonly reportsService: ReportsService) {}

  @Post()
  @ApiOperation({
    summary:
      'Report a post, comment, review, or itinerary with a reason (max once per item)',
  })
  @ApiResponse({ status: 201, description: 'Report successfully submitted' })
  @ApiResponse({ status: 409, description: 'Item has already been reported by this user' })
  async createReport(@CurrentUser() actor: Principal, @Body() dto: CreateReportDto) {
    return this.reportsService.createReport(actor.id, dto);
  }
}

