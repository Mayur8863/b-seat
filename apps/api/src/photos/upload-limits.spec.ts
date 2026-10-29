import { describe, expect, it } from 'vitest';

import { Semaphore, UploadAdmission } from './upload-limits.js';

describe('UploadAdmission', () => {
  it('admits up to the limit and refuses the next at once', () => {
    const admission = new UploadAdmission(2);
    const a = admission.tryEnter();
    const b = admission.tryEnter();
    expect(a).not.toBeNull();
    expect(b).not.toBeNull();
    expect(admission.tryEnter()).toBeNull();
    expect(admission.inFlight).toBe(2);
  });

  it('frees a slot on release, once only', () => {
    const admission = new UploadAdmission(1);
    const release = admission.tryEnter();
    release?.();
    release?.();
    expect(admission.inFlight).toBe(0);
    expect(admission.tryEnter()).not.toBeNull();
  });
});

describe('Semaphore', () => {
  it('runs at most `permits` at a time and queues the rest in order', async () => {
    const sem = new Semaphore(2);
    const r1 = await sem.acquire(100);
    const r2 = await sem.acquire(100);
    const order: number[] = [];
    const p3 = sem.acquire(1000).then((r) => (order.push(3), r));
    const p4 = sem.acquire(1000).then((r) => (order.push(4), r));
    await Promise.resolve();
    expect(order).toEqual([]);
    r1();
    const r3 = await p3;
    expect(order).toEqual([3]);
    r2();
    const r4 = await p4;
    expect(order).toEqual([3, 4]);
    r3();
    r4();
  });

  it('rejects a waiter after the timeout and does not leak its slot', async () => {
    const sem = new Semaphore(1);
    const r1 = await sem.acquire(100);
    await expect(sem.acquire(20)).rejects.toThrow(/timed out/);
    r1();
    const r2 = await sem.acquire(100);
    r2();
  });
});
