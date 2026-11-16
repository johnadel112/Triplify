import { Body, Controller, Delete, Param, Patch, UseGuards } from '@nestjs/common';
import { ApiCookieAuth, ApiOkResponse, ApiOperation, ApiTags } from '@nestjs/swagger';
import { CurrentUser, JwtAuthGuard, Roles, RolesGuard } from '../auth/guards';
import { Principal, UserRole } from '../common/domain';
import { UpdateDayBudgetDto } from './itineraries.dto';
import { ItinerariesService } from './itineraries.service';

@ApiTags('Budgets')
@ApiCookieAuth()
@Controller('budgets')
@UseGuards(JwtAuthGuard, RolesGuard)
export class BudgetsController {
  constructor(private readonly itinerariesService: ItinerariesService) {}

  @Patch(':id')
  @Roles(UserRole.USER, UserRole.ADMIN)
  @ApiOperation({
    summary: 'ITN-14: Edit a daily budget entry (category, amount, currency, notes)',
  })
  @ApiOkResponse({ description: 'Budget entry updated' })
  updateBudget(
    @CurrentUser() actor: Principal,
    @Param('id') id: string,
    @Body() dto: UpdateDayBudgetDto,
  ) {
    return this.itinerariesService.updateDayBudget(actor, id, dto);
  }

  @Delete(':id')
  @Roles(UserRole.USER, UserRole.ADMIN)
  @ApiOperation({ summary: 'ITN-14: Delete a daily budget entry' })
  @ApiOkResponse({ description: 'Budget entry deleted' })
  deleteBudget(@CurrentUser() actor: Principal, @Param('id') id: string) {
    return this.itinerariesService.deleteDayBudget(actor, id);
  }
}
