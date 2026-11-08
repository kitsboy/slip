import { afterEach, describe, expect, it } from 'vitest';
import { isCompareStopped, setCompareStopped } from '../src/core/compare-stop';

describe('compare stop', () => {
  afterEach(() => {
    localStorage.removeItem('slip.compare-stop');
  });

  it('starts clear, and only They match clears a refusal', () => {
    expect(isCompareStopped()).toBe(false);
    setCompareStopped(true);
    expect(isCompareStopped()).toBe(true);
    setCompareStopped(false);
    expect(isCompareStopped()).toBe(false);
  });
});
