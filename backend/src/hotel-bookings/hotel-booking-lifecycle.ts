import { Injectable, Logger, OnApplicationBootstrap, OnModuleDestroy } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { DEFAULT_SWEEP_INTERVAL_MS } from './hotel-bookings.constants';
import { HotelBookingsService } from './hotel-bookings.service';

/**
 * System actor for GEN-11: periodically confirms paid holds (HTL-17), expires unpaid holds
 * (HTL-18) and completes finished stays (HTL-23). Reads also apply expiry/completion lazily,
 * so correctness does not depend on the timer. Disabled in tests or with HOTEL_BOOKING_SWEEP_MS=0.
 */
@Injectable()
export class HotelBookingLifecycle implements OnApplicationBootstrap, OnModuleDestroy {
  private readonly logger = new Logger(HotelBookingLifecycle.name);
  private timer?: NodeJS.Timeout;
  private running = false;

  constructor(
    private readonly bookings: HotelBookingsService,
    private readonly config: ConfigService,
  ) {}

  onApplicationBootstrap() {
    const interval = Number(
      this.config.get<string>('HOTEL_BOOKING_SWEEP_MS') ?? DEFAULT_SWEEP_INTERVAL_MS,
    );
    if (this.config.get<string>('NODE_ENV') === 'test' || !(interval > 0)) return;
    this.timer = setInterval(() => void this.tick(), interval);
    this.timer.unref();
  }

  onModuleDestroy() {
    if (this.timer) clearInterval(this.timer);
  }

  async tick() {
    if (this.running) return;
    this.running = true;
    try {
      await this.bookings.sweep();
    } catch (error) {
      this.logger.warn(
        `Hotel booking sweep failed: ${error instanceof Error ? error.message : 'unknown error'}`,
      );
    } finally {
      this.running = false;
    }
  }
}
