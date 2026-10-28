import { describe, expect, it } from 'vitest';
import {
  announce,
  hasUnfinishedUploads,
  initialQueue,
  nextToStart,
  queueReducer,
  room,
  type QueueAction,
  type QueueState,
} from './queue';

const jpg = (name: string, size = 1000) => ({ name, size, type: 'image/jpeg' });
const run = (s: QueueState, ...a: QueueAction[]) => a.reduce(queueReducer, s);
const statuses = (s: QueueState) => s.items.map((i) => i.status.kind);

describe('enqueue', () => {
  it('queues the first files that fit and marks the rest not added', () => {
    const s = run(initialQueue, {
      type: 'enqueue',
      photoCount: 8,
      files: [jpg('a.jpg'), jpg('b.jpg'), jpg('c.jpg'), jpg('d.jpg')],
    });
    expect(statuses(s)).toEqual(['waiting', 'waiting', 'not-added', 'not-added']);
  });

  it('fails type and size at once without using room', () => {
    const s = run(initialQueue, {
      type: 'enqueue',
      photoCount: 9,
      files: [
        { name: 'x.heic', size: 10, type: 'image/heic' },
        jpg('big.jpg', 12 * 1024 * 1024),
        jpg('ok.jpg'),
        jpg('late.jpg'),
      ],
    });
    expect(statuses(s)).toEqual(['failed', 'failed', 'waiting', 'not-added']);
    expect(s.items[0]?.status).toMatchObject({
      kind: 'failed',
      problem: 'precheck:type',
      retryable: false,
    });
    expect(s.items[1]?.status).toMatchObject({ problem: 'precheck:size' });
  });

  it('accepts exactly 10 MB', () => {
    const s = run(initialQueue, {
      type: 'enqueue',
      photoCount: 0,
      files: [jpg('a.jpg', 10_485_760)],
    });
    expect(statuses(s)).toEqual(['waiting']);
  });

  it('counts queued rows against room', () => {
    let s = run(initialQueue, {
      type: 'enqueue',
      photoCount: 8,
      files: [jpg('a.jpg'), jpg('b.jpg')],
    });
    expect(room(s, 8)).toBe(0);
    s = run(s, { type: 'enqueue', photoCount: 8, files: [jpg('c.jpg')] });
    expect(s.items[2]?.status.kind).toBe('not-added');
  });
});

describe('lifecycle', () => {
  const three = run(initialQueue, {
    type: 'enqueue',
    photoCount: 0,
    files: [jpg('a.jpg'), jpg('b.jpg'), jpg('c.jpg')],
  });
  const ids = three.items.map((i) => i.id);

  it('starts at most 2 uploads at once', () => {
    expect(nextToStart(three)).toEqual([ids[0], ids[1]]);
    const s = run(three, { type: 'start', id: ids[0]! }, { type: 'start', id: ids[1]! });
    expect(nextToStart(s)).toEqual([]);
    expect(queueReducer(s, { type: 'start', id: ids[2]! })).toBe(s);
  });

  it('moves to processing at 100% and clamps progress', () => {
    let s = run(
      three,
      { type: 'start', id: ids[0]! },
      { type: 'progress', id: ids[0]!, percent: 40.6 },
    );
    expect(s.items[0]?.status).toEqual({ kind: 'uploading', percent: 41 });
    s = run(s, { type: 'progress', id: ids[0]!, percent: 100 });
    expect(s.items[0]?.status.kind).toBe('processing');
  });

  it('frees the slot when an uploading item is cancelled', () => {
    const s = run(
      three,
      { type: 'start', id: ids[0]! },
      { type: 'start', id: ids[1]! },
      { type: 'cancel', id: ids[0]! },
    );
    expect(s.items[0]?.status.kind).toBe('cancelled');
    expect(nextToStart(s)).toEqual([ids[2]]);
  });

  it('cannot cancel while processing', () => {
    const s = run(three, { type: 'start', id: ids[0]! }, { type: 'processing', id: ids[0]! });
    expect(queueReducer(s, { type: 'cancel', id: ids[0]! })).toBe(s);
  });

  it('retries only retryable failures and keeps the file', () => {
    let s = run(
      three,
      { type: 'start', id: ids[0]! },
      { type: 'failed', id: ids[0]!, problem: 'photo:busy' },
    );
    s = run(s, { type: 'retry', id: ids[0]! });
    expect(s.items[0]?.status.kind).toBe('waiting');
    expect(s.items[0]?.file.name).toBe('a.jpg');
    s = run(
      s,
      { type: 'start', id: ids[0]! },
      { type: 'failed', id: ids[0]!, problem: 'photo:too-large' },
    );
    expect(queueReducer(s, { type: 'retry', id: ids[0]! })).toBe(s);
  });

  it('maps a server 409 limit to not-added', () => {
    const s = run(
      three,
      { type: 'start', id: ids[0]! },
      { type: 'failed', id: ids[0]!, problem: 'photo:limit-reached' },
    );
    expect(s.items[0]?.status.kind).toBe('not-added');
  });

  it('fails every unfinished row on 401 and leaves finished ones', () => {
    const s = run(
      three,
      { type: 'start', id: ids[0]! },
      { type: 'added', id: ids[0]! },
      { type: 'start', id: ids[1]! },
      { type: 'failed', id: ids[1]!, problem: 'http-401' },
    );
    expect(statuses(s)).toEqual(['added', 'failed', 'failed']);
  });

  it('dismisses failed, cancelled and not-added rows only; clears finished', () => {
    let s = run(
      three,
      { type: 'start', id: ids[0]! },
      { type: 'failed', id: ids[0]!, problem: 'validation' },
    );
    expect(queueReducer(s, { type: 'dismiss', id: ids[1]! })).toBe(s);
    s = run(s, { type: 'dismiss', id: ids[0]! });
    expect(s.items).toHaveLength(2);
    s = run(
      s,
      { type: 'cancel', id: ids[1]! },
      { type: 'start', id: ids[2]! },
      { type: 'added', id: ids[2]! },
    );
    expect(run(s, { type: 'clear-finished' }).items).toHaveLength(0);
  });
});

describe('unfinished flag', () => {
  it('is true while waiting, uploading or processing', () => {
    const s = run(initialQueue, { type: 'enqueue', photoCount: 0, files: [jpg('a.jpg')] });
    expect(hasUnfinishedUploads(s)).toBe(true);
    const id = s.items[0]!.id;
    expect(hasUnfinishedUploads(run(s, { type: 'cancel', id }))).toBe(false);
    expect(
      hasUnfinishedUploads(
        run(s, { type: 'start', id }, { type: 'failed', id, problem: 'photo:busy' }),
      ),
    ).toBe(false);
  });
});

describe('announce', () => {
  const step = (s: QueueState, a: QueueAction) => {
    const next = queueReducer(s, a);
    return { next, text: announce(s, next, a) };
  };

  it('announces queued, not added and pre-check failures', () => {
    const { text } = step(initialQueue, {
      type: 'enqueue',
      photoCount: 9,
      files: [{ name: 'x.heic', size: 1, type: 'image/heic' }, jpg('a.jpg'), jpg('b.jpg')],
    });
    expect(text).toBe(
      "x.heic was not added. This isn't a JPEG, PNG or WebP photo. iPhone HEIC photos need converting first. 1 photo queued. 1 photo not added: this space already has 10 photos.",
    );
  });

  it('announces progress of a selection without percentages', () => {
    let s = run(initialQueue, {
      type: 'enqueue',
      photoCount: 0,
      files: [jpg('a.jpg'), jpg('b.jpg'), jpg('c.jpg')],
    });
    const [a, b, c] = s.items.map((i) => i.id) as [number, number, number];
    s = run(s, { type: 'start', id: a }, { type: 'start', id: b });
    expect(step(s, { type: 'progress', id: a, percent: 50 }).text).toBeNull();
    let r = step(s, { type: 'added', id: a });
    expect(r.text).toBe('Photo 1 of 3 added.');
    r = step(r.next, { type: 'failed', id: b, problem: 'photo:unsupported-format' });
    expect(r.text).toBe(
      "b.jpg failed. This isn't a supported photo. Use a JPEG, PNG or WebP photo that isn't animated.",
    );
    r = step(r.next, { type: 'start', id: c });
    r = step(r.next, { type: 'added', id: c });
    expect(r.text).toBe('Photo 2 of 3 added. 2 added, 1 failed.');
  });

  it('announces cancel, retry and the all-added summary', () => {
    let s = run(initialQueue, { type: 'enqueue', photoCount: 0, files: [jpg('a.jpg')] });
    const id = s.items[0]!.id;
    expect(step(s, { type: 'cancel', id }).text).toBe('a.jpg cancelled.');
    s = run(s, { type: 'start', id }, { type: 'failed', id, problem: 'network' });
    const r = step(s, { type: 'retry', id });
    expect(r.text).toBe('a.jpg is waiting to upload again.');
    const done = step(run(r.next, { type: 'start', id }), { type: 'added', id });
    expect(done.text).toBe('Photo 1 of 1 added. 1 of 1 photos added.');
  });
});
