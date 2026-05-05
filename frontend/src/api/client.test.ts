import { describe, expect, it } from 'vitest';
import { ApiError, resolveUrl } from './client';

describe('ApiError', () => {
  it('stores status and detail', () => {
    const err = new ApiError(404, 'Not found');
    expect(err.status).toBe(404);
    expect(err.detail).toBe('Not found');
    expect(err).toBeInstanceOf(Error);
  });
});

describe('resolveUrl', () => {
  it('returns empty string for null/undefined/empty', () => {
    expect(resolveUrl(null)).toBe('');
    expect(resolveUrl(undefined)).toBe('');
    expect(resolveUrl('')).toBe('');
  });

  it('passes through absolute http(s) urls', () => {
    expect(resolveUrl('https://example.com/foo')).toBe('https://example.com/foo');
    expect(resolveUrl('http://localhost:9000/bar')).toBe('http://localhost:9000/bar');
  });

  it('passes through data: and blob: urls', () => {
    expect(resolveUrl('data:image/png;base64,abc')).toBe('data:image/png;base64,abc');
    expect(resolveUrl('blob:http://localhost/123')).toBe('blob:http://localhost/123');
  });
});
