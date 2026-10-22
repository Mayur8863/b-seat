import { Test } from '@nestjs/testing';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { Clock, clockProvider, SystemClock } from './clock.js';

describe('Clock', () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it('SystemClock returns the current time', () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-10-22T12:00:00Z'));

    expect(new SystemClock().now().toISOString()).toBe('2026-10-22T12:00:00.000Z');
  });

  it('is injectable by its abstract class and can be replaced in tests', async () => {
    const real = await Test.createTestingModule({ providers: [clockProvider] }).compile();
    expect(real.get(Clock)).toBeInstanceOf(SystemClock);

    const fixed = new Date('2030-01-01T00:00:00Z');
    const faked = await Test.createTestingModule({ providers: [clockProvider] })
      .overrideProvider(Clock)
      .useValue({ now: () => fixed })
      .compile();
    expect(faked.get(Clock).now()).toBe(fixed);
  });
});
