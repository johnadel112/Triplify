import { Body, Controller, Get, Param, Post } from '@nestjs/common';
import { ApiCookieAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { Public, Roles } from '../auth/guards';
import { UserRole } from '../common/domain';
import { ObjectIdPipe } from '../common/http';
import { CreateAirlineDto } from './flights.dto';
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

  @Get(':id')
  @Public()
  @ApiOperation({ summary: 'FLT-01: Public airline profile' })
  get(@Param('id', ObjectIdPipe) id: string) {
    return this.flights.getAirline(id);
  }
}
