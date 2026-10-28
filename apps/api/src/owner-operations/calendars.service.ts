import { Inject, Injectable } from '@nestjs/common';

import { Clock } from '../common/time/clock.js';
import type { Database } from '../db/db.js';
import { DB } from '../db/db.module.js';
import type { CalendarChange, CalendarInput, SpaceCalendars } from './calendars.schemas.js';

@Injectable()
export class CalendarsService {
  constructor(
    @Inject(DB) readonly db: Database,
    readonly clock: Clock,
  ) {}

  list(_ownerId: string, _spaceId: string): Promise<SpaceCalendars> {
    return Promise.reject(new Error('not implemented'));
  }
  putShared(_ownerId: string, _spaceId: string, _input: CalendarInput): Promise<CalendarChange> {
    return Promise.reject(new Error('not implemented'));
  }
  putSeat(
    _ownerId: string,
    _spaceId: string,
    _seatId: string,
    _input: CalendarInput,
  ): Promise<CalendarChange> {
    return Promise.reject(new Error('not implemented'));
  }
  removeSeat(_ownerId: string, _spaceId: string, _seatId: string): Promise<CalendarChange> {
    return Promise.reject(new Error('not implemented'));
  }
}
