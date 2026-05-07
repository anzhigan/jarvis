import { describe, expect, it } from 'vitest';
import { cn } from './cn';

describe('cn', () => {
  it('joins simple strings', () => {
    expect(cn('a', 'b')).toBe('a b');
  });

  it('drops falsy values', () => {
    expect(cn('a', false, undefined, null, '', 'b')).toBe('a b');
  });

  it('honours object syntax', () => {
    expect(cn('a', { b: true, c: false })).toBe('a b');
  });

  it('flattens arrays', () => {
    expect(cn(['a', 'b'], 'c')).toBe('a b c');
  });

  it('resolves Tailwind conflicts via twMerge — last padding wins', () => {
    expect(cn('p-2', 'p-4')).toBe('p-4');
  });

  it('keeps non-conflicting classes side by side', () => {
    expect(cn('text-sm', 'font-medium')).toBe('text-sm font-medium');
  });
});
