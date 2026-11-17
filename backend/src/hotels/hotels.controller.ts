import { Body, Controller, Get, Param, Patch, Post } from '@nestjs/common';
import { ApiCookieAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { CurrentUser, Public, Roles } from '../auth/guards';
import { Principal, UserRole } from '../common/domain';
import { ObjectIdPipe } from '../common/http';
import { CreateHotelDto, UpdateHotelDto } from './create-hotel.dto';
import { UpdateHotelPoliciesDto } from './hotel-policies.dto';
import { HotelsService } from './hotels.service';

@ApiTags('Hotels')
@ApiCookieAuth()
@Controller('hotels')
export class HotelsController {
  constructor(private readonly hotelsService: HotelsService) {}

  @Post()
  @Roles(UserRole.ADMIN)
  @ApiOperation({ summary: 'HTL-01: Create hotel profile' })
  createHotel(@CurrentUser() actor: Principal, @Body() dto: CreateHotelDto) {
    return this.hotelsService.create(dto, actor);
  }

  @Public()
  @Get(':id')
  @ApiOperation({ summary: 'HTL-02: Public hotel details' })
  getHotel(@Param('id', ObjectIdPipe) id: string) {
    return this.hotelsService.findById(id);
  }

  @Patch(':id')
  @Roles(UserRole.HOTEL_MODERATOR)
  @ApiOperation({ summary: 'HTL-01: Edit assigned hotel profile' })
  updateHotel(
    @CurrentUser() actor: Principal,
    @Param('id', ObjectIdPipe) id: string,
    @Body() dto: UpdateHotelDto,
  ) {
    return this.hotelsService.update(id, dto, actor);
  }

  @Patch(':id/policies')
  @Roles(UserRole.HOTEL_MODERATOR)
  @ApiOperation({ summary: 'HTL-09/10: Update hotel local check-in/out times and cancellation tiers' })
  updatePolicies(
    @CurrentUser() actor: Principal,
    @Param('id', ObjectIdPipe) id: string,
    @Body() dto: UpdateHotelPoliciesDto,
  ) {
    return this.hotelsService.updatePolicies(id, dto, actor);
  }
}
