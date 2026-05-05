import { describe, expect, it } from 'vitest';
import { ENTITY_COLORS, STANDARD_COLORS } from './colors';

describe('ENTITY_COLORS', () => {
  it('exposes 7 hex colors', () => {
    expect(ENTITY_COLORS).toHaveLength(7);
    for (const c of ENTITY_COLORS) {
      expect(c).toMatch(/^#[0-9A-Fa-f]{6}$/);
    }
  });

  it('STANDARD_COLORS aliases ENTITY_COLORS', () => {
    expect(STANDARD_COLORS).toBe(ENTITY_COLORS);
  });

  it('has unique values', () => {
    expect(new Set(ENTITY_COLORS).size).toBe(ENTITY_COLORS.length);
  });
});
