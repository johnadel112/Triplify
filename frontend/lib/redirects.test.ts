import { describe, expect, it } from 'vitest';
import { safeReturnPath } from './redirects';

describe('safeReturnPath', () => {
  it('keeps local application paths', () => {
    expect(safeReturnPath('/account/profile?tab=contact')).toBe('/account/profile?tab=contact');
  });

  it.each(['https://evil.test', '//evil.test', '/\\evil.test'])('rejects unsafe redirect %s', (path) => {
    expect(safeReturnPath(path)).toBe('/dashboard');
  });
});
