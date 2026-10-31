import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
@Schema()
export class Country {
  @Prop({ required: true, unique: true, match: /^[A-Z]{2}$/ }) code!: string;
  @Prop({ required: true }) name!: string;
}
@Schema()
export class City {
  @Prop({ required: true, unique: true }) code!: string;
  @Prop({ required: true }) name!: string;
  @Prop({ required: true, index: true }) country!: string;
  @Prop({ required: true }) timeZone!: string;
}
@Schema()
export class Airport {
  @Prop({ required: true, unique: true, match: /^[A-Z]{3}$/ }) iataCode!: string;
  @Prop({ required: true }) name!: string;
  @Prop({ required: true, index: true }) city!: string;
  @Prop({ required: true, index: true }) country!: string;
  @Prop({ required: true }) timeZone!: string;
}
@Schema()
export class Currency {
  @Prop({ required: true, unique: true, match: /^[A-Z]{3}$/ }) code!: string;
  @Prop({ required: true }) name!: string;
  @Prop({ required: true, min: 0, max: 4 }) minorUnits!: number;
}
export const CountrySchema = SchemaFactory.createForClass(Country);
export const CitySchema = SchemaFactory.createForClass(City);
export const AirportSchema = SchemaFactory.createForClass(Airport);
export const CurrencySchema = SchemaFactory.createForClass(Currency);
