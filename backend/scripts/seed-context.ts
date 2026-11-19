import 'reflect-metadata';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { Module } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { MongooseModule } from '@nestjs/mongoose';
import { DatabaseModule } from '../src/database/database.module';
import { buildMongoConnectionUri, configureMongoDns } from '../src/config/mongodb-dns';
@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true }),
    MongooseModule.forRootAsync({
      inject: [ConfigService],
      useFactory: (config: ConfigService) => {
        configureMongoDns(config.get<string>('MONGODB_DNS_SERVERS'));
        const uri = config.get<string>('MONGODB_URI');
        if (!uri || !/^mongodb(?:\+srv)?:\/\//.test(uri))
          throw new Error('MONGODB_URI is required');
        return {
          uri: buildMongoConnectionUri(
            uri,
            config.get<string>('MONGODB_DIRECT_HOSTS'),
            config.get<string>('MONGODB_REPLICA_SET'),
          ),
          autoIndex: true,
        };
      },
    }),
    DatabaseModule,
  ],
})
class SeedModule {}
export async function seedContext() {
  return NestFactory.createApplicationContext(SeedModule, { logger: false });
}
