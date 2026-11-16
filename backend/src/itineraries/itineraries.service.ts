import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import { Principal, UserRole } from '../common/domain';
import { City, Country } from '../reference-data/reference.schema';
import { User } from '../users/user.schema';
import {
  AddDayDto,
  CloneItineraryDto,
  CreateActivityDto,
  CreateDayBudgetDto,
  CreateItineraryDto,
  CreateTransportCostDto,
  PublicItinerarySearchDto,
  ReorderDaysDto,
  UpdateActivityDto,
  UpdateDayBudgetDto,
  UpdateDayDto,
  UpdateItineraryDto,
  UpdateTransportCostDto,
} from './itineraries.dto';
import {
  Activity,
  ActivityImage,
  BudgetCategory,
  CityGroup,
  DayBudget,
  IntercityTransportCost,
  Itinerary,
  ItineraryDay,
  ItineraryDocument,
  groupConsecutiveDays,
  renumberAndRecalculateDays,
} from './itineraries.schema';
import { FxRatesService } from './fx-rates.service';

@Injectable()
export class ItinerariesService {
  constructor(
    @InjectModel(Itinerary.name) private readonly itineraryModel: Model<Itinerary>,
    @InjectModel(User.name) private readonly userModel: Model<User>,
    @InjectModel(City.name) private readonly cityModel: Model<City>,
    @InjectModel(Country.name) private readonly countryModel: Model<Country>,
    private readonly fxRatesService: FxRatesService,
  ) {}

  // -------------------------------------------------------------
  // ITN-01: Create, Update, Delete Itinerary
  // -------------------------------------------------------------

  async create(actor: Principal, dto: CreateItineraryDto) {
    if (!dto.countries || dto.countries.length === 0) {
      throw new BadRequestException('At least one country must be specified');
    }

    const itinerary = new this.itineraryModel({
      userId: new Types.ObjectId(actor.id),
      title: dto.title.trim(),
      countries: dto.countries.map((c) => c.trim().toUpperCase()),
      startDate: dto.startDate,
      description: dto.description?.trim(),
      isPublic: dto.isPublic ?? false,
      days: [],
      transportCosts: [],
    });

    return itinerary.save();
  }

  async listUserItineraries(actor: Principal) {
    const itineraries = await this.itineraryModel
      .find({ userId: new Types.ObjectId(actor.id) })
      .sort({ createdAt: -1 })
      .lean();

    return itineraries.map((itn) => ({
      ...itn,
      id: itn._id.toString(),
      totalDays: itn.days?.length ?? 0,
      cityGroups: groupConsecutiveDays(itn.days as ItineraryDay[]),
    }));
  }

  async getItineraryById(actor: Principal | null, id: string) {
    if (!Types.ObjectId.isValid(id)) {
      throw new BadRequestException('Invalid itinerary ID');
    }

    const itinerary = await this.itineraryModel.findById(id).lean();
    if (!itinerary) {
      throw new NotFoundException('Itinerary not found');
    }

    // Visibility check
    if (!itinerary.isPublic) {
      if (!actor || (itinerary.userId.toString() !== actor.id && actor.role !== UserRole.ADMIN)) {
        throw new ForbiddenException('You do not have permission to view this private itinerary');
      }
    }

    const cityGroups = groupConsecutiveDays(itinerary.days as ItineraryDay[]);
    return {
      ...itinerary,
      id: itinerary._id.toString(),
      cityGroups,
    };
  }

  async update(actor: Principal, id: string, dto: UpdateItineraryDto) {
    if (!Types.ObjectId.isValid(id)) {
      throw new BadRequestException('Invalid itinerary ID');
    }

    const itinerary = await this.itineraryModel.findById(id);
    if (!itinerary) {
      throw new NotFoundException('Itinerary not found');
    }

    this.assertOwnership(actor, itinerary);

    if (dto.title !== undefined) itinerary.title = dto.title.trim();
    if (dto.description !== undefined) itinerary.description = dto.description.trim();
    if (dto.countries !== undefined) {
      if (dto.countries.length === 0) {
        throw new BadRequestException('At least one country must be specified');
      }
      itinerary.countries = dto.countries.map((c) => c.trim().toUpperCase());
    }
    if (dto.isPublic !== undefined) itinerary.isPublic = dto.isPublic;

    if (dto.startDate && dto.startDate !== itinerary.startDate) {
      itinerary.startDate = dto.startDate;
      renumberAndRecalculateDays(itinerary.startDate, itinerary.days);
    }

    await itinerary.save();
    return this.getItineraryById(actor, id);
  }

  async delete(actor: Principal, id: string) {
    if (!Types.ObjectId.isValid(id)) {
      throw new BadRequestException('Invalid itinerary ID');
    }

    const itinerary = await this.itineraryModel.findById(id);
    if (!itinerary) {
      throw new NotFoundException('Itinerary not found');
    }

    this.assertOwnership(actor, itinerary);
    await this.itineraryModel.deleteOne({ _id: itinerary._id });
    return { success: true, message: 'Itinerary deleted successfully' };
  }

  // -------------------------------------------------------------
  // ITN-05, ITN-07, ITN-08: Days Management
  // -------------------------------------------------------------

  async addDay(actor: Principal, id: string, dto: AddDayDto) {
    if (!Types.ObjectId.isValid(id)) {
      throw new BadRequestException('Invalid itinerary ID');
    }

    const itinerary = await this.itineraryModel.findById(id);
    if (!itinerary) {
      throw new NotFoundException('Itinerary not found');
    }

    this.assertOwnership(actor, itinerary);

    const cityCode = dto.cityCode.trim().toLowerCase();
    let cityName = dto.cityName?.trim();
    if (!cityName) {
      const cityDoc = await this.cityModel.findOne({ code: cityCode });
      if (cityDoc) cityName = cityDoc.name;
    }

    const newDay: ItineraryDay = {
      _id: new Types.ObjectId(),
      dayNumber: itinerary.days.length + 1,
      date: '', // will be recalculated
      cityCode,
      cityName,
      theme: dto.theme?.trim(),
      activities: [],
      budgets: [],
    };

    if (dto.dayNumber && dto.dayNumber >= 1 && dto.dayNumber <= itinerary.days.length) {
      itinerary.days.splice(dto.dayNumber - 1, 0, newDay);
    } else {
      itinerary.days.push(newDay);
    }

    renumberAndRecalculateDays(itinerary.startDate, itinerary.days);
    await itinerary.save();
    return this.getItineraryById(actor, id);
  }

  async updateDay(actor: Principal, id: string, dayId: string, dto: UpdateDayDto) {
    if (!Types.ObjectId.isValid(id) || !Types.ObjectId.isValid(dayId)) {
      throw new BadRequestException('Invalid ID format');
    }

    const itinerary = await this.itineraryModel.findById(id);
    if (!itinerary) {
      throw new NotFoundException('Itinerary not found');
    }

    this.assertOwnership(actor, itinerary);

    const day = itinerary.days.find((d) => d._id.toString() === dayId);
    if (!day) {
      throw new NotFoundException('Day not found in itinerary');
    }

    if (dto.cityCode !== undefined) {
      const cityCode = dto.cityCode.trim().toLowerCase();
      day.cityCode = cityCode;
      let cityName = dto.cityName?.trim();
      if (!cityName) {
        const cityDoc = await this.cityModel.findOne({ code: cityCode });
        if (cityDoc) cityName = cityDoc.name;
      }
      day.cityName = cityName;
    }

    if (dto.cityName !== undefined && dto.cityCode === undefined) {
      day.cityName = dto.cityName.trim();
    }

    if (dto.theme !== undefined) {
      day.theme = dto.theme.trim();
    }

    await itinerary.save();
    return this.getItineraryById(actor, id);
  }

  async deleteDay(actor: Principal, id: string, dayId: string) {
    if (!Types.ObjectId.isValid(id) || !Types.ObjectId.isValid(dayId)) {
      throw new BadRequestException('Invalid ID format');
    }

    const itinerary = await this.itineraryModel.findById(id);
    if (!itinerary) {
      throw new NotFoundException('Itinerary not found');
    }

    this.assertOwnership(actor, itinerary);

    const initialLength = itinerary.days.length;
    itinerary.days = itinerary.days.filter((d) => d._id.toString() !== dayId);

    if (itinerary.days.length === initialLength) {
      throw new NotFoundException('Day not found in itinerary');
    }

    renumberAndRecalculateDays(itinerary.startDate, itinerary.days);
    await itinerary.save();
    return this.getItineraryById(actor, id);
  }

  async reorderDays(actor: Principal, id: string, dto: ReorderDaysDto) {
    if (!Types.ObjectId.isValid(id)) {
      throw new BadRequestException('Invalid itinerary ID');
    }

    const itinerary = await this.itineraryModel.findById(id);
    if (!itinerary) {
      throw new NotFoundException('Itinerary not found');
    }

    this.assertOwnership(actor, itinerary);

    if (dto.dayIds.length !== itinerary.days.length) {
      throw new BadRequestException(`dayIds must contain exactly ${itinerary.days.length} day IDs`);
    }

    const dayMap = new Map<string, ItineraryDay>();
    for (const d of itinerary.days) {
      dayMap.set(d._id.toString(), d);
    }

    const reordered: ItineraryDay[] = [];
    for (const dId of dto.dayIds) {
      const day = dayMap.get(dId);
      if (!day) {
        throw new BadRequestException(`Day ID ${dId} does not belong to this itinerary`);
      }
      reordered.push(day);
    }

    itinerary.days = reordered;
    renumberAndRecalculateDays(itinerary.startDate, itinerary.days);
    await itinerary.save();
    return this.getItineraryById(actor, id);
  }

  // -------------------------------------------------------------
  // ITN-10, ITN-12, GEN-08: Activities & Images Management
  // -------------------------------------------------------------

  async addActivity(actor: Principal, id: string, dayId: string, dto: CreateActivityDto) {
    if (!Types.ObjectId.isValid(id) || !Types.ObjectId.isValid(dayId)) {
      throw new BadRequestException('Invalid ID format');
    }

    const itinerary = await this.itineraryModel.findById(id);
    if (!itinerary) {
      throw new NotFoundException('Itinerary not found');
    }

    this.assertOwnership(actor, itinerary);

    const day = itinerary.days.find((d) => d._id.toString() === dayId);
    if (!day) {
      throw new NotFoundException('Day not found in itinerary');
    }

    const activity: Activity = {
      _id: new Types.ObjectId(),
      title: dto.title.trim(),
      description: dto.description?.trim(),
      time: dto.time?.trim(),
      location: dto.location?.trim(),
      cost: dto.cost ?? 0,
      currency: dto.currency?.trim().toUpperCase(),
      images: [],
    };

    day.activities.push(activity);
    await itinerary.save();
    return activity;
  }

  async updateActivity(actor: Principal, activityId: string, dto: UpdateActivityDto) {
    if (!Types.ObjectId.isValid(activityId)) {
      throw new BadRequestException('Invalid activity ID');
    }

    const itinerary = await this.itineraryModel.findOne({
      'days.activities._id': new Types.ObjectId(activityId),
    });

    if (!itinerary) {
      throw new NotFoundException('Activity not found');
    }

    this.assertOwnership(actor, itinerary);

    let targetActivity: Activity | undefined;
    for (const day of itinerary.days) {
      targetActivity = day.activities.find((a) => a._id.toString() === activityId);
      if (targetActivity) break;
    }

    if (!targetActivity) {
      throw new NotFoundException('Activity not found');
    }

    if (dto.title !== undefined) targetActivity.title = dto.title.trim();
    if (dto.description !== undefined) targetActivity.description = dto.description.trim();
    if (dto.time !== undefined) targetActivity.time = dto.time.trim();
    if (dto.location !== undefined) targetActivity.location = dto.location.trim();
    if (dto.cost !== undefined) targetActivity.cost = dto.cost;
    if (dto.currency !== undefined) targetActivity.currency = dto.currency.trim().toUpperCase();

    await itinerary.save();
    return targetActivity;
  }

  async deleteActivity(actor: Principal, activityId: string) {
    if (!Types.ObjectId.isValid(activityId)) {
      throw new BadRequestException('Invalid activity ID');
    }

    const itinerary = await this.itineraryModel.findOne({
      'days.activities._id': new Types.ObjectId(activityId),
    });

    if (!itinerary) {
      throw new NotFoundException('Activity not found');
    }

    this.assertOwnership(actor, itinerary);

    for (const day of itinerary.days) {
      day.activities = day.activities.filter((a) => a._id.toString() !== activityId);
    }

    await itinerary.save();
    return { success: true, message: 'Activity deleted successfully' };
  }

  async uploadActivityImages(
    actor: Principal,
    activityId: string,
    files: Array<{ filename: string; originalname: string; mimetype: string; size: number }>,
  ) {
    if (!Types.ObjectId.isValid(activityId)) {
      throw new BadRequestException('Invalid activity ID');
    }

    if (!files || files.length === 0) {
      throw new BadRequestException('No image files provided');
    }

    const itinerary = await this.itineraryModel.findOne({
      'days.activities._id': new Types.ObjectId(activityId),
    });

    if (!itinerary) {
      throw new NotFoundException('Activity not found');
    }

    this.assertOwnership(actor, itinerary);

    let targetActivity: Activity | undefined;
    for (const day of itinerary.days) {
      targetActivity = day.activities.find((a) => a._id.toString() === activityId);
      if (targetActivity) break;
    }

    if (!targetActivity) {
      throw new NotFoundException('Activity not found');
    }

    // GEN-08: Validation on allowed count (maximum 5 images per activity)
    if (targetActivity.images.length + files.length > 5) {
      throw new BadRequestException('An activity can have at most 5 images');
    }

    for (const file of files) {
      const allowedMimes = ['image/jpeg', 'image/png', 'image/webp'];
      if (!allowedMimes.includes(file.mimetype)) {
        throw new BadRequestException(
          `Invalid file type: ${file.mimetype}. Allowed: JPEG, PNG, WebP.`,
        );
      }
      if (file.size > 5 * 1024 * 1024) {
        throw new BadRequestException('Image file size must not exceed 5MB');
      }

      const img: ActivityImage = {
        _id: new Types.ObjectId(),
        url: `/uploads/activities/${file.filename}`,
        filename: file.filename,
        originalName: file.originalname,
        mimeType: file.mimetype,
        size: file.size,
        uploadedAt: new Date(),
      };
      targetActivity.images.push(img);
    }

    await itinerary.save();
    return targetActivity;
  }

  async deleteActivityImage(actor: Principal, activityId: string, imageId: string) {
    if (!Types.ObjectId.isValid(activityId) || !Types.ObjectId.isValid(imageId)) {
      throw new BadRequestException('Invalid ID format');
    }

    const itinerary = await this.itineraryModel.findOne({
      'days.activities._id': new Types.ObjectId(activityId),
    });

    if (!itinerary) {
      throw new NotFoundException('Activity not found');
    }

    this.assertOwnership(actor, itinerary);

    let targetActivity: Activity | undefined;
    for (const day of itinerary.days) {
      targetActivity = day.activities.find((a) => a._id.toString() === activityId);
      if (targetActivity) break;
    }

    if (!targetActivity) {
      throw new NotFoundException('Activity not found');
    }

    const initialLength = targetActivity.images.length;
    targetActivity.images = targetActivity.images.filter((img) => img._id.toString() !== imageId);

    if (targetActivity.images.length === initialLength) {
      throw new NotFoundException('Image not found in activity');
    }

    await itinerary.save();
    return { success: true, message: 'Activity image deleted successfully' };
  }

  // -------------------------------------------------------------
  // ITN-14: Daily Budgets Management
  // -------------------------------------------------------------

  async addDayBudget(actor: Principal, id: string, dayId: string, dto: CreateDayBudgetDto) {
    if (!Types.ObjectId.isValid(id) || !Types.ObjectId.isValid(dayId)) {
      throw new BadRequestException('Invalid ID format');
    }

    const itinerary = await this.itineraryModel.findById(id);
    if (!itinerary) {
      throw new NotFoundException('Itinerary not found');
    }

    this.assertOwnership(actor, itinerary);

    const day = itinerary.days.find((d) => d._id.toString() === dayId);
    if (!day) {
      throw new NotFoundException('Day not found in itinerary');
    }

    const budget: DayBudget = {
      _id: new Types.ObjectId(),
      category: dto.category,
      amount: dto.amount,
      currency: dto.currency.trim().toUpperCase(),
      description: dto.description?.trim(),
    };

    day.budgets.push(budget);
    await itinerary.save();
    return budget;
  }

  async updateDayBudget(actor: Principal, budgetId: string, dto: UpdateDayBudgetDto) {
    if (!Types.ObjectId.isValid(budgetId)) {
      throw new BadRequestException('Invalid budget ID');
    }

    const itinerary = await this.itineraryModel.findOne({
      'days.budgets._id': new Types.ObjectId(budgetId),
    });

    if (!itinerary) {
      throw new NotFoundException('Budget entry not found');
    }

    this.assertOwnership(actor, itinerary);

    let targetBudget: DayBudget | undefined;
    for (const day of itinerary.days) {
      targetBudget = day.budgets.find((b) => b._id.toString() === budgetId);
      if (targetBudget) break;
    }

    if (!targetBudget) {
      throw new NotFoundException('Budget entry not found');
    }

    if (dto.category !== undefined) targetBudget.category = dto.category;
    if (dto.amount !== undefined) targetBudget.amount = dto.amount;
    if (dto.currency !== undefined) targetBudget.currency = dto.currency.trim().toUpperCase();
    if (dto.description !== undefined) targetBudget.description = dto.description.trim();

    await itinerary.save();
    return targetBudget;
  }

  async deleteDayBudget(actor: Principal, budgetId: string) {
    if (!Types.ObjectId.isValid(budgetId)) {
      throw new BadRequestException('Invalid budget ID');
    }

    const itinerary = await this.itineraryModel.findOne({
      'days.budgets._id': new Types.ObjectId(budgetId),
    });

    if (!itinerary) {
      throw new NotFoundException('Budget entry not found');
    }

    this.assertOwnership(actor, itinerary);

    for (const day of itinerary.days) {
      day.budgets = day.budgets.filter((b) => b._id.toString() !== budgetId);
    }

    await itinerary.save();
    return { success: true, message: 'Budget entry deleted successfully' };
  }

  // -------------------------------------------------------------
  // ITN-16: Intercity Transport Costs Management
  // -------------------------------------------------------------

  async addTransportCost(actor: Principal, id: string, dto: CreateTransportCostDto) {
    if (!Types.ObjectId.isValid(id)) {
      throw new BadRequestException('Invalid itinerary ID');
    }

    const itinerary = await this.itineraryModel.findById(id);
    if (!itinerary) {
      throw new NotFoundException('Itinerary not found');
    }

    this.assertOwnership(actor, itinerary);

    const transport: IntercityTransportCost = {
      _id: new Types.ObjectId(),
      fromCity: dto.fromCity.trim(),
      toCity: dto.toCity.trim(),
      transportType: dto.transportType,
      departureDate: dto.departureDate,
      cost: dto.cost,
      currency: dto.currency.trim().toUpperCase(),
      bookingReference: dto.bookingReference?.trim(),
      notes: dto.notes?.trim(),
    };

    itinerary.transportCosts.push(transport);
    await itinerary.save();
    return transport;
  }

  async updateTransportCost(
    actor: Principal,
    transportCostId: string,
    dto: UpdateTransportCostDto,
  ) {
    if (!Types.ObjectId.isValid(transportCostId)) {
      throw new BadRequestException('Invalid transport cost ID');
    }

    const itinerary = await this.itineraryModel.findOne({
      'transportCosts._id': new Types.ObjectId(transportCostId),
    });

    if (!itinerary) {
      throw new NotFoundException('Transport cost entry not found');
    }

    this.assertOwnership(actor, itinerary);

    const transport = itinerary.transportCosts.find((t) => t._id.toString() === transportCostId);
    if (!transport) {
      throw new NotFoundException('Transport cost entry not found');
    }

    if (dto.fromCity !== undefined) transport.fromCity = dto.fromCity.trim();
    if (dto.toCity !== undefined) transport.toCity = dto.toCity.trim();
    if (dto.transportType !== undefined) transport.transportType = dto.transportType;
    if (dto.departureDate !== undefined) transport.departureDate = dto.departureDate;
    if (dto.cost !== undefined) transport.cost = dto.cost;
    if (dto.currency !== undefined) transport.currency = dto.currency.trim().toUpperCase();
    if (dto.bookingReference !== undefined)
      transport.bookingReference = dto.bookingReference.trim();
    if (dto.notes !== undefined) transport.notes = dto.notes.trim();

    await itinerary.save();
    return transport;
  }

  async deleteTransportCost(actor: Principal, transportCostId: string) {
    if (!Types.ObjectId.isValid(transportCostId)) {
      throw new BadRequestException('Invalid transport cost ID');
    }

    const itinerary = await this.itineraryModel.findOne({
      'transportCosts._id': new Types.ObjectId(transportCostId),
    });

    if (!itinerary) {
      throw new NotFoundException('Transport cost entry not found');
    }

    this.assertOwnership(actor, itinerary);

    itinerary.transportCosts = itinerary.transportCosts.filter(
      (t) => t._id.toString() !== transportCostId,
    );

    await itinerary.save();
    return { success: true, message: 'Transport cost deleted successfully' };
  }

  // -------------------------------------------------------------
  // ITN-14, ITN-18: Budget Summary & FXRates Currency Conversion
  // -------------------------------------------------------------

  async getBudgetSummary(actor: Principal | null, id: string, queryCurrency?: string) {
    const itinerary = await this.itineraryModel.findById(id).lean();
    if (!itinerary) {
      throw new NotFoundException('Itinerary not found');
    }

    // Visibility check
    if (!itinerary.isPublic) {
      if (!actor || (itinerary.userId.toString() !== actor.id && actor.role !== UserRole.ADMIN)) {
        throw new ForbiddenException('You do not have permission to view this budget summary');
      }
    }

    // Resolve target currency
    let targetCurrency = queryCurrency?.trim().toUpperCase();
    if (!targetCurrency && actor) {
      const user = await this.userModel.findById(actor.id).lean();
      if (user?.preferredCurrency) {
        targetCurrency = user.preferredCurrency.trim().toUpperCase();
      }
    }
    if (!targetCurrency) targetCurrency = 'USD';

    const categorySubtotals: Record<BudgetCategory, number> = {
      [BudgetCategory.FOOD]: 0,
      [BudgetCategory.ACCOMMODATION]: 0,
      [BudgetCategory.IN_CITY_TRANSPORT]: 0,
      [BudgetCategory.ACTIVITIES]: 0,
    };

    const daysSummary = [];
    let totalDaysBudgetConverted = 0;

    for (const day of itinerary.days || []) {
      const dayCategories: Record<BudgetCategory, number> = {
        [BudgetCategory.FOOD]: 0,
        [BudgetCategory.ACCOMMODATION]: 0,
        [BudgetCategory.IN_CITY_TRANSPORT]: 0,
        [BudgetCategory.ACTIVITIES]: 0,
      };

      // Process budget entries
      for (const b of day.budgets || []) {
        const converted = await this.fxRatesService.convert(b.amount, b.currency, targetCurrency);
        dayCategories[b.category] += converted;
        categorySubtotals[b.category] += converted;
      }

      // Process activity costs if any activities have costs
      for (const act of day.activities || []) {
        if (act.cost && act.cost > 0 && act.currency) {
          const converted = await this.fxRatesService.convert(
            act.cost,
            act.currency,
            targetCurrency,
          );
          dayCategories[BudgetCategory.ACTIVITIES] += converted;
          categorySubtotals[BudgetCategory.ACTIVITIES] += converted;
        }
      }

      const dayTotal =
        dayCategories[BudgetCategory.FOOD] +
        dayCategories[BudgetCategory.ACCOMMODATION] +
        dayCategories[BudgetCategory.IN_CITY_TRANSPORT] +
        dayCategories[BudgetCategory.ACTIVITIES];

      totalDaysBudgetConverted += dayTotal;

      daysSummary.push({
        dayId: day._id.toString(),
        dayNumber: day.dayNumber,
        date: day.date,
        cityCode: day.cityCode,
        cityName: day.cityName,
        subtotals: {
          food: Math.round(dayCategories[BudgetCategory.FOOD] * 100) / 100,
          accommodation: Math.round(dayCategories[BudgetCategory.ACCOMMODATION] * 100) / 100,
          inCityTransport: Math.round(dayCategories[BudgetCategory.IN_CITY_TRANSPORT] * 100) / 100,
          activities: Math.round(dayCategories[BudgetCategory.ACTIVITIES] * 100) / 100,
          dayTotal: Math.round(dayTotal * 100) / 100,
        },
      });
    }

    // Process intercity transport
    let intercityTransportTotal = 0;
    const transportCostsSummary = [];

    for (const t of itinerary.transportCosts || []) {
      const converted = await this.fxRatesService.convert(t.cost, t.currency, targetCurrency);
      intercityTransportTotal += converted;
      transportCostsSummary.push({
        id: t._id.toString(),
        fromCity: t.fromCity,
        toCity: t.toCity,
        transportType: t.transportType,
        originalCost: t.cost,
        originalCurrency: t.currency,
        convertedCost: Math.round(converted * 100) / 100,
      });
    }

    const overallTotal = totalDaysBudgetConverted + intercityTransportTotal;

    return {
      itineraryId: itinerary._id.toString(),
      targetCurrency,
      categorySubtotals: {
        food: Math.round(categorySubtotals[BudgetCategory.FOOD] * 100) / 100,
        accommodation: Math.round(categorySubtotals[BudgetCategory.ACCOMMODATION] * 100) / 100,
        inCityTransport:
          Math.round(categorySubtotals[BudgetCategory.IN_CITY_TRANSPORT] * 100) / 100,
        activities: Math.round(categorySubtotals[BudgetCategory.ACTIVITIES] * 100) / 100,
      },
      intercityTransportTotal: Math.round(intercityTransportTotal * 100) / 100,
      transportCosts: transportCostsSummary,
      days: daysSummary,
      overallTotal: Math.round(overallTotal * 100) / 100,
    };
  }

  // -------------------------------------------------------------
  // ITN-20, ITN-21: Public Search, View & Cloning
  // -------------------------------------------------------------

  async searchPublic(dto: PublicItinerarySearchDto) {
    const filter: Record<string, any> = { isPublic: true };

    if (dto.q) {
      filter.$or = [
        { title: { $regex: dto.q.trim(), $options: 'i' } },
        { description: { $regex: dto.q.trim(), $options: 'i' } },
      ];
    }

    if (dto.country) {
      filter.countries = dto.country.trim().toUpperCase();
    }

    if (dto.city) {
      filter['days.cityCode'] = dto.city.trim().toLowerCase();
    }

    if (dto.minDays || dto.maxDays) {
      filter.$expr = {};
      const conditions: any[] = [];
      if (dto.minDays) {
        conditions.push({ $gte: [{ $size: { $ifNull: ['$days', []] } }, dto.minDays] });
      }
      if (dto.maxDays) {
        conditions.push({ $lte: [{ $size: { $ifNull: ['$days', []] } }, dto.maxDays] });
      }
      if (conditions.length === 1) {
        filter.$expr = conditions[0];
      } else {
        filter.$expr = { $and: conditions };
      }
    }

    let sort: Record<string, any> = { createdAt: -1 };
    if (dto.sortBy === 'startDate') sort = { startDate: dto.order === 'desc' ? -1 : 1 };
    else if (dto.sortBy === 'title') sort = { title: dto.order === 'desc' ? -1 : 1 };

    const page = dto.page && dto.page > 0 ? dto.page : 1;
    const limit = dto.limit && dto.limit > 0 ? Math.min(dto.limit, 50) : 10;
    const skip = (page - 1) * limit;

    const [items, total] = await Promise.all([
      this.itineraryModel.find(filter).sort(sort).skip(skip).limit(limit).lean(),
      this.itineraryModel.countDocuments(filter),
    ]);

    return {
      items: items.map((itn) => ({
        id: itn._id.toString(),
        title: itn.title,
        countries: itn.countries,
        startDate: itn.startDate,
        description: itn.description,
        totalDays: itn.days?.length ?? 0,
        cityGroups: groupConsecutiveDays(itn.days as ItineraryDay[]),
        clonedFrom: itn.clonedFrom,
        createdAt: itn.createdAt,
      })),
      total,
      page,
      pageCount: Math.ceil(total / limit) || 1,
    };
  }

  async getPublicItinerary(id: string) {
    if (!Types.ObjectId.isValid(id)) {
      throw new BadRequestException('Invalid itinerary ID');
    }

    const itinerary = await this.itineraryModel.findOne({ _id: id, isPublic: true }).lean();
    if (!itinerary) {
      throw new NotFoundException('Public itinerary not found');
    }

    return {
      ...itinerary,
      id: itinerary._id.toString(),
      cityGroups: groupConsecutiveDays(itinerary.days as ItineraryDay[]),
    };
  }

  async clone(actor: Principal, id: string, dto: CloneItineraryDto) {
    if (!Types.ObjectId.isValid(id)) {
      throw new BadRequestException('Invalid itinerary ID');
    }

    const source = await this.itineraryModel.findById(id).lean();
    if (!source) {
      throw new NotFoundException('Source itinerary not found');
    }

    if (!source.isPublic) {
      throw new ForbiddenException('Only public itineraries can be cloned');
    }

    // Resolve author name for attribution
    let authorName = 'Unknown traveler';
    const author = await this.userModel.findById(source.userId).lean();
    if (author?.name) {
      authorName = author.name;
    }

    const startDate = dto.startDate || source.startDate;
    const title = dto.title?.trim() || `Copy of ${source.title}`;

    // Deep clone days
    const clonedDays: ItineraryDay[] = (source.days || []).map((day) => ({
      _id: new Types.ObjectId(),
      dayNumber: day.dayNumber,
      date: day.date,
      cityCode: day.cityCode,
      cityName: day.cityName,
      theme: day.theme,
      activities: (day.activities || []).map((act) => ({
        _id: new Types.ObjectId(),
        title: act.title,
        description: act.description,
        time: act.time,
        location: act.location,
        cost: act.cost,
        currency: act.currency,
        images: (act.images || []).map((img) => ({
          _id: new Types.ObjectId(),
          url: img.url,
          filename: img.filename,
          originalName: img.originalName,
          mimeType: img.mimeType,
          size: img.size,
          uploadedAt: new Date(),
        })),
      })),
      budgets: (day.budgets || []).map((b) => ({
        _id: new Types.ObjectId(),
        category: b.category,
        amount: b.amount,
        currency: b.currency,
        description: b.description,
      })),
    }));

    // Deep clone transport costs
    const clonedTransport: IntercityTransportCost[] = (source.transportCosts || []).map((t) => ({
      _id: new Types.ObjectId(),
      fromCity: t.fromCity,
      toCity: t.toCity,
      transportType: t.transportType,
      departureDate: t.departureDate,
      cost: t.cost,
      currency: t.currency,
      bookingReference: t.bookingReference,
      notes: t.notes,
    }));

    // Recalculate day dates based on new startDate
    renumberAndRecalculateDays(startDate, clonedDays);

    const clonedItinerary = new this.itineraryModel({
      userId: new Types.ObjectId(actor.id),
      title,
      countries: [...source.countries],
      startDate,
      description: source.description,
      isPublic: false, // Independent private copy
      days: clonedDays,
      transportCosts: clonedTransport,
      clonedFrom: {
        itineraryId: source._id,
        originalAuthorId: source.userId,
        originalAuthorName: authorName,
        clonedAt: new Date(),
      },
    });

    const saved = await clonedItinerary.save();
    return this.getItineraryById(actor, saved._id.toString());
  }

  // -------------------------------------------------------------
  // ITN-25: Reuse Hotel Search for a Selected City Group
  // -------------------------------------------------------------

  async getHotelSearchParameters(actor: Principal | null, id: string, cityGroupIndex?: number) {
    const itn = await this.getItineraryById(actor, id);
    const groups: CityGroup[] = itn.cityGroups;

    if (groups.length === 0) {
      return {
        itineraryId: id,
        cityGroups: [],
        message: 'No days or destinations found in this itinerary',
      };
    }

    if (cityGroupIndex !== undefined) {
      if (cityGroupIndex < 0 || cityGroupIndex >= groups.length) {
        throw new BadRequestException(`cityGroupIndex must be between 0 and ${groups.length - 1}`);
      }
      const selected = groups[cityGroupIndex];
      return {
        itineraryId: id,
        selectedGroup: {
          ...selected,
          searchQuery: {
            destination: selected.cityCode,
            checkIn: selected.checkInDate,
            checkOut: selected.checkOutDate,
            nights: selected.nights,
            guests: 1,
          },
        },
      };
    }

    return {
      itineraryId: id,
      cityGroups: groups.map((g, idx) => ({
        index: idx,
        ...g,
        searchQuery: {
          destination: g.cityCode,
          checkIn: g.checkInDate,
          checkOut: g.checkOutDate,
          nights: g.nights,
          guests: 1,
        },
      })),
    };
  }

  // -------------------------------------------------------------
  // ITN-26: Reuse Flight Search for Itinerary-Related Dates
  // -------------------------------------------------------------

  async getFlightSearchParameters(actor: Principal | null, id: string) {
    const itn = await this.getItineraryById(actor, id);
    const days: ItineraryDay[] = itn.days || [];

    if (days.length === 0) {
      return {
        itineraryId: id,
        message: 'No itinerary days defined yet to generate flight search parameters',
        searches: [],
      };
    }

    const firstDay = days[0];
    const lastDay = days[days.length - 1];
    const cityGroups: CityGroup[] = itn.cityGroups;

    const searches = [];

    // Inbound flight: travel to start destination on start date
    searches.push({
      type: 'INBOUND',
      destinationCity: firstDay.cityCode,
      destinationCityName: firstDay.cityName,
      date: itn.startDate,
      description: `Flight to ${firstDay.cityName || firstDay.cityCode} for trip start`,
    });

    // Intercity flight hops between different consecutive cities
    for (let i = 0; i < cityGroups.length - 1; i++) {
      const current = cityGroups[i];
      const next = cityGroups[i + 1];
      searches.push({
        type: 'INTERCITY',
        originCity: current.cityCode,
        originCityName: current.cityName,
        destinationCity: next.cityCode,
        destinationCityName: next.cityName,
        date: current.checkOutDate,
        description: `Flight from ${current.cityName || current.cityCode} to ${next.cityName || next.cityCode}`,
      });
    }

    // Return flight: return from last city on final date
    searches.push({
      type: 'OUTBOUND_RETURN',
      originCity: lastDay.cityCode,
      originCityName: lastDay.cityName,
      date: lastDay.date,
      description: `Return flight from ${lastDay.cityName || lastDay.cityCode} at trip conclusion`,
    });

    return {
      itineraryId: id,
      startDate: itn.startDate,
      endDate: lastDay.date,
      searches,
    };
  }

  private assertOwnership(actor: Principal, itinerary: ItineraryDocument) {
    if (itinerary.userId.toString() !== actor.id && actor.role !== UserRole.ADMIN) {
      throw new ForbiddenException('You can only modify your own itineraries');
    }
  }
}
