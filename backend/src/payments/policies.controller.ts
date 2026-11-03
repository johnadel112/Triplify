import { Body, Controller, Get, Param, Post } from '@nestjs/common';
import { ApiCookieAuth, ApiOperation, ApiResponse, ApiTags } from '@nestjs/swagger';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import { CurrentUser } from '../auth/guards';
import { Principal } from '../common/domain';
import { BookingType } from './payments.constants';
import { PolicyAcceptance } from './payments.schema';
import { AcceptPoliciesDto } from './payments.dto';

@ApiTags('Policies')
@ApiCookieAuth()
@Controller('bookings')
export class PoliciesController {
  constructor(
    @InjectModel(PolicyAcceptance.name)
    private readonly policyAcceptanceModel: Model<PolicyAcceptance>,
  ) {}

  @Get(':type/:id/policies')
  @ApiOperation({
    summary:
      'Show provider policies before payment (airline: cancellation & baggage; hotel: cancellation & check-in/out)',
  })
  @ApiResponse({ status: 200, description: 'Provider policies returned' })
  async getPolicies(
    @Param('type') type: BookingType,
    @Param('id') bookingId: string,
  ) {
    if (type === BookingType.FLIGHT) {
      return {
        bookingId,
        bookingType: type,
        policies: {
          baggagePolicy: {
            allowance: '1 free bag up to 23kg',
            extraBagFee: 'USD 50.00 per additional bag',
          },
          cancellationPolicy: {
            tiers: [
              { daysBefore: 7, refundPercentage: 100 },
              { daysBefore: 2, refundPercentage: 50 },
              { daysBefore: 0, refundPercentage: 0 },
            ],
            notes: 'Cancellations within 48 hours of departure are non-refundable.',
          },
        },
      };
    }

    return {
      bookingId,
      bookingType: type,
      policies: {
        checkInTime: '15:00',
        checkOutTime: '11:00',
        cancellationPolicy: {
          tiers: [
            { daysBefore: 3, refundPercentage: 100 },
            { daysBefore: 1, refundPercentage: 50 },
            { daysBefore: 0, refundPercentage: 0 },
          ],
          notes: 'Free cancellation up to 3 days before check-in.',
        },
      },
    };
  }

  @Post(':type/:id/accept-policies')
  @ApiOperation({
    summary:
      'Record explicit acceptance of provider policies with timestamp before payment (PAY-02)',
  })
  @ApiResponse({ status: 200, description: 'Policy acceptance recorded with timestamp' })
  async acceptPolicies(
    @CurrentUser() actor: Principal,
    @Param('type') type: BookingType,
    @Param('id') bookingId: string,
    @Body() dto: AcceptPoliciesDto,
  ) {
    const acceptedAt = new Date();

    const record = await this.policyAcceptanceModel.findOneAndUpdate(
      {
        bookingId,
        userId: new Types.ObjectId(actor.id),
      },
      {
        bookingType: type,
        accepted: dto.accepted,
        acceptedAt,
      },
      { upsert: true, new: true },
    );

    return {
      success: true,
      bookingId,
      bookingType: type,
      accepted: record.accepted,
      acceptedAt: record.acceptedAt,
    };
  }
}

