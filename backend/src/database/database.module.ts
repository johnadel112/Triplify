import { Global, Module, OnModuleInit } from '@nestjs/common';
import { InjectConnection, MongooseModule } from '@nestjs/mongoose';
import { Connection } from 'mongoose';
import { User, UserSchema } from '../users/user.schema';
import { Session, SessionSchema } from '../auth/session.schema';
import {
  AuditLog,
  AuditSchema,
  NotificationOutbox,
  NotificationOutboxSchema,
} from '../audit/audit.schema';
import {
  Airport,
  AirportSchema,
  City,
  CitySchema,
  Country,
  CountrySchema,
  Currency,
  CurrencySchema,
} from '../reference-data/reference.schema';
export const models = [
  { name: User.name, schema: UserSchema },
  { name: Session.name, schema: SessionSchema },
  { name: AuditLog.name, schema: AuditSchema },
  { name: NotificationOutbox.name, schema: NotificationOutboxSchema },
  { name: Airport.name, schema: AirportSchema },
  { name: City.name, schema: CitySchema },
  { name: Country.name, schema: CountrySchema },
  { name: Currency.name, schema: CurrencySchema },
];
@Global()
@Module({ imports: [MongooseModule.forFeature(models)], exports: [MongooseModule] })
export class DatabaseModule implements OnModuleInit {
  constructor(@InjectConnection() private connection: Connection) {}
  async onModuleInit() {
    await Promise.all(Object.values(this.connection.models).map((model) => model.init()));
  }
}
