import type { OccupancyMark, OwnerSeat } from '@bseat/api-client';
import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { http, HttpResponse } from 'msw';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { server } from '@/test/msw';
import { renderWithQuery } from '@/test/render';

import { SeatManager } from './seat-manager';

vi.mock('@bseat/ui/components/sonner', () => ({ toast: { success: vi.fn(), error: vi.fn() } }));
vi.mock('next/navigation', () => ({ usePathname: () => '/owner/spaces/s1/seats' }));
import { toast } from '@bseat/ui/components/sonner';

const BASE = '*/api/owner/spaces/s1';
const problem = (status: number, type: string, extra: object = {}) =>
  HttpResponse.json(
    { type: `urn:bseat:problem:${type}`, title: 't', status, ...extra },
    { status, headers: { 'content-type': 'application/problem+json' } },
  );

const seat = (label: string, today: OwnerSeat['today']): OwnerSeat => ({
  id: `id-${label}`,
  label,
  features: [],
  cubicle: null,
  calendar: 'shared',
  today,
});
const vacant = { state: 'vacant', note: null, markId: null } as const;
const mark = (label: string, over: Partial<OccupancyMark> = {}): OccupancyMark => ({
  id: `m-${label}`,
  seat: { id: `id-${label}`, label },
  startDate: '2020-01-01',
  endDate: null,
  note: null,
  startsAt: '2020-01-01T00:00:00Z',
  endsAt: null,
  status: 'active',
  ...over,
});

interface Db {
  seats: OwnerSeat[];
  marks: OccupancyMark[];
  onMark?: (body: unknown) => Response | undefined;
  onEnd?: () => Response | undefined;
  marksFail?: boolean;
}

function fakeApi(db: Db) {
  server.use(
    http.get(BASE, () => HttpResponse.json({ id: 's1', timeZone: 'Europe/London' })),
    http.get(`${BASE}/seats`, () => HttpResponse.json({ items: db.seats })),
    http.get(`${BASE}/cubicles`, () => HttpResponse.json({ items: [] })),
    http.get(`${BASE}/occupancy`, () =>
      db.marksFail ? problem(500, 'x') : HttpResponse.json({ items: db.marks }),
    ),
    http.post(`${BASE}/occupancy`, async ({ request }) => {
      const body = (await request.json()) as { seatIds: string[]; note: string | null };
      const failed = db.onMark?.(body);
      if (failed) return failed;
      db.seats = db.seats.map((s) =>
        body.seatIds.includes(s.id)
          ? { ...s, today: { state: 'occupied', note: body.note, markId: `m-${s.label}` } }
          : s,
      );
      return HttpResponse.json({ items: [] }, { status: 201 });
    }),
    http.post(`${BASE}/occupancy/:markId/end`, ({ params }) => {
      const failed = db.onEnd?.();
      if (failed) return failed;
      db.marks = db.marks.filter((m) => m.id !== params.markId);
      db.seats = db.seats.map((s) =>
        s.today.markId === params.markId ? { ...s, today: vacant } : s,
      );
      return HttpResponse.json({});
    }),
  );
}

const setup = (db: Partial<Db> = {}) => {
  const full: Db = {
    seats: [seat('A-1', vacant), seat('A-2', vacant), seat('A-3', vacant)],
    marks: [],
    ...db,
  };
  fakeApi(full);
  renderWithQuery(<SeatManager spaceId="s1" />);
  return full;
};
const checkbox = (label: string) => screen.findByRole('checkbox', { name: `Select seat ${label}` });

beforeEach(() => {
  vi.mocked(toast.success).mockClear();
});

describe('today state', () => {
  it('shows icon-and-text state, the private note and a bookings link for a renter-booked seat', async () => {
    setup({
      seats: [
        seat('A-1', vacant),
        seat('A-2', { state: 'occupied', note: 'Reserved for Sam', markId: 'm-A-2' }),
        seat('A-3', { state: 'booked', note: null, markId: null }),
      ],
      marks: [mark('A-2', { note: 'Reserved for Sam' })],
    });
    expect(await screen.findByText('Vacant')).toBeInTheDocument();
    expect(screen.getByText('Occupied by you')).toBeInTheDocument();
    expect(screen.getByText('Booked by a renter')).toBeInTheDocument();
    expect(screen.getAllByText('Note: Reserved for Sam').length).toBeGreaterThan(0);
    expect(screen.getByRole('link', { name: /See bookings/ })).toHaveAttribute(
      'href',
      '/owner/spaces/s1/bookings',
    );
    expect(screen.getByText(/Only you can see occupancy notes/)).toBeInTheDocument();
  });

  it('shows the marks error with retry while rows keep their state', async () => {
    setup({ marksFail: true });
    expect(await screen.findByText("We couldn't load occupancy details")).toBeInTheDocument();
    expect(screen.getAllByText('Vacant')).toHaveLength(3);
    expect(screen.queryByRole('button', { name: /Occupancy \(/ })).not.toBeInTheDocument();
  });

  it('empty: no toolbar when there are no seats', async () => {
    setup({ seats: [] });
    expect(await screen.findByText('No seats yet.')).toBeInTheDocument();
    expect(screen.queryByRole('group', { name: 'Seat selection' })).not.toBeInTheDocument();
  });
});

describe('selecting seats', () => {
  it('toggles with the keyboard, announces the count and shows tri-state Select all', async () => {
    const user = userEvent.setup();
    setup();
    const a1 = await checkbox('A-1');
    expect(screen.queryByRole('button', { name: 'Mark occupied' })).not.toBeInTheDocument();
    a1.focus();
    await user.keyboard(' ');
    expect(a1).toBeChecked();
    expect(screen.getByText('1 seat selected')).toBeInTheDocument();
    const all = screen.getByRole('checkbox', { name: 'Select all 3 seats' });
    expect(all).toHaveAttribute('aria-checked', 'mixed');
    await user.click(all);
    expect(all).toBeChecked();
    expect(screen.getByText('3 seats selected')).toBeInTheDocument();
    await user.click(all);
    expect(screen.queryByText(/seats? selected/)).not.toBeInTheDocument();
  });

  it('Shift+Space selects the range from the last toggled seat', async () => {
    const user = userEvent.setup();
    setup();
    const a1 = await checkbox('A-1');
    a1.focus();
    await user.keyboard(' ');
    (await checkbox('A-3')).focus();
    await user.keyboard('{Shift>} {/Shift}');
    expect(await checkbox('A-2')).toBeChecked();
    expect(screen.getByText('3 seats selected')).toBeInTheDocument();
  });

  it('Clear selection empties it', async () => {
    const user = userEvent.setup();
    setup();
    await user.click(await checkbox('A-2'));
    await user.click(screen.getByRole('button', { name: 'Clear selection' }));
    expect(await checkbox('A-2')).not.toBeChecked();
  });
});

async function openPanel(user: ReturnType<typeof userEvent.setup>, labels = ['A-1', 'A-2']) {
  for (const l of labels) await user.click(await checkbox(l));
  await user.click(screen.getByRole('button', { name: 'Mark occupied' }));
  return screen.getByRole('form', { name: 'Mark seats occupied' });
}

describe('mark occupied panel', () => {
  it('opens focused on its heading with the selected seats', async () => {
    const user = userEvent.setup();
    setup();
    await openPanel(user);
    expect(screen.getByRole('heading', { name: 'Mark seats occupied' })).toHaveFocus();
    expect(screen.getByText('Seats: A-1, A-2')).toBeInTheDocument();
    expect(screen.getByLabelText('Start date')).toBeInTheDocument();
    expect(screen.queryByLabelText('End date')).not.toBeInTheDocument();
    await user.click(screen.getByRole('radio', { name: 'On a date' }));
    expect(screen.getByLabelText('End date')).toBeInTheDocument();
    expect(screen.getByRole('radio', { name: 'On a date' })).toHaveFocus();
  });

  it('validates the end date before calling the API', async () => {
    const user = userEvent.setup();
    const onMark = vi.fn();
    setup({ onMark });
    await openPanel(user);
    await user.click(screen.getByRole('radio', { name: 'On a date' }));
    await user.click(screen.getAllByRole('button', { name: 'Mark occupied' })[1]!);
    expect(await screen.findByText('Choose an end date.')).toBeInTheDocument();
    expect(screen.getByLabelText('End date')).toHaveAccessibleDescription(/stay occupied/);
    expect(onMark).not.toHaveBeenCalled();
  });

  it('marks the seats, announces success, clears the selection and refreshes the states', async () => {
    const user = userEvent.setup();
    let sent: unknown;
    setup({
      onMark: (b) => {
        sent = b;
        return undefined;
      },
    });
    await openPanel(user);
    await user.type(screen.getByLabelText('Note (optional)'), 'Move');
    await user.click(screen.getAllByRole('button', { name: 'Mark occupied' })[1]!);
    expect(await screen.findByText('2 seats marked occupied.')).toBeInTheDocument();
    expect(toast.success).toHaveBeenCalledWith('2 seats marked occupied');
    expect(sent).toMatchObject({ seatIds: ['id-A-1', 'id-A-2'], endDate: null, note: 'Move' });
    expect(await screen.findAllByText('Occupied by you')).toHaveLength(2);
    expect(screen.queryByRole('form', { name: 'Mark seats occupied' })).not.toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'Your seats' })).toHaveFocus();
    expect(screen.queryByText(/seats? selected/)).not.toBeInTheDocument();
  });

  it("lists each seat's booked dates and marks on a conflict, keeping the input", async () => {
    const user = userEvent.setup();
    setup({
      onMark: () =>
        problem(409, 'occupancy:conflicts-with-bookings', {
          conflicts: [
            {
              seatId: 'id-A-1',
              label: 'A-1',
              bookedDates: ['2026-11-03', '2026-11-04', '2026-11-09'],
              marks: [{ id: 'x', startDate: '2026-11-02', endDate: null }],
            },
          ],
        }),
    });
    await openPanel(user);
    await user.type(screen.getByLabelText('Note (optional)'), 'keep me');
    await user.click(screen.getAllByRole('button', { name: 'Mark occupied' })[1]!);
    const alert = await screen.findByRole('alert');
    expect(within(alert).getByText('Some seats are booked on those dates')).toBeInTheDocument();
    expect(within(alert).getByText('A-1')).toBeInTheDocument();
    expect(
      within(alert).getByText(/Booked: Tue 3 Nov to Wed 4 Nov, Mon 9 Nov/),
    ).toBeInTheDocument();
    expect(
      within(alert).getByText('Already occupied: from Mon 2 Nov, no end date'),
    ).toBeInTheDocument();
    await waitFor(() => {
      expect(alert).toHaveFocus();
    });
    expect(screen.getByLabelText('Note (optional)')).toHaveValue('keep me');
    expect(screen.getByText('2 seats selected')).toBeInTheDocument();
    expect(toast.success).not.toHaveBeenCalled();
  });

  it('shows the already-occupied title', async () => {
    const user = userEvent.setup();
    setup({
      onMark: () =>
        problem(409, 'occupancy:already-occupied', {
          conflicts: [{ seatId: 'id-A-1', label: 'A-1', bookedDates: [], marks: [] }],
        }),
    });
    await openPanel(user);
    await user.click(screen.getAllByRole('button', { name: 'Mark occupied' })[1]!);
    expect(await screen.findByText('Some seats are already occupied')).toBeInTheDocument();
  });

  it('Cancel keeps the selection and returns focus to Mark occupied', async () => {
    const user = userEvent.setup();
    setup();
    await openPanel(user);
    await user.click(screen.getByRole('button', { name: 'Cancel' }));
    await waitFor(() => {
      expect(screen.getByRole('button', { name: 'Mark occupied' })).toHaveFocus();
    });
    expect(screen.getByText('2 seats selected')).toBeInTheDocument();
  });
});

describe('marks and Mark vacant', () => {
  const occupied = seat('A-1', { state: 'occupied', note: null, markId: 'm-A-1' });

  it('Mark vacant asks first (safe button focused) and then reads vacant', async () => {
    const user = userEvent.setup();
    setup({ seats: [occupied, seat('A-2', vacant)], marks: [mark('A-1')] });
    await user.click(await screen.findByRole('button', { name: 'Mark vacant seat A-1' }));
    const dialog = await screen.findByRole('alertdialog', { name: 'Mark seat A-1 vacant?' });
    expect(within(dialog).getByRole('button', { name: 'Keep occupied' })).toHaveFocus();
    await user.click(within(dialog).getByRole('button', { name: 'Mark vacant' }));
    await waitFor(() => {
      expect(toast.success).toHaveBeenCalledWith('Seat A-1 is vacant');
    });
    expect(await screen.findAllByText('Vacant')).toHaveLength(2);
    expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /Occupancy \(/ })).not.toBeInTheDocument();
  });

  it('lists marks, with Mark vacant for the current one and Remove for an upcoming one', async () => {
    const user = userEvent.setup();
    setup({
      seats: [occupied],
      marks: [
        mark('A-1', { id: 'now', startDate: '2020-01-01', endDate: '2020-02-01' }),
        mark('A-1', { id: 'next', startDate: '2999-01-04', endDate: null, note: 'later' }),
      ],
    });
    const toggle = await screen.findByRole('button', { name: /Occupancy \(2/ });
    expect(toggle).toHaveAttribute('aria-expanded', 'false');
    await user.click(toggle);
    const marks = screen.getByRole('list', { name: 'Occupancy for seat A-1' });
    expect(within(marks).getByText('Current')).toBeInTheDocument();
    expect(within(marks).getByText('Upcoming')).toBeInTheDocument();
    expect(within(marks).getByText('Note: later')).toBeInTheDocument();
    await user.click(within(marks).getByRole('button', { name: /^Remove seat A-1/ }));
    const dialog = await screen.findByRole('alertdialog', {
      name: 'Remove this mark for seat A-1?',
    });
    await user.click(within(dialog).getByRole('button', { name: 'Remove mark' }));
    await waitFor(() => {
      expect(toast.success).toHaveBeenCalledWith('Mark removed');
    });
  });

  it('shows a page alert when ending fails', async () => {
    const user = userEvent.setup();
    setup({
      seats: [occupied],
      marks: [mark('A-1')],
      onEnd: () => problem(404, 'not-found'),
    });
    await user.click(await screen.findByRole('button', { name: 'Mark vacant seat A-1' }));
    await user.click(
      within(await screen.findByRole('alertdialog')).getByRole('button', { name: 'Mark vacant' }),
    );
    expect(await screen.findByText("We couldn't find that mark")).toBeInTheDocument();
  });
});
