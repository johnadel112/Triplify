import { BadRequestException } from '@nestjs/common';
import { escapeRegex, excerpt, imageKind, normalizeTags } from './blog-posts.utils';

describe('Blog core utilities', () => {
  it('normalizes tags and preserves five unique tags', () => {
    expect(normalizeTags([' Cairo ', 'Nile', 'Travel'])).toEqual(['cairo', 'nile', 'travel']);
    expect(normalizeTags(['a', 'b', 'c', 'd', 'e'])).toHaveLength(5);
  });
  it('rejects duplicate, empty and excessive tags', () => {
    expect(() => normalizeTags(['NYC', 'nyc'])).toThrow(BadRequestException);
    expect(() => normalizeTags(['   '])).toThrow(BadRequestException);
    expect(() => normalizeTags(['a', 'b', 'c', 'd', 'e', 'f'])).toThrow(BadRequestException);
  });
  it('escapes regex metacharacters in search input', () => {
    expect(escapeRegex('a.*b')).toBe('a\\.\\*b');
  });
  it('creates a readable excerpt', () => {
    expect(excerpt(' hello   world\n!', 20)).toBe('hello world !');
    expect(excerpt('abcdefghijk', 5)).toBe('abcde…');
  });
  it('recognizes PNG and JPEG magic bytes, rejecting imposters', () => {
    expect(imageKind(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]))?.mimeType).toBe('image/png');
    expect(imageKind(Buffer.from([255, 216, 255, 224]))?.mimeType).toBe('image/jpeg');
    expect(imageKind(Buffer.from('not an image'))).toBeNull();
  });
});
