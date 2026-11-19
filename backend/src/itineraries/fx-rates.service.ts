import {
  BadRequestException,
  Injectable,
  Logger,
  ServiceUnavailableException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

const FXRATES_URL = 'https://api.fxratesapi.com/latest';
/** ITN-18: rates are fetched once per day. */
export const FX_REFRESH_MS = 24 * 60 * 60 * 1000;
/** After a failed refresh, wait before calling the provider again instead of on every request. */
export const FX_RETRY_MS = 5 * 60 * 1000;
const REQUEST_TIMEOUT_MS = 5000;

interface RatesSnapshot {
  /** Units of each currency per 1 USD, as published by FXRatesAPI. */
  rates: Record<string, number>;
  /** The provider's rate date. */
  providerDate: string;
  fetchedAt: Date;
}

/** Shown with converted amounts so users know which rates were applied. */
export interface ExchangeRateInfo {
  provider: 'FXRatesAPI';
  base: 'USD';
  date: string;
  fetchedAt: string;
  /** true when the daily refresh failed and the last successfully fetched rates are used. */
  stale: boolean;
}

/**
 * ITN-18: exchange rates from FXRatesAPI through the backend (an API key, if configured as
 * FXRATES_API_KEY, never reaches the frontend). Rates are cached for a day. If the provider is
 * unavailable, the last real rates are reused and marked stale; if no rates were ever fetched,
 * conversion fails with 503 instead of inventing numbers.
 */
@Injectable()
export class FxRatesService {
  private readonly logger = new Logger(FxRatesService.name);
  private snapshot: RatesSnapshot | null = null;
  private stale = false;
  private nextAttemptAt = 0;

  constructor(private readonly config: ConfigService) {}

  async getRates(): Promise<Record<string, number>> {
    return (await this.currentSnapshot()).rates;
  }

  /** Metadata of the rates in use, or null if none have been fetched yet. */
  describe(): ExchangeRateInfo | null {
    if (!this.snapshot) return null;
    return {
      provider: 'FXRatesAPI',
      base: 'USD',
      date: this.snapshot.providerDate,
      fetchedAt: this.snapshot.fetchedAt.toISOString(),
      stale: this.stale,
    };
  }

  /**
   * Converts an amount between two currencies: amount / rate(from) * rate(to), rounded to 2 dp.
   * 400 for malformed or unknown currency codes, 503 when no exchange rates are available.
   */
  async convert(amount: number, from: string, to: string): Promise<number> {
    const cleanFrom = from.trim().toUpperCase();
    const cleanTo = to.trim().toUpperCase();
    if (!/^[A-Z]{3}$/.test(cleanFrom)) {
      throw new BadRequestException(`Invalid source currency code: ${from}`);
    }
    if (!/^[A-Z]{3}$/.test(cleanTo)) {
      throw new BadRequestException(`Invalid target currency code: ${to}`);
    }
    if (amount === 0) return 0;
    if (cleanFrom === cleanTo) return Math.round(amount * 100) / 100;

    const rates = await this.getRates();
    const fromRate = rates[cleanFrom];
    const toRate = rates[cleanTo];
    if (!fromRate) {
      throw new BadRequestException(`Exchange rate unavailable for source currency: ${cleanFrom}`);
    }
    if (!toRate) {
      throw new BadRequestException(`Exchange rate unavailable for target currency: ${cleanTo}`);
    }
    return Math.round((amount / fromRate) * toRate * 100) / 100;
  }

  private async currentSnapshot(): Promise<RatesSnapshot> {
    const now = Date.now();
    const fresh = this.snapshot && now - this.snapshot.fetchedAt.getTime() < FX_REFRESH_MS;
    if (fresh || (this.snapshot && now < this.nextAttemptAt)) return this.snapshot!;
    if (!this.snapshot && now < this.nextAttemptAt) throw this.unavailable();

    try {
      this.snapshot = await this.fetchSnapshot();
      this.stale = false;
      return this.snapshot;
    } catch (error) {
      this.nextAttemptAt = now + FX_RETRY_MS;
      const reason = error instanceof Error ? error.message : String(error);
      if (this.snapshot) {
        this.stale = true;
        this.logger.warn(
          `FXRatesAPI refresh failed (${reason}); using rates from ${this.snapshot.providerDate}`,
        );
        return this.snapshot;
      }
      this.logger.warn(`FXRatesAPI unavailable (${reason}); no exchange rates to convert with`);
      throw this.unavailable();
    }
  }

  private async fetchSnapshot(): Promise<RatesSnapshot> {
    const url = new URL(FXRATES_URL);
    url.searchParams.set('base', 'USD');
    const apiKey = this.config.get<string>('FXRATES_API_KEY');
    if (apiKey) url.searchParams.set('api_key', apiKey);

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
    try {
      const response = await fetch(url.toString(), {
        signal: controller.signal,
        headers: { Accept: 'application/json' },
      });
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      const data = (await response.json()) as {
        success?: boolean;
        base?: string;
        date?: string;
        rates?: Record<string, unknown>;
      };
      if (data.success === false || (data.base && data.base !== 'USD')) {
        throw new Error('unexpected response');
      }
      const rates: Record<string, number> = {};
      for (const [code, value] of Object.entries(data.rates ?? {})) {
        if (/^[A-Z]{3}$/.test(code) && typeof value === 'number' && value > 0) rates[code] = value;
      }
      if (!rates.USD) rates.USD = 1;
      if (Object.keys(rates).length < 2) throw new Error('response contained no rates');
      const fetchedAt = new Date(Date.now());
      return { rates, providerDate: data.date ?? fetchedAt.toISOString(), fetchedAt };
    } finally {
      clearTimeout(timeout);
    }
  }

  private unavailable() {
    return new ServiceUnavailableException({
      code: 'EXCHANGE_RATES_UNAVAILABLE',
      message: 'Exchange rates are temporarily unavailable; please try again later',
    });
  }
}
