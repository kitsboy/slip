import { describe, expect, it } from 'vitest';

import { ungrouped } from '../src/ui/QRCard';

describe('QR card words', () => {
  it('treats spaces as display only', () => {
    expect(ungrouped('bc1q cr8t e4zc')).toBe('bc1qcr8te4zc');
  });

  it('calls a mismatch when the words are not the code', () => {
    const payload = 'bc1qcr8te4zc7example';
    const displayed = 'bc1qdoesnotmatch';
    expect(ungrouped(displayed) === ungrouped(payload)).toBe(false);
  });
});
