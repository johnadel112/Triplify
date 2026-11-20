import { ConfigService } from '@nestjs/config';
import { MailTransport } from './mail.service';

describe('HTTPS email delivery', () => {
  const message = { to: 'recipient@example.com', subject: 'Verify', text: 'Secret token link' };
  let fetchMock: jest.SpyInstance;
  const transport = (mode = 'resend') => new MailTransport(new ConfigService({
    MAIL_MODE: mode, MAIL_FROM: 'Triplify <sender@example.com>', RESEND_API_KEY: 'test-key',
  }));
  beforeEach(() => { fetchMock = jest.spyOn(global, 'fetch'); });
  afterEach(() => jest.restoreAllMocks());

  it('sends over HTTPS with the same idempotency key on retries', async () => {
    fetchMock.mockImplementation(async () => new Response(JSON.stringify({ id: 'sent-id' })));
    await transport().send(message, 'job-id');
    await transport().send(message, 'job-id');
    for (const [url, options] of fetchMock.mock.calls) {
      expect(url).toBe('https://api.resend.com/emails');
      expect(options.headers).toMatchObject({
        Authorization: 'Bearer test-key', 'Idempotency-Key': 'triplify-job-id',
      });
      expect(JSON.parse(options.body)).toEqual({ ...message, from: 'Triplify <sender@example.com>' });
      expect(options.signal).toBeInstanceOf(AbortSignal);
      expect(options.redirect).toBe('error');
    }
  });

  it.each([429, 500, 401])('rejects HTTP %i without exposing the provider response', async status => {
    fetchMock.mockResolvedValue(new Response('secret provider details', { status }));
    await expect(transport().send(message, 'job')).rejects.toThrow('Email provider delivery failed');
  });

  it('rejects an invalid success response and network errors for queue retry', async () => {
    fetchMock.mockResolvedValueOnce(new Response('{}')).mockRejectedValueOnce(new Error('secret'));
    await expect(transport().send(message, 'job')).rejects.toThrow('Email provider delivery failed');
    await expect(transport().send(message, 'job')).rejects.toThrow('Email provider delivery failed');
  });

  it('does not contact a provider in disabled mode', async () => {
    await expect(transport('disabled').send(message, 'job')).rejects.toThrow('disabled');
    expect(fetchMock).not.toHaveBeenCalled();
  });
});
