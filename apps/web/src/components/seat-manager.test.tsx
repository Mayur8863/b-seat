import type { Cubicle, OwnerSeat } from '@bseat/api-client';
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
    { type: `urn:bseat:problem:listing:${type}`, title: 't', status, ...extra },
    { status, headers: { 'content-type': 'application/problem+json' } },
  );

const seat = (
  label: string,
  cubicle: Cubicle | null = null,
  features: string[] = [],
): OwnerSeat => ({
  id: `id-${label}`,
  label,
  features,
  cubicle: cubicle && { id: cubicle.id, name: cubicle.name },
  calendar: 'shared',
  today: { state: 'vacant', note: null, markId: null },
});

interface Db {
  seats: OwnerSeat[];
  cubicles: Cubicle[];
  failNext?: () => Response;
}

/** In-memory fake of the owner seats API, so tests assert what the user sees after a round trip. */
function fakeApi(db: Db) {
  const seatCount = (c: Cubicle) => db.seats.filter((s) => s.cubicle?.id === c.id).length;
  const fail = () => {
    const f = db.failNext;
    db.failNext = undefined;
    return f?.();
  };
  server.use(
    http.get(BASE, () => HttpResponse.json({ id: 's1', timeZone: 'Europe/London' })),
    http.get(`${BASE}/occupancy`, () => HttpResponse.json({ items: [] })),
    http.get(`${BASE}/seats`, () => HttpResponse.json({ items: db.seats })),
    http.get(`${BASE}/cubicles`, () =>
      HttpResponse.json({ items: db.cubicles.map((c) => ({ ...c, seatCount: seatCount(c) })) }),
    ),
    http.post(`${BASE}/seats`, async ({ request }) => {
      const failed = fail();
      if (failed) return failed;
      const body = (await request.json()) as {
        seats?: { label: string }[];
        pattern?: { prefix: string; from: number; to: number; padTo?: number };
      };
      const created: OwnerSeat[] = [];
      if (body.seats) for (const s of body.seats) created.push(seat(s.label));
      if (body.pattern) {
        const p = body.pattern;
        for (let n = p.from; n <= p.to; n++) {
          created.push(seat(`${p.prefix}${String(n).padStart(p.padTo ?? 0, '0')}`));
        }
      }
      db.seats.push(...created);
      return HttpResponse.json({ items: created }, { status: 201 });
    }),
    http.patch(`${BASE}/seats/:id`, async ({ request, params }) => {
      const failed = fail();
      if (failed) return failed;
      const body = (await request.json()) as { label?: string; cubicleId?: string | null };
      db.seats = db.seats.map((s) => {
        if (s.id !== params.id) return s;
        const c = db.cubicles.find((x) => x.id === body.cubicleId) ?? null;
        return { ...s, label: body.label ?? s.label, cubicle: c && { id: c.id, name: c.name } };
      });
      return HttpResponse.json(db.seats.find((s) => s.id === params.id));
    }),
    http.delete(`${BASE}/seats/:id`, ({ params }) => {
      const failed = fail();
      if (failed) return failed;
      db.seats = db.seats.filter((s) => s.id !== params.id);
      return new HttpResponse(null, { status: 204 });
    }),
    http.post(`${BASE}/cubicles`, async ({ request }) => {
      const failed = fail();
      if (failed) return failed;
      const { name } = (await request.json()) as { name: string };
      const c = { id: `c-${name}`, name, seatCount: 0 };
      db.cubicles.push(c);
      return HttpResponse.json(c, { status: 201 });
    }),
    http.delete(`${BASE}/cubicles/:id`, ({ params }) => {
      const failed = fail();
      if (failed) return failed;
      db.cubicles = db.cubicles.filter((c) => c.id !== params.id);
      db.seats = db.seats.filter((s) => s.cubicle?.id !== params.id);
      return new HttpResponse(null, { status: 204 });
    }),
  );
}

const bay = { id: 'c1', name: 'Bay 1', seatCount: 0 };
const setup = (db: Partial<Db> = {}) => {
  const full: Db = { seats: [], cubicles: [], ...db };
  fakeApi(full);
  renderWithQuery(<SeatManager spaceId="s1" />);
  return full;
};
const list = () => screen.findByRole('list', { name: 'Seats' });

beforeEach(() => {
  vi.mocked(toast.success).mockClear();
});

describe('SeatManager states', () => {
  it('loading: skeleton lists with polite status', () => {
    setup();
    expect(screen.getByText('Loading seats…')).toBeInTheDocument();
    expect(screen.getAllByText('Loading cubicles…').length).toBeGreaterThan(0);
    expect(screen.getByRole('heading', { name: 'Seats' })).toBeInTheDocument();
  });

  it('empty: seats and cubicles invite adding, forms stay visible', async () => {
    setup();
    expect(await screen.findByText('No seats yet.')).toBeInTheDocument();
    expect(screen.getByText('No seats yet')).toBeInTheDocument();
    expect(screen.getByText(/No cubicles yet/)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Add seat' })).toBeInTheDocument();
  });

  it('error: both lists offer retry and the forms stay usable', async () => {
    server.use(
      http.get(BASE, () => HttpResponse.json({ id: 's1', timeZone: 'Europe/London' })),
      http.get(`${BASE}/occupancy`, () => HttpResponse.json({ items: [] })),
      http.get(`${BASE}/seats`, () => HttpResponse.json({ status: 500 }, { status: 500 })),
      http.get(`${BASE}/cubicles`, () => HttpResponse.json({ status: 500 }, { status: 500 })),
    );
    renderWithQuery(<SeatManager spaceId="s1" />);
    expect(await screen.findByText("We couldn't load your seats")).toBeInTheDocument();
    expect(screen.getByText("We couldn't load your cubicles")).toBeInTheDocument();
    expect(screen.getByLabelText('Label')).toBeEnabled();
  });

  it('success: count, cubicle and features per row', async () => {
    setup({
      seats: [seat('A-1', bay, ['monitor arm', 'standing desk']), seat('A-2')],
      cubicles: [bay],
    });
    const rows = within(await list()).getAllByRole('listitem');
    expect(rows).toHaveLength(2);
    expect(rows[0]).toHaveTextContent('Bay 1, monitor arm, standing desk');
    expect(rows[1]).toHaveTextContent('No cubicle');
    expect(screen.getByText('2 seats')).toBeInTheDocument();
  });

  it('at the limit the count line says so', async () => {
    setup({ seats: Array.from({ length: 200 }, (_, i) => seat(`S-${i}`)) });
    expect(
      await screen.findByText("200 seats. You've reached the limit of 200."),
    ).toBeInTheDocument();
  });
});

describe('bulk add', () => {
  it('preview names first and last label and the button confirms the count', async () => {
    setup();
    await screen.findByText('No seats yet.');
    await userEvent.type(screen.getByLabelText('Label prefix'), 'A-');
    await userEvent.type(screen.getByLabelText('From number'), '1');
    await userEvent.type(screen.getByLabelText('To number'), '20');
    expect(await screen.findByText('Adds 20 seats: A-1 to A-20.')).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'Add 20 seats' }));
    expect(
      await within(await screen.findByRole('list', { name: 'Seats' })).findAllByRole('listitem'),
    ).toHaveLength(20);
    expect(toast.success).toHaveBeenCalledWith('20 seats added', { description: 'A-1 to A-20' });
    expect(screen.getByLabelText('Label prefix')).toHaveValue('');
  });

  it('shows field errors tied by aria-describedby and sends nothing', async () => {
    setup();
    await screen.findByText('No seats yet.');
    await userEvent.type(screen.getByLabelText('From number'), '5');
    await userEvent.type(screen.getByLabelText('To number'), '2');
    await userEvent.click(screen.getByRole('button', { name: 'Add seats' }));
    const to = screen.getByLabelText('To number');
    expect(to).toHaveAccessibleDescription(/Enter a number that is 5 or higher/);
    expect(to).toBeInvalid();
  });

  it('label-taken lists the clashing labels in an alert and adds nothing', async () => {
    const db = setup();
    db.failNext = () => problem(409, 'label-taken', { labels: ['A-1', 'A-2'] });
    await screen.findByText('No seats yet.');
    await userEvent.type(screen.getByLabelText('Label prefix'), 'A-');
    await userEvent.type(screen.getByLabelText('From number'), '1');
    await userEvent.type(screen.getByLabelText('To number'), '3');
    await userEvent.click(screen.getByRole('button', { name: 'Add 3 seats' }));
    const alert = await screen.findByRole('alert');
    expect(alert).toHaveTextContent('Some labels are already used');
    expect(alert).toHaveTextContent('A-1, A-2 already exist in this space. No seats were added.');
    expect(db.seats).toHaveLength(0);
  });

  it('seat-limit shows the limit copy', async () => {
    const db = setup();
    db.failNext = () => problem(422, 'seat-limit');
    await screen.findByText('No seats yet.');
    await userEvent.type(screen.getByLabelText('From number'), '1');
    await userEvent.type(screen.getByLabelText('To number'), '2');
    await userEvent.click(screen.getByRole('button', { name: 'Add 2 seats' }));
    expect(await screen.findByText('Seat limit reached')).toBeInTheDocument();
  });
});

describe('add one seat', () => {
  it('adds, clears the label and keeps focus on it', async () => {
    setup();
    await screen.findByText('No seats yet.');
    const label = screen.getByLabelText('Label');
    await userEvent.type(label, 'B-7');
    await userEvent.click(screen.getByRole('button', { name: 'Add seat' }));
    expect(await within(await list()).findByText('B-7')).toBeInTheDocument();
    expect(toast.success).toHaveBeenCalledWith('Seat B-7 added');
    await waitFor(() => {
      expect(label).toHaveValue('');
      expect(label).toHaveFocus();
    });
  });

  it('label-taken is a field error on Label and keeps the text', async () => {
    const db = setup({ seats: [seat('B-7')] });
    await list();
    db.failNext = () => problem(409, 'label-taken', { labels: ['B-7'] });
    await userEvent.type(screen.getByLabelText('Label'), 'B-7');
    await userEvent.click(screen.getByRole('button', { name: 'Add seat' }));
    await waitFor(() => {
      expect(screen.getByLabelText('Label')).toHaveAccessibleDescription(/B-7 is already used/);
    });
    expect(screen.getByLabelText('Label')).toHaveValue('B-7');
  });

  it('requires a label', async () => {
    setup();
    await screen.findByText('No seats yet.');
    await userEvent.click(screen.getByRole('button', { name: 'Add seat' }));
    expect(screen.getByText('Enter a label')).toBeInTheDocument();
  });
});

describe('edit and remove a seat', () => {
  it('rename and assign a cubicle updates the list', async () => {
    setup({ seats: [seat('A-1')], cubicles: [bay] });
    await userEvent.click(await screen.findByRole('button', { name: 'Edit seat A-1' }));
    const form = screen.getByRole('form', { name: 'Edit seat A-1' });
    const label = within(form).getByLabelText('Label');
    expect(label).toHaveFocus();
    await userEvent.clear(label);
    await userEvent.type(label, 'A-9');
    await userEvent.selectOptions(within(form).getByLabelText('Cubicle (optional)'), 'Bay 1');
    await userEvent.click(within(form).getByRole('button', { name: 'Save' }));
    const row = await within(await list()).findByText('A-9');
    expect(row.closest('li')).toHaveTextContent('Bay 1');
    expect(toast.success).toHaveBeenCalledWith('Seat A-9 saved');
  });

  it('cancel returns focus to Edit', async () => {
    setup({ seats: [seat('A-1')] });
    await userEvent.click(await screen.findByRole('button', { name: 'Edit seat A-1' }));
    await userEvent.click(screen.getByRole('button', { name: 'Cancel' }));
    await waitFor(() => {
      expect(screen.getByRole('button', { name: 'Edit seat A-1' })).toHaveFocus();
    });
  });

  it('remove confirmed: the seat goes and focus moves to the next row', async () => {
    setup({ seats: [seat('A-1'), seat('A-2')] });
    await userEvent.click(await screen.findByRole('button', { name: 'Remove seat A-1' }));
    expect(screen.getByRole('alertdialog')).toHaveTextContent('Remove seat A-1?');
    await userEvent.click(screen.getByRole('button', { name: 'Remove seat' }));
    await waitFor(() => {
      expect(screen.queryByText('A-1')).not.toBeInTheDocument();
    });
    await waitFor(() => {
      expect(screen.getByRole('button', { name: 'Edit seat A-2' })).toHaveFocus();
    });
  });

  it('remove refused for future bookings: alert, dialog closed, seat stays', async () => {
    const db = setup({ seats: [seat('A-1')] });
    db.failNext = () => problem(409, 'seat-has-future-bookings');
    await userEvent.click(await screen.findByRole('button', { name: 'Remove seat A-1' }));
    await userEvent.click(screen.getByRole('button', { name: 'Remove seat' }));
    const alert = await screen.findByRole('alert');
    expect(alert).toHaveTextContent('Seat has upcoming bookings');
    expect(alert).toHaveTextContent("A-1 can't be removed until its bookings end");
    expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument();
    expect(screen.getByText('A-1')).toBeInTheDocument();
  });

  it('keep seat closes the dialog without a request', async () => {
    const db = setup({ seats: [seat('A-1')] });
    await userEvent.click(await screen.findByRole('button', { name: 'Remove seat A-1' }));
    await userEvent.click(screen.getByRole('button', { name: 'Keep seat' }));
    expect(db.seats).toHaveLength(1);
    expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument();
  });
});

describe('cubicles', () => {
  it('adds a cubicle and lists it with a seat count', async () => {
    setup();
    await screen.findByText(/No cubicles yet/);
    await userEvent.type(screen.getByLabelText('Cubicle name'), 'Bay 2');
    await userEvent.click(screen.getByRole('button', { name: 'Add cubicle' }));
    const item = await within(await screen.findByRole('list', { name: 'Cubicles' })).findByText(
      'Bay 2',
    );
    expect(item.closest('li')).toHaveTextContent('No seats yet');
  });

  it('name taken is a field error', async () => {
    const db = setup({ cubicles: [bay] });
    await screen.findByRole('list', { name: 'Cubicles' });
    db.failNext = () => problem(409, 'cubicle-name-taken');
    await userEvent.type(screen.getByLabelText('Cubicle name'), 'Bay 1');
    await userEvent.click(screen.getByRole('button', { name: 'Add cubicle' }));
    await waitFor(() => {
      expect(screen.getByLabelText('Cubicle name')).toHaveAccessibleDescription(
        /Another cubicle already has that name/,
      );
    });
  });

  it('remove names the seats it takes along and updates both lists', async () => {
    setup({ seats: [seat('A-1', bay), seat('A-2')], cubicles: [bay] });
    await userEvent.click(await screen.findByRole('button', { name: 'Remove cubicle Bay 1' }));
    expect(screen.getByRole('alertdialog')).toHaveTextContent('its 1 seat together');
    await userEvent.click(screen.getByRole('button', { name: 'Remove cubicle' }));
    await waitFor(() => {
      expect(screen.queryByText('A-1')).not.toBeInTheDocument();
    });
    expect(screen.getByText(/No cubicles yet/)).toBeInTheDocument();
    expect(screen.getByText('A-2')).toBeInTheDocument();
  });

  it('remove refused for future bookings shows the page alert', async () => {
    const db = setup({ seats: [seat('A-1', bay)], cubicles: [bay] });
    db.failNext = () => problem(409, 'seat-has-future-bookings');
    await userEvent.click(await screen.findByRole('button', { name: 'Remove cubicle Bay 1' }));
    await userEvent.click(screen.getByRole('button', { name: 'Remove cubicle' }));
    expect(await screen.findByRole('alert')).toHaveTextContent(
      'A seat in this cubicle has upcoming bookings',
    );
  });
});
