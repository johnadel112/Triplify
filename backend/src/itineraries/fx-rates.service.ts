import { BadRequestException, Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

interface CachedRates {
  timestamp: number;
  rates: Record<string, number>;
}

@Injectable()
export class FxRatesService {
  private readonly logger = new Logger(FxRatesService.name);
  private cache: CachedRates | null = null;
  private readonly cacheTtlMs = 60 * 60 * 1000; // 1 hour TTL

  // Reliable fallback rates relative to 1 USD
  private readonly fallbackRates: Record<string, number> = {
    USD: 1.0,
    EUR: 0.92,
    GBP: 0.79,
    EGP: 49.3,
    AED: 3.67,
    SAR: 3.75,
    JPY: 155.0,
    CAD: 1.39,
    AUD: 1.54,
    CHF: 0.88,
    CNY: 7.24,
    INR: 84.4,
    KWD: 0.31,
    QAR: 3.64,
    TRY: 34.5,
  };

  constructor(private readonly config: ConfigService) {}

  /**
   * Retrieve latest exchange rates against USD.
   * Caches results in memory for 1 hour.
   * Gracefully falls back to fallback rates if FXRatesAPI is unreachable.
   */
  async getRates(): Promise<Record<string, number>> {
    const now = Date.now();
    if (this.cache && now - this.cache.timestamp < this.cacheTtlMs) {
      return this.cache.rates;
    }

    let timeout: NodeJS.Timeout | undefined;
    try {
      const apiKey = this.config.get<string>('FXRATES_API_KEY');
      const url = new URL('https://api.fxratesapi.com/latest');
      url.searchParams.set('base', 'USD');
      if (apiKey) {
        url.searchParams.set('api_key', apiKey);
      }

      const controller = new AbortController();
      timeout = setTimeout(() => controller.abort(), 5000);

      const response = await fetch(url.toString(), {
        signal: controller.signal,
        headers: { Accept: 'application/json' },
      });

      if (response.ok) {
        const data = (await response.json()) as {
          success?: boolean;
          rates?: Record<string, number>;
        };
        if (data && data.rates && typeof data.rates === 'object') {
          const mergedRates = { ...this.fallbackRates, ...data.rates };
          this.cache = { timestamp: now, rates: mergedRates };
          return mergedRates;
        }
      }
      this.logger.warn(`FXRatesAPI returned status ${response.status}; using fallback rates`);
    } catch (err: any) {
      this.logger.warn(`FXRatesAPI request failed (${err?.message}); using fallback rates`);
    } finally {
      if (timeout) clearTimeout(timeout);
    }

    // Return fallback rates
    return { ...this.fallbackRates };
  }

  /**
   * Convert an amount between two currencies.
   * Standard conversion: amountInUSD = amount / sourceRateUSD; targetAmount = amountInUSD * targetRateUSD.
   */
  async convert(amount: number, from: string, to: string): Promise<number> {
    if (amount === 0) return 0;
    const cleanFrom = from.trim().toUpperCase();
    const cleanTo = to.trim().toUpperCase();

    if (!/^[A-Z]{3}$/.test(cleanFrom)) {
      throw new BadRequestException(`Invalid source currency code: ${from}`);
    }
    if (!/^[A-Z]{3}$/.test(cleanTo)) {
      throw new BadRequestException(`Invalid target currency code: ${to}`);
    }

    if (cleanFrom === cleanTo) {
      return Math.round(amount * 100) / 100;
    }

    const rates = await this.getRates();
    const fromRate = rates[cleanFrom] ?? this.fallbackRates[cleanFrom];
    const toRate = rates[cleanTo] ?? this.fallbackRates[cleanTo];

    if (!fromRate) {
      throw new BadRequestException(`Exchange rate unavailable for source currency: ${cleanFrom}`);
    }
    if (!toRate) {
      throw new BadRequestException(`Exchange rate unavailable for target currency: ${cleanTo}`);
    }

    // fromRate is units of fromCurrency per 1 USD
    // toRate is units of toCurrency per 1 USD
    const amountInUsd = amount / fromRate;
    const converted = amountInUsd * toRate;

    return Math.round(converted * 100) / 100;
  }
}
