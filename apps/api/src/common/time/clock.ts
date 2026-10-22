import { Injectable, type Provider } from '@nestjs/common';

/**
 * The source of "now". Inject `Clock` (the abstract class is the token) instead of calling
 * `new Date()`, so tests can fix the time (ADR-0008 section 1).
 */
export abstract class Clock {
  abstract now(): Date;
}

@Injectable()
export class SystemClock extends Clock {
  now(): Date {
    return new Date();
  }
}

/** Register in a module's `providers`; override `Clock` in tests to control time. */
export const clockProvider: Provider = { provide: Clock, useClass: SystemClock };
