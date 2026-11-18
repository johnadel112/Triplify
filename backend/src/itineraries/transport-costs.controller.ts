import { Body, Controller, Delete, Param, Patch } from '@nestjs/common';
import { ApiCookieAuth, ApiOkResponse, ApiOperation, ApiTags } from '@nestjs/swagger';
import { CurrentUser, Roles } from '../auth/guards';
import { Principal, UserRole } from '../common/domain';
import { UpdateTransportCostDto } from './itineraries.dto';
import { ItinerariesService } from './itineraries.service';

@ApiTags('Transport Costs')
@ApiCookieAuth()
@Controller('transport-costs')
export class TransportCostsController {
  constructor(private readonly itinerariesService: ItinerariesService) {}

  @Patch(':id')
  @Roles(UserRole.USER, UserRole.ADMIN)
  @ApiOperation({ summary: 'ITN-16: Edit an intercity transport cost entry' })
  @ApiOkResponse({ description: 'Transport cost updated' })
  updateTransportCost(
    @CurrentUser() actor: Principal,
    @Param('id') id: string,
    @Body() dto: UpdateTransportCostDto,
  ) {
    return this.itinerariesService.updateTransportCost(actor, id, dto);
  }

  @Delete(':id')
  @Roles(UserRole.USER, UserRole.ADMIN)
  @ApiOperation({ summary: 'ITN-16: Delete an intercity transport cost entry' })
  @ApiOkResponse({ description: 'Transport cost deleted' })
  deleteTransportCost(@CurrentUser() actor: Principal, @Param('id') id: string) {
    return this.itinerariesService.deleteTransportCost(actor, id);
  }
}
