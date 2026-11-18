import { Test } from '@nestjs/testing';
import { ServiceUnavailableException } from '@nestjs/common';
import { IntegrationsModule } from './integrations.module';
import { PROVIDER_MANAGEMENT } from './contracts';
describe('Production integration defaults', () => {
  it('fails closed for provider management until the provider modules implement it', async () => {
    const module = await Test.createTestingModule({ imports: [IntegrationsModule] }).compile();
    const provider = module.get<{ verifyProvider: () => never; setProviderActive: () => never }>(
      PROVIDER_MANAGEMENT,
    );
    expect(() => provider.verifyProvider()).toThrow(ServiceUnavailableException);
    expect(() => provider.setProviderActive()).toThrow(ServiceUnavailableException);
    await module.close();
  });
});
