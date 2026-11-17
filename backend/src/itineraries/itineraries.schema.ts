import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument, Schema as MongooseSchema, Types } from 'mongoose';

export enum BudgetCategory {
  FOOD = 'FOOD',
  ACCOMMODATION = 'ACCOMMODATION',
  IN_CITY_TRANSPORT = 'IN_CITY_TRANSPORT',
  ACTIVITIES = 'ACTIVITIES',
}

export enum TransportType {
  FLIGHT = 'FLIGHT',
  TRAIN = 'TRAIN',
  BUS = 'BUS',
  CAR = 'CAR',
  FERRY = 'FERRY',
  OTHER = 'OTHER',
}

@Schema({ timestamps: true })
export class ActivityImage {
  _id!: Types.ObjectId;

  @Prop({ required: true })
  url!: string;

  @Prop({ required: true })
  filename!: string;

  @Prop({ required: true })
  originalName!: string;

  @Prop({ required: true })
  mimeType!: string;

  @Prop({ required: true })
  size!: number;

  @Prop({ default: () => new Date() })
  uploadedAt!: Date;
}
export const ActivityImageSchema = SchemaFactory.createForClass(ActivityImage);

@Schema({ timestamps: true })
export class Activity {
  _id!: Types.ObjectId;

  @Prop({ required: true, trim: true, maxlength: 100 })
  title!: string;

  @Prop({ trim: true, maxlength: 1000 })
  description?: string;

  @Prop({ trim: true })
  time?: string;

  @Prop({ trim: true, maxlength: 200 })
  location?: string;

  @Prop({ min: 0, default: 0 })
  cost?: number;

  @Prop({ uppercase: true, trim: true, maxlength: 3 })
  currency?: string;

  @Prop({ type: [ActivityImageSchema], default: [] })
  images!: ActivityImage[];
}
export const ActivitySchema = SchemaFactory.createForClass(Activity);

@Schema({ timestamps: true })
export class DayBudget {
  _id!: Types.ObjectId;

  @Prop({ required: true, enum: BudgetCategory })
  category!: BudgetCategory;

  @Prop({ required: true, min: 0 })
  amount!: number;

  @Prop({ required: true, uppercase: true, trim: true, match: /^[A-Z]{3}$/ })
  currency!: string;

  @Prop({ trim: true, maxlength: 500 })
  description?: string;
}
export const DayBudgetSchema = SchemaFactory.createForClass(DayBudget);

@Schema({ timestamps: true })
export class ItineraryDay {
  _id!: Types.ObjectId;

  @Prop({ required: true, min: 1 })
  dayNumber!: number;

  @Prop({ required: true, match: /^\d{4}-\d{2}-\d{2}$/ })
  date!: string;

  @Prop({ required: true, trim: true })
  cityCode!: string;

  @Prop({ trim: true })
  cityName?: string;

  @Prop({ trim: true, maxlength: 200 })
  theme?: string;

  @Prop({ type: [ActivitySchema], default: [] })
  activities!: Activity[];

  @Prop({ type: [DayBudgetSchema], default: [] })
  budgets!: DayBudget[];
}
export const ItineraryDaySchema = SchemaFactory.createForClass(ItineraryDay);

@Schema({ timestamps: true })
export class IntercityTransportCost {
  _id!: Types.ObjectId;

  @Prop({ required: true, trim: true })
  fromCity!: string;

  @Prop({ required: true, trim: true })
  toCity!: string;

  @Prop({ required: true, enum: TransportType })
  transportType!: TransportType;

  @Prop({ match: /^\d{4}-\d{2}-\d{2}$/ })
  departureDate?: string;

  @Prop({ required: true, min: 0 })
  cost!: number;

  @Prop({ required: true, uppercase: true, trim: true, match: /^[A-Z]{3}$/ })
  currency!: string;

  @Prop({ trim: true, maxlength: 100 })
  bookingReference?: string;

  @Prop({ trim: true, maxlength: 500 })
  notes?: string;
}
export const IntercityTransportCostSchema = SchemaFactory.createForClass(IntercityTransportCost);

@Schema({ _id: false })
export class ClonedAttribution {
  @Prop({ type: MongooseSchema.Types.ObjectId, required: true })
  itineraryId!: Types.ObjectId;

  @Prop({ type: MongooseSchema.Types.ObjectId, required: true })
  originalAuthorId!: Types.ObjectId;

  @Prop({ required: true })
  originalAuthorName!: string;

  @Prop({ default: () => new Date() })
  clonedAt!: Date;
}
export const ClonedAttributionSchema = SchemaFactory.createForClass(ClonedAttribution);

export interface CityGroup {
  cityCode: string;
  cityName?: string;
  startDay: number;
  endDay: number;
  startDate: string;
  endDate: string;
  checkInDate: string;
  checkOutDate: string;
  nights: number;
  dayIds: string[];
}

@Schema({ timestamps: true, optimisticConcurrency: true })
export class Itinerary {
  @Prop({ type: MongooseSchema.Types.ObjectId, ref: 'User', required: true, index: true })
  userId!: Types.ObjectId;

  @Prop({ required: true, trim: true, maxlength: 100 })
  title!: string;

  @Prop({ type: [String], required: true, default: [] })
  countries!: string[];

  @Prop({ required: true, match: /^\d{4}-\d{2}-\d{2}$/ })
  startDate!: string;

  @Prop({ trim: true, maxlength: 2000 })
  description?: string;

  @Prop({ default: false, index: true })
  isPublic!: boolean;

  @Prop({ type: [ItineraryDaySchema], default: [] })
  days!: ItineraryDay[];

  @Prop({ type: [IntercityTransportCostSchema], default: [] })
  transportCosts!: IntercityTransportCost[];

  @Prop({ type: ClonedAttributionSchema })
  clonedFrom?: ClonedAttribution;

  createdAt!: Date;
  updatedAt!: Date;
}

export type ItineraryDocument = HydratedDocument<Itinerary>;
export const ItinerarySchema = SchemaFactory.createForClass(Itinerary);

ItinerarySchema.index({ isPublic: 1, createdAt: -1 });
ItinerarySchema.index({ userId: 1, createdAt: -1 });
ItinerarySchema.index({ title: 'text', description: 'text' });

export function addDaysToDate(dateStr: string, days: number): string {
  const [year, month, day] = dateStr.split('-').map(Number);
  const d = new Date(Date.UTC(year, month - 1, day));
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

export function groupConsecutiveDays(days: ItineraryDay[]): CityGroup[] {
  if (!days || days.length === 0) return [];
  const groups: CityGroup[] = [];
  let currentGroup: CityGroup | null = null;

  for (const day of days) {
    if (!currentGroup || currentGroup.cityCode.toLowerCase() !== day.cityCode.toLowerCase()) {
      if (currentGroup) {
        groups.push(currentGroup);
      }
      currentGroup = {
        cityCode: day.cityCode,
        cityName: day.cityName,
        startDay: day.dayNumber,
        endDay: day.dayNumber,
        startDate: day.date,
        endDate: day.date,
        checkInDate: day.date,
        checkOutDate: addDaysToDate(day.date, 1),
        nights: 1,
        dayIds: [day._id ? day._id.toString() : ''],
      };
    } else {
      currentGroup.endDay = day.dayNumber;
      currentGroup.endDate = day.date;
      currentGroup.checkOutDate = addDaysToDate(day.date, 1);
      currentGroup.nights += 1;
      if (day._id) currentGroup.dayIds.push(day._id.toString());
      if (!currentGroup.cityName && day.cityName) {
        currentGroup.cityName = day.cityName;
      }
    }
  }

  if (currentGroup) {
    groups.push(currentGroup);
  }

  return groups;
}

export function renumberAndRecalculateDays(startDate: string, days: ItineraryDay[]): void {
  for (let i = 0; i < days.length; i++) {
    days[i].dayNumber = i + 1;
    days[i].date = addDaysToDate(startDate, i);
  }
}
