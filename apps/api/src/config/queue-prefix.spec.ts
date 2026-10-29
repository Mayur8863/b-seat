import { describe, expect, it } from 'vitest';

import { queuePrefix } from './queue-prefix.js';

describe('queuePrefix', () => {
  it('adds the database name in test', () => {
    expect(queuePrefix('test', 'postgres://u:p@db:5432/bseat_test_b')).toBe(
      'bseat:test:bseat_test_b',
    );
  });
  it('falls back without a database name', () => {
    expect(queuePrefix('test', 'postgres://u:p@db:5432')).toBe('bseat:test');
  });
  it('keeps development and production unchanged', () => {
    expect(queuePrefix('development', 'postgres://u@db/x')).toBe('bseat:development');
    expect(queuePrefix('production', 'postgres://u@db/x')).toBe('bseat:production');
  });
});
