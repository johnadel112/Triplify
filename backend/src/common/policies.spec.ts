import { AccessPolicy } from './policies';
import { AccountStatus, Principal, UserRole } from './domain';
import { validateEnvironment } from '../config/environment';
describe('Shared authorization policies', () => {
  const policy = new AccessPolicy();
  const user: Principal = {
    id: 'owner',
    name: 'Owner',
    role: UserRole.USER,
    status: AccountStatus.ACTIVE,
    mustChangePassword: false,
    authVersion: 0,
    sessionId: 's',
  };
  it('rejects access to another user private resource', () =>
    expect(() => policy.ownerOrAdmin(user, 'other')).toThrow());
  it('permits admin only for explicit administrative reads', () => {
    const admin = { ...user, role: UserRole.ADMIN };
    expect(() => policy.ownerOrAdmin(admin, 'other')).toThrow();
    expect(() => policy.ownerOrAdmin(admin, 'other', true)).not.toThrow();
  });
  it('blocks hotel moderator airline operations', () =>
    expect(() =>
      policy.providerScope(
        { ...user, role: UserRole.HOTEL_MODERATOR, providerId: 'hotel', providerType: 'HOTEL' },
        'AIRLINE',
        'hotel',
      ),
    ).toThrow());
  it('blocks airline moderator other airline records', () =>
    expect(() =>
      policy.providerScope(
        {
          ...user,
          role: UserRole.AIRLINE_MODERATOR,
          providerId: 'airline',
          providerType: 'AIRLINE',
        },
        'AIRLINE',
        'other',
      ),
    ).toThrow());
  it('builds authoritative query scopes', () =>
    expect(policy.bookingQuery(user)).toEqual({ userId: 'owner' }));
  it('hides deactivated content but preserves suspended content', () => {
    expect(policy.contentVisibility(AccountStatus.DEACTIVATED, 'Jane')).toEqual({
      showPublicContent: false,
      attribution: 'Deleted user',
    });
    expect(policy.contentVisibility(AccountStatus.SUSPENDED, 'Jane').showPublicContent).toBe(true);
  });
});
describe('Startup validation', () => {
  const env = {
    MONGODB_URI: 'mongodb://localhost/test',
    JWT_ACCESS_SECRET: 'a'.repeat(64),
    FRONTEND_URL: 'http://localhost:5173',
  };
  it('accepts development configuration', () => expect(validateEnvironment(env).PORT).toBe(3000));
  it('rejects missing secret', () =>
    expect(() => validateEnvironment({ ...env, JWT_ACCESS_SECRET: '' })).toThrow());
  it('rejects insecure production cookies', () =>
    expect(() =>
      validateEnvironment({ ...env, NODE_ENV: 'production', COOKIE_SECURE: 'false' }),
    ).toThrow());
  it('rejects wildcard origins', () =>
    expect(() => validateEnvironment({ ...env, FRONTEND_URL: '*' })).toThrow());
});
