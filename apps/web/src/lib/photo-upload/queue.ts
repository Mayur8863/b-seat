// Pure model of the owner photo upload queue (specs/003-space-photos/ui/01-owner-photos.md
// section 4). No React and no I/O: the XHR helper and the page drive it with actions.

export const PHOTO_LIMIT = 10;
export const MAX_CONCURRENT_UPLOADS = 2;
export const MAX_FILE_BYTES = 10_485_760;
const ACCEPTED_TYPES = ['image/jpeg', 'image/png', 'image/webp'];

export interface QueueFile {
  name: string;
  size: number;
  type: string;
}

/** Problem type after `urn:bseat:problem:`, or one of the client-side keys. */
export type Problem = string;

const LIMIT_TEXT = 'this space already has 10 photos.';
const REASONS: Record<string, { text: string; retryable: boolean }> = {
  'precheck:type': {
    text: "This isn't a JPEG, PNG or WebP photo. iPhone HEIC photos need converting first.",
    retryable: false,
  },
  'precheck:size': { text: 'This photo is over 10 MB. Choose a smaller one.', retryable: false },
  'photo:too-large': { text: 'This photo is over 10 MB. Choose a smaller one.', retryable: false },
  'photo:unsupported-format': {
    text: "This isn't a supported photo. Use a JPEG, PNG or WebP photo that isn't animated.",
    retryable: false,
  },
  'photo:dimensions-out-of-range': {
    text: 'The longest side must be 800 to 12,000 pixels, up to 50 megapixels.',
    retryable: false,
  },
  'photo:unreadable': { text: "This file couldn't be read as an image.", retryable: false },
  'photo:busy': { text: "We're busy right now. Try again in a moment.", retryable: true },
  network: { text: 'Connection lost. Check your connection and try again.', retryable: true },
  'http-401': {
    text: 'Your session ended. Sign in again, then add the photo again.',
    retryable: false,
  },
  'http-403': { text: "You can't add photos to this space.", retryable: false },
  'http-404': { text: "We couldn't find this space.", retryable: false },
};
const FALLBACK = { text: 'Something went wrong. Try again.', retryable: true };

export function problemReason(problem: Problem): { text: string; retryable: boolean } {
  return REASONS[problem] ?? FALLBACK;
}

export type ItemStatus =
  | { kind: 'waiting' }
  | { kind: 'uploading'; percent: number }
  | { kind: 'processing' }
  | { kind: 'added' }
  | { kind: 'failed'; problem: Problem; reason: string; retryable: boolean }
  | { kind: 'not-added' }
  | { kind: 'cancelled' };

export interface QueueItem {
  id: number;
  /** The selection (one picker use) the item came from, for "Photo k of total". */
  batch: number;
  /** True once the item was accepted for upload (passed the pre-check, fit the room). */
  queued: boolean;
  file: QueueFile;
  status: ItemStatus;
}

export interface QueueState {
  items: QueueItem[];
  nextId: number;
  nextBatch: number;
}

export const initialQueue: QueueState = { items: [], nextId: 1, nextBatch: 1 };

export type QueueAction =
  | { type: 'enqueue'; files: QueueFile[]; photoCount: number }
  | { type: 'start'; id: number }
  | { type: 'progress'; id: number; percent: number }
  | { type: 'processing'; id: number }
  | { type: 'added'; id: number }
  | { type: 'failed'; id: number; problem: Problem }
  | { type: 'retry'; id: number }
  | { type: 'cancel'; id: number }
  | { type: 'dismiss'; id: number }
  | { type: 'clear-finished' };

const isActive = (k: ItemStatus['kind']) =>
  k === 'waiting' || k === 'uploading' || k === 'processing';
const inFlight = (k: ItemStatus['kind']) => k === 'uploading' || k === 'processing';

/** Free slots: the limit minus added photos and rows still waiting, uploading or processing. */
export function room(state: QueueState, photoCount: number): number {
  const active = state.items.filter((i) => isActive(i.status.kind)).length;
  return Math.max(0, PHOTO_LIMIT - photoCount - active);
}

/** Ids of waiting items that may start now, in selection order, within the concurrency cap. */
export function nextToStart(state: QueueState): number[] {
  const free = MAX_CONCURRENT_UPLOADS - state.items.filter((i) => inFlight(i.status.kind)).length;
  return state.items
    .filter((i) => i.status.kind === 'waiting')
    .slice(0, Math.max(0, free))
    .map((i) => i.id);
}

export const hasUnfinishedUploads = (state: QueueState): boolean =>
  state.items.some((i) => isActive(i.status.kind));

const failedStatus = (problem: Problem): ItemStatus => {
  const { text, retryable } = problemReason(problem);
  return { kind: 'failed', problem, reason: text, retryable };
};

function precheck(file: QueueFile): Problem | null {
  if (!ACCEPTED_TYPES.includes(file.type)) return 'precheck:type';
  if (file.size > MAX_FILE_BYTES) return 'precheck:size';
  return null;
}

function update(state: QueueState, id: number, fn: (i: QueueItem) => QueueItem | null): QueueState {
  const idx = state.items.findIndex((i) => i.id === id);
  const item = state.items[idx];
  if (!item) return state;
  const next = fn(item);
  if (next === item) return state;
  const items = state.items.slice();
  if (next) items[idx] = next;
  else items.splice(idx, 1);
  return { ...state, items };
}

const setStatus = (item: QueueItem, status: ItemStatus): QueueItem => ({ ...item, status });

export function queueReducer(state: QueueState, action: QueueAction): QueueState {
  switch (action.type) {
    case 'enqueue': {
      let left = room(state, action.photoCount);
      let id = state.nextId;
      const batch = state.nextBatch;
      const items = action.files.map((file): QueueItem => {
        const problem = precheck(file);
        if (problem) return { id: id++, batch, queued: false, file, status: failedStatus(problem) };
        if (left > 0) {
          left -= 1;
          return { id: id++, batch, queued: true, file, status: { kind: 'waiting' } };
        }
        return { id: id++, batch, queued: false, file, status: { kind: 'not-added' } };
      });
      if (items.length === 0) return state;
      return { items: [...state.items, ...items], nextId: id, nextBatch: batch + 1 };
    }
    case 'start': {
      if (!nextToStart(state).includes(action.id)) return state;
      return update(state, action.id, (i) => setStatus(i, { kind: 'uploading', percent: 0 }));
    }
    case 'progress':
      return update(state, action.id, (i) => {
        if (i.status.kind !== 'uploading') return i;
        const percent = Math.min(100, Math.max(0, Math.round(action.percent)));
        // All bytes sent: the server is still working (AC 1.3).
        return setStatus(
          i,
          percent >= 100 ? { kind: 'processing' } : { kind: 'uploading', percent },
        );
      });
    case 'processing':
      return update(state, action.id, (i) =>
        i.status.kind === 'uploading' ? setStatus(i, { kind: 'processing' }) : i,
      );
    case 'added':
      return update(state, action.id, (i) =>
        inFlight(i.status.kind) ? setStatus(i, { kind: 'added' }) : i,
      );
    case 'failed': {
      if (action.problem === 'http-401') {
        // The session is gone for every unfinished row (UI spec 4.4).
        return {
          ...state,
          items: state.items.map((i) =>
            isActive(i.status.kind) ? setStatus(i, failedStatus('http-401')) : i,
          ),
        };
      }
      return update(state, action.id, (i) => {
        if (!isActive(i.status.kind)) return i;
        return setStatus(
          i,
          action.problem === 'photo:limit-reached'
            ? { kind: 'not-added' }
            : failedStatus(action.problem),
        );
      });
    }
    case 'retry':
      return update(state, action.id, (i) =>
        i.status.kind === 'failed' && i.status.retryable ? setStatus(i, { kind: 'waiting' }) : i,
      );
    case 'cancel':
      // Not while processing: the bytes are already with the server (AC 1.5).
      return update(state, action.id, (i) =>
        i.status.kind === 'waiting' || i.status.kind === 'uploading'
          ? setStatus(i, { kind: 'cancelled' })
          : i,
      );
    case 'dismiss':
      return update(state, action.id, (i) =>
        ['failed', 'not-added', 'cancelled'].includes(i.status.kind) ? null : i,
      );
    case 'clear-finished': {
      const items = state.items.filter(
        (i) => !['added', 'not-added', 'cancelled'].includes(i.status.kind),
      );
      return items.length === state.items.length ? state : { ...state, items };
    }
  }
}

const plural = (n: number, one: string, many: string) => (n === 1 ? one : many);

function batchSummary(state: QueueState, batch: number): string | null {
  const queued = state.items.filter((i) => i.batch === batch && i.queued);
  if (queued.length === 0 || queued.some((i) => isActive(i.status.kind))) return null;
  const added = queued.filter((i) => i.status.kind === 'added').length;
  const failed = queued.filter((i) => i.status.kind === 'failed').length;
  return failed > 0
    ? `${added} added, ${failed} failed.`
    : `${added} of ${queued.length} photos added.`;
}

/**
 * The live-region message for one transition, or null when nothing is announced.
 * Never includes a percentage (UI spec 3.7).
 */
export function announce(prev: QueueState, next: QueueState, action: QueueAction): string | null {
  if (prev === next) return null;
  if (action.type === 'enqueue') {
    const fresh = next.items.filter((i) => i.batch === next.nextBatch - 1);
    const parts: string[] = [];
    for (const i of fresh) {
      if (i.status.kind === 'failed')
        parts.push(`${i.file.name} was not added. ${i.status.reason}`);
    }
    const queued = fresh.filter((i) => i.queued).length;
    const notAdded = fresh.filter((i) => i.status.kind === 'not-added').length;
    if (queued > 0) parts.push(`${queued} ${plural(queued, 'photo', 'photos')} queued.`);
    if (notAdded > 0)
      parts.push(`${notAdded} ${plural(notAdded, 'photo', 'photos')} not added: ${LIMIT_TEXT}`);
    return parts.length > 0 ? parts.join(' ') : null;
  }
  if (action.type === 'clear-finished' || action.type === 'dismiss') return null;
  if (
    action.type === 'progress' &&
    next.items.find((i) => i.id === action.id)?.status.kind !== 'processing'
  )
    return null;
  const item = next.items.find((i) => i.id === action.id);
  const before = prev.items.find((i) => i.id === action.id);
  if (!item || !before) return null;
  const parts: string[] = [];
  switch (action.type) {
    case 'added': {
      const k = next.items.filter(
        (i) => i.batch === item.batch && i.status.kind === 'added',
      ).length;
      const total = next.items.filter((i) => i.batch === item.batch && i.queued).length;
      parts.push(`Photo ${k} of ${total} added.`);
      break;
    }
    case 'failed':
      if (item.status.kind === 'not-added') {
        parts.push(`${item.file.name} not added: ${LIMIT_TEXT}`);
      } else if (item.status.kind === 'failed') {
        parts.push(`${item.file.name} failed. ${item.status.reason}`);
      }
      break;
    case 'cancel':
      if (item.status.kind === 'cancelled') parts.push(`${item.file.name} cancelled.`);
      break;
    case 'retry':
      if (item.status.kind === 'waiting')
        parts.push(`${item.file.name} is waiting to upload again.`);
      break;
    default:
      return null;
  }
  if (parts.length === 0) return null;
  const summary = batchSummary(next, item.batch);
  if (summary && action.type !== 'cancel' && action.type !== 'retry') parts.push(summary);
  return parts.join(' ');
}
