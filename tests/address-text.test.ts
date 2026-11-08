import { describe, expect, it } from 'vitest';

import { addressGroups } from '../src/ui/AddressText';

describe('address groups', () => {
  it('splits into fours and joins back to the plain address', () => {
    const address = 'bc1qcr8te4kr609gcawutmrza0j4xv80jy8z306fyu';
    expect(addressGroups(address).join('')).toBe(address);
    expect(addressGroups(address).every((group) => group.length <= 4)).toBe(true);
  });
});
