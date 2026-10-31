import { Global, Module } from '@nestjs/common';
import { CLOCK, systemClock } from './domain';
import { AccessPolicy } from './policies';
@Global()
@Module({
  providers: [{ provide: CLOCK, useValue: systemClock }, AccessPolicy],
  exports: [CLOCK, AccessPolicy],
})
export class CommonModule {}
