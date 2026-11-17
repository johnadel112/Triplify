import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import {
  ApiConflictResponse,
  ApiCookieAuth,
  ApiCreatedResponse,
  ApiNotFoundResponse,
  ApiOkResponse,
  ApiOperation,
  ApiTags,
} from '@nestjs/swagger';
import { CurrentUser, JwtAuthGuard, Public, Roles, RolesGuard } from '../auth/guards';
import { Principal, UserRole } from '../common/domain';
import {
  AddDayDto,
  BudgetSummaryQueryDto,
  CloneItineraryDto,
  CreateActivityDto,
  CreateDayBudgetDto,
  CreateItineraryDto,
  CreateTransportCostDto,
  PublicItinerarySearchDto,
  ReorderDaysDto,
  UpdateDayDto,
  UpdateItineraryDto,
} from './itineraries.dto';
import { ItinerariesService } from './itineraries.service';

@ApiTags('Itineraries')
@ApiCookieAuth()
@Controller('itineraries')
@UseGuards(JwtAuthGuard, RolesGuard)
export class ItinerariesController {
  constructor(private readonly itinerariesService: ItinerariesService) {}

  // --------------------------------------------------------------------------
  // ITN-20, ITN-21: Public Itinerary Endpoints (Must be declared before :id)
  // --------------------------------------------------------------------------

  @Public()
  @Get('public/search')
  @ApiOperation({
    summary: 'ITN-20, ITN-21: Search published public itineraries with filtering & pagination',
  })
  @ApiOkResponse({ description: 'Paginated list of public itineraries' })
  searchPublic(@Query() query: PublicItinerarySearchDto) {
    return this.itinerariesService.searchPublic(query);
  }

  @Public()
  @Get('public/:id')
  @ApiOperation({ summary: 'ITN-21: View a public itinerary detail by ID' })
  @ApiOkResponse({ description: 'Public itinerary details with days, activities and city groups' })
  @ApiNotFoundResponse({ description: 'Public itinerary not found' })
  getPublicItinerary(@Param('id') id: string) {
    return this.itinerariesService.getPublicItinerary(id);
  }

  // --------------------------------------------------------------------------
  // ITN-01, ITN-03: User Itinerary CRUD
  // --------------------------------------------------------------------------

  @Post()
  @Roles(UserRole.USER, UserRole.ADMIN)
  @ApiOperation({
    summary: 'ITN-01: Create a new itinerary with title (max 100 chars), countries and start date',
  })
  @ApiCreatedResponse({ description: 'Itinerary created successfully' })
  create(@CurrentUser() actor: Principal, @Body() dto: CreateItineraryDto) {
    return this.itinerariesService.create(actor, dto);
  }

  @Get()
  @Roles(UserRole.USER, UserRole.ADMIN)
  @ApiOperation({ summary: 'ITN-03: List all itineraries created by the authenticated user' })
  @ApiOkResponse({ description: 'List of user itineraries' })
  listMine(@CurrentUser() actor: Principal) {
    return this.itinerariesService.listUserItineraries(actor);
  }

  @Get(':id')
  @ApiOperation({ summary: 'ITN-03: View itinerary details (owner or public view)' })
  @ApiOkResponse({ description: 'Itinerary details with days, city groups, and activities' })
  @ApiNotFoundResponse({ description: 'Itinerary not found' })
  getOne(@CurrentUser() actor: Principal, @Param('id') id: string) {
    return this.itinerariesService.getItineraryById(actor, id);
  }

  @Patch(':id')
  @Roles(UserRole.USER, UserRole.ADMIN)
  @ApiOperation({
    summary: 'ITN-01, ITN-20: Update itinerary metadata, start date, or public/private visibility',
  })
  @ApiOkResponse({ description: 'Updated itinerary' })
  update(
    @CurrentUser() actor: Principal,
    @Param('id') id: string,
    @Body() dto: UpdateItineraryDto,
  ) {
    return this.itinerariesService.update(actor, id, dto);
  }

  @Delete(':id')
  @Roles(UserRole.USER, UserRole.ADMIN)
  @ApiOperation({
    summary: 'ITN-01: Delete an itinerary and all its days, activities, and budget entries',
  })
  @ApiOkResponse({ description: 'Itinerary deleted' })
  delete(@CurrentUser() actor: Principal, @Param('id') id: string) {
    return this.itinerariesService.delete(actor, id);
  }

  // --------------------------------------------------------------------------
  // ITN-21: Clone Public Itinerary
  // --------------------------------------------------------------------------

  @Post(':id/clone')
  @Roles(UserRole.USER, UserRole.ADMIN)
  @ApiOperation({
    summary:
      'ITN-21: Clone a public itinerary into an independent private copy preserving attribution',
  })
  @ApiCreatedResponse({ description: 'Cloned independent itinerary created' })
  clone(@CurrentUser() actor: Principal, @Param('id') id: string, @Body() dto: CloneItineraryDto) {
    return this.itinerariesService.clone(actor, id, dto);
  }

  // --------------------------------------------------------------------------
  // ITN-05, ITN-07, ITN-08: Days Management
  // --------------------------------------------------------------------------

  @Post(':id/days')
  @Roles(UserRole.USER, UserRole.ADMIN)
  @ApiOperation({
    summary: 'ITN-05: Add a day to itinerary; renumbers days and recalculates dates',
  })
  @ApiCreatedResponse({ description: 'Day added and itinerary recalculated' })
  addDay(@CurrentUser() actor: Principal, @Param('id') id: string, @Body() dto: AddDayDto) {
    return this.itinerariesService.addDay(actor, id, dto);
  }

  @Patch(':id/days/reorder')
  @Roles(UserRole.USER, UserRole.ADMIN)
  @ApiOperation({
    summary: 'ITN-08: Reorder itinerary days; renumbers days (1..N) and recalculates dates',
  })
  @ApiOkResponse({ description: 'Days reordered and dates recalculated' })
  reorderDays(
    @CurrentUser() actor: Principal,
    @Param('id') id: string,
    @Body() dto: ReorderDaysDto,
  ) {
    return this.itinerariesService.reorderDays(actor, id, dto);
  }

  @Patch(':id/days/:dayId')
  @Roles(UserRole.USER, UserRole.ADMIN)
  @ApiOperation({ summary: 'ITN-05: Edit an itinerary day (city, theme)' })
  @ApiOkResponse({ description: 'Day updated' })
  updateDay(
    @CurrentUser() actor: Principal,
    @Param('id') id: string,
    @Param('dayId') dayId: string,
    @Body() dto: UpdateDayDto,
  ) {
    return this.itinerariesService.updateDay(actor, id, dayId, dto);
  }

  @Delete(':id/days/:dayId')
  @Roles(UserRole.USER, UserRole.ADMIN)
  @ApiOperation({
    summary: 'ITN-07: Delete a day; automatically renumbers remaining days and recalculates dates',
  })
  @ApiOkResponse({ description: 'Day deleted and days recalculated' })
  deleteDay(
    @CurrentUser() actor: Principal,
    @Param('id') id: string,
    @Param('dayId') dayId: string,
  ) {
    return this.itinerariesService.deleteDay(actor, id, dayId);
  }

  // --------------------------------------------------------------------------
  // ITN-10: Activities on Day
  // --------------------------------------------------------------------------

  @Post(':id/days/:dayId/activities')
  @Roles(UserRole.USER, UserRole.ADMIN)
  @ApiOperation({ summary: 'ITN-10: Add an activity to an itinerary day' })
  @ApiCreatedResponse({ description: 'Activity added to day' })
  addActivity(
    @CurrentUser() actor: Principal,
    @Param('id') id: string,
    @Param('dayId') dayId: string,
    @Body() dto: CreateActivityDto,
  ) {
    return this.itinerariesService.addActivity(actor, id, dayId, dto);
  }

  // --------------------------------------------------------------------------
  // ITN-14: Day Budgets
  // --------------------------------------------------------------------------

  @Post(':id/days/:dayId/budgets')
  @Roles(UserRole.USER, UserRole.ADMIN)
  @ApiOperation({
    summary: 'ITN-14: Add a daily budget entry (food, accommodation, local transport, activities)',
  })
  @ApiCreatedResponse({ description: 'Budget entry added' })
  addDayBudget(
    @CurrentUser() actor: Principal,
    @Param('id') id: string,
    @Param('dayId') dayId: string,
    @Body() dto: CreateDayBudgetDto,
  ) {
    return this.itinerariesService.addDayBudget(actor, id, dayId, dto);
  }

  // --------------------------------------------------------------------------
  // ITN-16: Intercity Transport Costs
  // --------------------------------------------------------------------------

  @Post(':id/transport-costs')
  @Roles(UserRole.USER, UserRole.ADMIN)
  @ApiOperation({ summary: 'ITN-16: Add an intercity transport cost entry' })
  @ApiCreatedResponse({ description: 'Transport cost added' })
  addTransportCost(
    @CurrentUser() actor: Principal,
    @Param('id') id: string,
    @Body() dto: CreateTransportCostDto,
  ) {
    return this.itinerariesService.addTransportCost(actor, id, dto);
  }

  // --------------------------------------------------------------------------
  // ITN-14, ITN-18: Budget Summary & Currency Conversion
  // --------------------------------------------------------------------------

  @Get(':id/budget-summary')
  @ApiOperation({
    summary:
      'ITN-14, ITN-18: Calculate budget subtotals and overall total converted via FXRatesAPI',
  })
  @ApiOkResponse({
    description: 'Detailed budget breakdown with daily and trip totals in target currency',
  })
  getBudgetSummary(
    @CurrentUser() actor: Principal,
    @Param('id') id: string,
    @Query() query: BudgetSummaryQueryDto,
  ) {
    return this.itinerariesService.getBudgetSummary(actor, id, query.currency);
  }

  // --------------------------------------------------------------------------
  // ITN-25: Hotel Search Reuse
  // --------------------------------------------------------------------------

  @Get(':id/hotels')
  @ApiOperation({
    summary: 'ITN-25: Reuse hotel search parameters for consecutive city groups in this itinerary',
  })
  @ApiOkResponse({ description: 'Hotel search queries grouped by consecutive stay dates' })
  getHotelSearch(
    @CurrentUser() actor: Principal,
    @Param('id') id: string,
    @Query('cityGroupIndex') cityGroupIndex?: string,
  ) {
    const idx = cityGroupIndex !== undefined ? parseInt(cityGroupIndex, 10) : undefined;
    return this.itinerariesService.getHotelSearchParameters(actor, id, idx);
  }

  // --------------------------------------------------------------------------
  // ITN-26: Flight Search Reuse
  // --------------------------------------------------------------------------

  @Get(':id/flights')
  @ApiOperation({
    summary:
      'ITN-26: Reuse flight search parameters for itinerary start, return, and intercity hops',
  })
  @ApiOkResponse({
    description: 'Flight search parameters mapped to itinerary dates and destinations',
  })
  getFlightSearch(@CurrentUser() actor: Principal, @Param('id') id: string) {
    return this.itinerariesService.getFlightSearchParameters(actor, id);
  }
}
