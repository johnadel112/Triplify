import { Body, Controller, Get, Param, Post } from '@nestjs/common';
import { ApiCookieAuth, ApiOperation, ApiResponse, ApiTags } from '@nestjs/swagger';
import { CurrentUser } from '../auth/guards';
import { Principal } from '../common/domain';
import { ObjectIdPipe } from '../common/http';
import { RefundsService } from './refunds.service';
import { ProcessRefundDto } from './payments.dto';

@ApiTags('Refunds')
@ApiCookieAuth()
@Controller('refunds')
export class RefundsController {
  constructor(private readonly refundsService: RefundsService) {}

  @Get(':id')
  @ApiOperation({ summary: 'Inspect refund details and status (PAY-03)' })
  @ApiResponse({ status: 200, description: 'Refund details returned' })
  async getRefund(
    @CurrentUser() actor: Principal,
    @Param('id', ObjectIdPipe) id: string,
  ) {
    return this.refundsService.getRefund(id, actor.id, actor.role === 'ADMIN');
  }

  @Post()
  @ApiOperation({
    summary:
      'Process a cancellation refund based on provider tiers or 100% for provider-initiated (PAY-03)',
  })
  @ApiResponse({ status: 201, description: 'Refund processed through Stripe API' })
  async processRefund(
    @CurrentUser() actor: Principal,
    @Body() dto: ProcessRefundDto,
  ) {
    return this.refundsService.processRefund(actor.id, dto);
  }
}

