import { BadRequestException, ServiceUnavailableException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { FX_REFRESH_MS, FX_RETRY_MS, FxRatesService } from './fx-rates.service';

const live = (rates: Record<string, number>, date = '2026-11-19T00:00:00.000Z') =>
  Promise.resolve({
    ok: true,
    status: 200,
    json: () => Promise.resolve({ success: true, base: 'USD', date, rates }),
  } as unknown as Response);
const down = () => Promise.reject(new Error('getaddrinfo ENOTFOUND api.fxratesapi.com'));

describe('FxRatesService (ITN-18, FXRatesAPI)', () => {
  let fetchMock: jest.SpyInstance;
  let now: number;
  let config: { get: jest.Mock };
  let service: FxRatesService;

  beforeEach(() => {
    now = Date.UTC(2026, 10, 19, 12);
    jest.spyOn(Date, 'now').mockImplementation(() => now);
    fetchMock = jest.spyOn(global, 'fetch');
    config = { get: jest.fn().mockReturnValue(undefined) };
    service = new FxRatesService(config as unknown as ConfigService);
  });
  afterEach(() => jest.restoreAllMocks());

  it('converts with live rates from FXRatesAPI and reports which rates were used', async () => {
    fetchMock.mockReturnValue(live({ USD: 1, EUR: 0.9, EGP: 54 }));
    expect(await service.convert(100, 'usd', 'EGP')).toBe(5400);
    expect(await service.convert(90, 'EUR', 'EGP')).toBe(5400);
    expect(service.describe()).toMatchObject({
      provider: 'FXRatesAPI',
      base: 'USD',
      date: '2026-11-19T00:00:00.000Z',
      stale: false,
    });
    const url = new URL(fetchMock.mock.calls[0][0] as string);
    expect(url.origin + url.pathname).toBe('https://api.fxratesapi.com/latest');
    expect(url.searchParams.get('base')).toBe('USD');
    expect(url.searchParams.has('api_key')).toBe(false);
  });

  it('fetches once per day and sends the configured API key from the backend', async () => {
    config.get.mockReturnValue('test-key');
    fetchMock.mockReturnValue(live({ USD: 1, EGP: 54 }));
    await service.convert(1, 'USD', 'EGP');
    now += FX_REFRESH_MS - 1;
    await service.convert(1, 'USD', 'EGP');
    expect(fetchMock).toHaveBeenCalledTimes(1);
    now += 2;
    await service.convert(1, 'USD', 'EGP');
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(new URL(fetchMock.mock.calls[0][0] as string).searchParams.get('api_key')).toBe(
      'test-key',
    );
  });

  it('keeps using the last real rates, marked stale, when the daily refresh fails', async () => {
    fetchMock.mockReturnValueOnce(live({ USD: 1, EGP: 54 }));
    await service.convert(1, 'USD', 'EGP');
    now += FX_REFRESH_MS + 1;
    fetchMock.mockImplementation(down);
    expect(await service.convert(2, 'USD', 'EGP')).toBe(108);
    expect(service.describe()).toMatchObject({ stale: true, date: '2026-11-19T00:00:00.000Z' });
    // No retry storm: the provider is not called again until the retry delay passes.
    await service.convert(2, 'USD', 'EGP');
    expect(fetchMock).toHaveBeenCalledTimes(2);
    now += FX_RETRY_MS;
    fetchMock.mockReturnValue(live({ USD: 1, EGP: 55 }, '2026-11-20T00:00:00.000Z'));
    expect(await service.convert(1, 'USD', 'EGP')).toBe(55);
    expect(service.describe()).toMatchObject({ stale: false, date: '2026-11-20T00:00:00.000Z' });
  });

  it('returns 503 instead of invented rates when none were ever fetched', async () => {
    fetchMock.mockImplementation(down);
    await expect(service.convert(10, 'USD', 'EGP')).rejects.toThrow(ServiceUnavailableException);
    expect(service.describe()).toBeNull();
    await expect(service.convert(10, 'USD', 'EGP')).rejects.toMatchObject({
      response: { code: 'EXCHANGE_RATES_UNAVAILABLE' },
    });
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('treats error statuses and malformed responses as failures', async () => {
    fetchMock.mockResolvedValueOnce({ ok: false, status: 429 } as Response);
    await expect(service.convert(1, 'USD', 'EGP')).rejects.toThrow(ServiceUnavailableException);
    now += FX_RETRY_MS;
    fetchMock.mockResolvedValueOnce({
      ok: true,
      status: 200,
      json: () => Promise.resolve({ success: true, base: 'USD', rates: { EGP: 'n/a' } }),
    } as unknown as Response);
    await expect(service.convert(1, 'USD', 'EGP')).rejects.toThrow(ServiceUnavailableException);
  });

  it('rejects malformed and unknown currency codes without calling the provider for same-currency', async () => {
    fetchMock.mockReturnValue(live({ USD: 1, EGP: 54 }));
    await expect(service.convert(1, 'EURO', 'USD')).rejects.toThrow(BadRequestException);
    expect(await service.convert(12.345, 'USD', 'usd')).toBe(12.35);
    expect(fetchMock).not.toHaveBeenCalled();
    await expect(service.convert(1, 'USD', 'XYZ')).rejects.toThrow(BadRequestException);
  });
});
