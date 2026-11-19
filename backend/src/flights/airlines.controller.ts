import { Body, Controller, Get, Param, Post, Put } from '@nestjs/common';
import { ApiCookieAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { CurrentUser, Public, Roles } from '../auth/guards';
import { Principal, UserRole } from '../common/domain';
import { ObjectIdPipe } from '../common/http';
import { AirlineCancellationPolicyDto, BaggagePolicyDto, CreateAirlineDto } from './flights.dto';
import { FlightsService } from './flights.service';

/** FLT-01: airline profiles. Admins create airlines; moderators then manage their own. */
@ApiTags('Airlines')
@Controller('airlines')
export class AirlinesController {
  constructor(private readonly flights: FlightsService) {}

  @Post()
  @ApiCookieAuth()
  @Roles(UserRole.ADMIN)
  @ApiOperation({
    summary:
      'FLT-01: Admin creates an airline profile; then create its moderator with this id as providerId',
  })
  create(@Body() dto: CreateAirlineDto) {
    return this.flights.createAirline(dto);
  }

  @Put(':id/baggage-policy')
  @ApiCookieAuth()
  @Roles(UserRole.AIRLINE_MODERATOR)
  @ApiOperation({ summary: 'FLT-08: Price per extra bag and max extra bags per passenger (my airline)' })
  baggagePolicy(
    @CurrentUser() user: Principal,
    @Param('id', ObjectIdPipe) id: string,
    @Body() dto: BaggagePolicyDto,
  ) {
    return this.flights.setBaggagePolicy(id, user.providerId, dto);
  }

  @Put(':id/cancellation-policy')
  @ApiCookieAuth()
  @Roles(UserRole.AIRLINE_MODERATOR)
  @ApiOperation({
    summary: 'FLT-09: Cancellation tiers by days before departure with refund percentages (my airline)',
  })
  cancellationPolicy(
    @CurrentUser() user: Principal,
    @Param('id', ObjectIdPipe) id: string,
    @Body() dto: AirlineCancellationPolicyDto,
  ) {
    return this.flights.setCancellationPolicy(id, user.providerId, dto);
  }

  @Get(':id')
  @Public()
  @ApiOperation({ summary: 'FLT-01: Public airline profile' })
  get(@Param('id', ObjectIdPipe) id: string) {
    return this.flights.getAirline(id);
  }
}
