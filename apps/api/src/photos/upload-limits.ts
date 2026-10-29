/** ADR-0011 section 2: upload requests in flight per API process (covers SC-006's 15 racers). */
export const MAX_UPLOADS_IN_FLIGHT = 16;
/** ADR-0011 section 4: concurrent image decodes, below libuv's default pool of 4. */
export const PROCESSING_PERMITS = 2;
export const PROCESSING_WAIT_MS = 20_000;

/** Counts upload requests in flight. Refuses at once when full: a waiting body is a buffered body. */
export class UploadAdmission {
  private active = 0;

  constructor(private readonly limit: number = MAX_UPLOADS_IN_FLIGHT) {}

  get inFlight(): number {
    return this.active;
  }

  /** Returns an idempotent release function, or null when the process is full. */
  tryEnter(): (() => void) | null {
    if (this.active >= this.limit) return null;
    this.active += 1;
    let released = false;
    return () => {
      if (released) return;
      released = true;
      this.active -= 1;
    };
  }
}

interface Waiter {
  grant: (release: () => void) => void;
  timer: NodeJS.Timeout;
  reject: (err: Error) => void;
}

/** A FIFO counting semaphore whose waiters give up after a timeout. */
export class Semaphore {
  private free: number;
  private readonly queue: Waiter[] = [];

  constructor(permits: number = PROCESSING_PERMITS) {
    this.free = permits;
  }

  acquire(timeoutMs: number): Promise<() => void> {
    if (this.free > 0) {
      this.free -= 1;
      return Promise.resolve(this.releaser());
    }
    return new Promise((resolve, reject) => {
      const waiter: Waiter = {
        grant: resolve,
        reject,
        timer: setTimeout(() => {
          const at = this.queue.indexOf(waiter);
          if (at >= 0) this.queue.splice(at, 1);
          reject(new Error('semaphore wait timed out'));
        }, timeoutMs),
      };
      this.queue.push(waiter);
    });
  }

  private releaser(): () => void {
    let released = false;
    return () => {
      if (released) return;
      released = true;
      const next = this.queue.shift();
      if (next) {
        clearTimeout(next.timer);
        next.grant(this.releaser());
      } else {
        this.free += 1;
      }
    };
  }
}
