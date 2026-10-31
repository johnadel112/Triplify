import { Controller, Get, Query } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { Public } from '../auth/guards';
import { ReferenceQuery } from '../common/dto';
import { Airport, City, Country, Currency } from './reference.schema';
export const escapeRegex = (value: string) => value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
@Public()
@ApiTags('Reference data')
@Controller('reference')
export class ReferenceController {
  constructor(
    @InjectModel(Country.name) private countries: Model<Country>,
    @InjectModel(City.name) private cities: Model<City>,
    @InjectModel(Airport.name) private airports: Model<Airport>,
    @InjectModel(Currency.name) private currencies: Model<Currency>,
  ) {}
  private async list<T>(model: Model<T>, query: ReferenceQuery, countryField?: string) {
    const filter: Record<string, unknown> = {};
    if (query.search) filter.name = { $regex: escapeRegex(query.search), $options: 'i' };
    if (query.country && countryField) filter[countryField] = query.country;
    const [items, total] = await Promise.all([
      model
        .find(filter)
        .select('-_id -__v')
        .sort({ name: 1 })
        .skip((query.page - 1) * 10)
        .limit(10)
        .lean(),
      model.countDocuments(filter),
    ]);
    return { items, total, page: query.page, pageCount: Math.ceil(total / 10) };
  }
  @Get('countries') @ApiOperation({ summary: 'List maintained countries' }) country(
    @Query() query: ReferenceQuery,
  ) {
    return this.list(this.countries, query, 'code');
  }
  @Get('cities') @ApiOperation({ summary: 'List maintained cities' }) city(
    @Query() query: ReferenceQuery,
  ) {
    return this.list(this.cities, query, 'country');
  }
  @Get('airports') @ApiOperation({ summary: 'List maintained airports' }) airport(
    @Query() query: ReferenceQuery,
  ) {
    return this.list(this.airports, query, 'country');
  }
  @Get('currencies') @ApiOperation({ summary: 'List supported currencies' }) currency(
    @Query() query: ReferenceQuery,
  ) {
    return this.list(this.currencies, query);
  }
}
