import { Body, Controller, Get, Headers, Param, Post, Req } from '@nestjs/common';
import { ApiCookieAuth, ApiOperation, ApiResponse, ApiTags } from '@nestjs/swagger';
import { CurrentUser, Public, SkipCsrf } from '../auth/guards';
import { Principal } from '../common/domain';
import { ObjectIdPipe } from '../common/http';
import { CreatePaymentDto } from './payments.dto';
import { PaymentsService } from './payments.service';

@ApiTags('Payments')
@Controller('payments')
export class PaymentsController {
  constructor(private readonly paymentsService: PaymentsService) {}

  @Post()
  @ApiCookieAuth()
  @ApiOperation({
    summary:
      'Create a Stripe test-mode PaymentIntent for a Pending Payment flight or hotel booking',
  })
  @ApiResponse({ status: 201, description: 'PaymentIntent created with clientSecret' })
  @ApiResponse({
    status: 400,
    description: 'Policies must be accepted before payment or booking expired',
  })
  async createPayment(@CurrentUser() actor: Principal, @Body() dto: CreatePaymentDto) {
    return this.paymentsService.createPayment(actor.id, dto);
  }

  @Post(':id/retry')
  @ApiCookieAuth()
  @ApiOperation({ summary: 'Retry a failed or pending payment' })
  @ApiResponse({ status: 200, description: 'Payment retry initiated' })
  async retryPayment(
    @CurrentUser() actor: Principal,
    @Param('id', ObjectIdPipe) id: string,
  ) {
    return this.paymentsService.retryPayment(actor.id, id);
  }

  @Get(':id')
  @ApiCookieAuth()
  @ApiOperation({ summary: 'Inspect payment status and transaction details' })
  @ApiResponse({ status: 200, description: 'Payment details returned' })
  async getPayment(
    @CurrentUser() actor: Principal,
    @Param('id', ObjectIdPipe) id: string,
  ) {
    return this.paymentsService.getPayment(id, actor.id, actor.role === 'ADMIN');
  }

  @Post('webhook')
  @Public()
  @SkipCsrf()
  @ApiOperation({ summary: 'Stripe webhook endpoint for payment event verification' })
  @ApiResponse({ status: 200, description: 'Webhook event processed' })
  async handleWebhook(
    @Req() req: any,
    @Body() body: any,
    @Headers('stripe-signature') signature?: string,
  ) {
    const rawBody = req.rawBody || body;
    return this.paymentsService.handleWebhook(rawBody, signature);
  }
}

