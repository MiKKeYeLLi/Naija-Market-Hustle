import { describe, expect, it } from 'vitest';
import { formatNaira } from './format';

describe('formatNaira', () => {
  it.each([
    [0, '₦0'],
    [80, '₦80'],
    [1250, '₦1,250'],
    [1234567, '₦1,234,567'],
    [99.6, '₦100'],
    [-50, '₦0'],
  ])('%d → %s', (amount, text) => {
    expect(formatNaira(amount)).toBe(text);
  });
});
