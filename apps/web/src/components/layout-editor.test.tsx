import type { Cubicle, OwnerLayout, OwnerSeat } from '@bseat/api-client';
import { fireEvent, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { http, HttpResponse } from 'msw';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { server } from '@/test/msw';
import { renderWithQuery } from '@/test/render';

import { LayoutEditor } from './layout-editor';

vi.mock('@bseat/ui/components/sonner', () => ({ toast: { success: vi.fn(), error: vi.fn() } }));
vi.mock('next/navigation', () => ({ useRouter: () => ({ push: vi.fn() }) }));

const BASE = '*/api/owner/spaces/s1';
const SEAT_A = '11111111-1111-4111-8111-111111111111';
const SEAT_B = '22222222-2222-4222-8222-222222222222';
const CUB = '44444444-4444-4444-8444-444444444444';

const problem = (status: number, type: string) =>
  HttpResponse.json(
    { type: `urn:bseat:problem:${type}`, title: 't', status },
    { status, headers: { 'content-type': 'application/problem+json' } },
  );
const seat = (id: string, label: string): OwnerSeat => ({
  id,
  label,
  features: [],
  cubicle: null,
  calendar: 'shared',
  today: { state: 'vacant', note: null, markId: null },
});
const layoutOf = (over: Partial<OwnerLayout> = {}): OwnerLayout => ({
  columns: 40,
  rows: 30,
  version: 2,
  elements: [
    {
      id: 'e1',
      kind: 'seat',
      seatId: SEAT_A,
      cubicleId: null,
      label: 'A-1',
      x: 0,
      y: 0,
      w: 2,
      h: 2,
    },
    {
      id: 'e2',
      kind: 'area',
      seatId: null,
      cubicleId: null,
      label: 'Kitchen',
      x: 10,
      y: 0,
      w: 4,
      h: 3,
    },
  ],
  unplacedSeatIds: [SEAT_B],
  ...over,
});

interface Db {
  layout: OwnerLayout;
  seats: OwnerSeat[];
  cubicles: Cubicle[];
  saved: unknown[];
}
function api(db: Db, saveResponse?: () => Response) {
  server.use(
    http.get(`${BASE}/layout`, () => HttpResponse.json(db.layout)),
    http.get(`${BASE}/seats`, () => HttpResponse.json({ items: db.seats })),
    http.get(`${BASE}/cubicles`, () => HttpResponse.json({ items: db.cubicles })),
    http.put(`${BASE}/layout`, async ({ request }) => {
      const body = (await request.json()) as { version: number };
      db.saved.push(body);
      if (saveResponse) return saveResponse();
      db.layout = { ...db.layout, version: body.version + 1 };
      return HttpResponse.json(db.layout);
    }),
    http.post(`${BASE}/seats`, async ({ request }) => {
      const body = (await request.json()) as { seats: { label: string }[] };
      const created = body.seats.map((s) =>
        seat(`33333333-3333-4333-8333-33333333333${db.seats.length}`, s.label),
      );
      db.seats.push(...created);
      return HttpResponse.json({ items: created }, { status: 201 });
    }),
  );
}
const makeDb = (over: Partial<Db> = {}): Db => ({
  layout: layoutOf(),
  seats: [seat(SEAT_A, 'A-1'), seat(SEAT_B, 'A-2')],
  cubicles: [],
  saved: [],
  ...over,
});

const planItem = (name: RegExp) => screen.findByRole('button', { name });
const lastSave = (db: Db) =>
  db.saved[db.saved.length - 1] as { elements: Record<string, unknown>[]; version: number };

beforeEach(() => {
  vi.clearAllMocks();
});

describe('LayoutEditor states', () => {
  it('shows a loading state, then the plan', async () => {
    api(makeDb());
    renderWithQuery(<LayoutEditor spaceId="s1" />);
    expect(screen.getByRole('heading', { level: 1, name: 'Layout' })).toBeInTheDocument();
    expect(screen.getByText('Loading layout…')).toBeInTheDocument();
    expect(await planItem(/^Seat A-1, column 1, row 1, 2 by 2 squares/)).toBeInTheDocument();
    expect(
      screen.getByRole('region', { name: 'Floor plan, 40 by 30 squares' }),
    ).toBeInTheDocument();
  });

  it('shows a retryable error when the layout cannot load', async () => {
    server.use(http.get(`${BASE}/layout`, () => problem(500, 'x')));
    api(makeDb());
    server.use(http.get(`${BASE}/layout`, () => problem(500, 'x')));
    renderWithQuery(<LayoutEditor spaceId="s1" />);
    expect(await screen.findByText("We couldn't load the layout")).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Try again' })).toBeInTheDocument();
  });

  it('shows the first-use card and an empty tray message when nothing exists', async () => {
    api(makeDb({ layout: layoutOf({ version: 0, elements: [] }), seats: [] }));
    renderWithQuery(<LayoutEditor spaceId="s1" />);
    expect(await screen.findByText("You haven't drawn a plan yet.")).toBeInTheDocument();
    expect(
      await screen.findByText("You haven't added any seats yet. Add one above."),
    ).toBeInTheDocument();
  });

  it('lists the saved items, the tray and the status', async () => {
    api(makeDb());
    renderWithQuery(<LayoutEditor spaceId="s1" />);
    await planItem(/^Seat A-1/);
    expect(screen.getByRole('heading', { name: 'All items (2)' })).toBeInTheDocument();
    const tray = screen.getByRole('list', { name: 'Items not on the plan' });
    expect(within(tray).getByText('A-2')).toBeInTheDocument();
    expect(screen.getByText('1 seat not on the plan')).toBeInTheDocument();
    expect(screen.getByText('All changes saved')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Discard changes' })).not.toBeInTheDocument();
  });
});

describe('keyboard path', () => {
  it('picks up, moves, drops, announces and saves the new position', async () => {
    const db = makeDb();
    api(db);
    const user = userEvent.setup();
    renderWithQuery(<LayoutEditor spaceId="s1" />);
    const seatButton = await planItem(/^Seat A-1/);
    seatButton.focus();
    await user.keyboard(' ');
    expect(seatButton).toHaveAttribute('aria-pressed', 'true');
    expect(screen.getByText(/^Picked up seat A-1 at column 1, row 1/)).toBeInTheDocument();
    await user.keyboard('{ArrowRight}');
    expect(screen.getByText('Seat A-1 moved to column 2, row 1.')).toBeInTheDocument();
    await user.keyboard(' ');
    expect(screen.getByText('Dropped seat A-1 at column 2, row 1.')).toBeInTheDocument();
    expect(screen.getByText('Unsaved changes')).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'Save layout' }));
    await waitFor(() => {
      expect(screen.getByText('All changes saved')).toBeInTheDocument();
    });
    expect(lastSave(db)).toMatchObject({ version: 2, columns: 40, rows: 30 });
    expect(lastSave(db).elements[0]).toEqual({
      kind: 'seat',
      seatId: SEAT_A,
      x: 1,
      y: 0,
      w: 2,
      h: 2,
    });
  });

  it('resizes with Shift and arrows and cancels with Escape', async () => {
    api(makeDb());
    const user = userEvent.setup();
    renderWithQuery(<LayoutEditor spaceId="s1" />);
    const seatButton = await planItem(/^Seat A-1/);
    seatButton.focus();
    await user.keyboard(' {Shift>}{ArrowRight}{/Shift}');
    expect(screen.getByText('Seat A-1 is now 3 squares wide and 2 high.')).toBeInTheDocument();
    await user.keyboard('{Escape}');
    expect(
      screen.getByText('Move cancelled. Seat A-1 is back at column 1, row 1.'),
    ).toBeInTheDocument();
    expect(
      screen.getByRole('button', { name: /^Seat A-1, column 1, row 1, 2 by 2/ }),
    ).toBeInTheDocument();
    expect(screen.queryByText('Unsaved changes')).not.toBeInTheDocument();
  });

  it('travels focus with arrows and removes with Delete', async () => {
    api(makeDb());
    const user = userEvent.setup();
    renderWithQuery(<LayoutEditor spaceId="s1" />);
    const seatButton = await planItem(/^Seat A-1/);
    seatButton.focus();
    await user.keyboard('{ArrowRight}');
    expect(screen.getByRole('button', { name: /^Area Kitchen/ })).toHaveFocus();
    await user.keyboard('{Delete}');
    expect(screen.getByText('Area Kitchen deleted.')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /^Seat A-1/ })).toHaveFocus();
    await user.keyboard('{Delete}');
    expect(screen.getByRole('region', { name: /Floor plan/ })).toHaveFocus();
  });

  it('blocks a move at the edge and says so', async () => {
    api(makeDb());
    const user = userEvent.setup();
    renderWithQuery(<LayoutEditor spaceId="s1" />);
    (await planItem(/^Seat A-1/)).focus();
    await user.keyboard(' {ArrowLeft}');
    expect(
      screen.getByText("Seat A-1 can't move left. It is at the edge of the grid."),
    ).toBeInTheDocument();
  });

  it('Enter selects and focuses the Name field with the item loaded', async () => {
    api(makeDb());
    const user = userEvent.setup();
    renderWithQuery(<LayoutEditor spaceId="s1" />);
    (await planItem(/^Area Kitchen/)).focus();
    await user.keyboard('{Enter}');
    await waitFor(() => {
      expect(screen.getByLabelText('Name', { selector: '#item-name' })).toHaveFocus();
    });
    expect(screen.getByLabelText('Name', { selector: '#item-name' })).toHaveValue('Kitchen');
  });
});

describe('form path', () => {
  it('moves and resizes through the panel and renames an area', async () => {
    const db = makeDb();
    api(db);
    const user = userEvent.setup();
    renderWithQuery(<LayoutEditor spaceId="s1" />);
    await planItem(/^Area Kitchen/);
    await user.click(screen.getByRole('button', { name: 'Edit area Kitchen' }));
    const column = screen.getByLabelText('Column');
    await user.clear(column);
    await user.type(column, '12{Enter}');
    await user.clear(screen.getByLabelText('Width'));
    await user.type(screen.getByLabelText('Width'), '5{Enter}');
    const name = screen.getByLabelText('Name', { selector: '#item-name' });
    await user.clear(name);
    await user.type(name, 'Lobby{Enter}');
    expect(
      await screen.findByRole('button', { name: /^Area Lobby, column 12, row 1, 5 by 3 squares/ }),
    ).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Save layout' }));
    await waitFor(() => {
      expect(db.saved).toHaveLength(1);
    });
    expect(lastSave(db).elements).toContainEqual({
      kind: 'area',
      label: 'Lobby',
      x: 11,
      y: 0,
      w: 5,
      h: 3,
    });
  });

  it('refuses a position outside the grid with a field error', async () => {
    api(makeDb());
    const user = userEvent.setup();
    renderWithQuery(<LayoutEditor spaceId="s1" />);
    await planItem(/^Seat A-1/);
    await user.click(screen.getByRole('button', { name: 'Edit seat A-1' }));
    const column = screen.getByLabelText('Column');
    await user.clear(column);
    await user.type(column, '40{Enter}');
    expect(screen.getByText('The item must fit inside the grid')).toBeInTheDocument();
    expect(column).toHaveAttribute('aria-invalid', 'true');
    await user.clear(column);
    await user.type(column, '0{Enter}');
    expect(screen.getByText('Column must be at least 1')).toBeInTheDocument();
  });

  it('removes a seat from the plan into the tray and places it back', async () => {
    api(makeDb());
    const user = userEvent.setup();
    renderWithQuery(<LayoutEditor spaceId="s1" />);
    await planItem(/^Seat A-1/);
    await user.click(screen.getByRole('button', { name: 'Edit seat A-1' }));
    await user.click(screen.getByRole('button', { name: 'Remove from plan' }));
    expect(screen.queryByRole('button', { name: /^Seat A-1, column/ })).not.toBeInTheDocument();
    expect(screen.getByText('2 seats not on the plan')).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Place on plan seat A-1' }));
    expect(
      await screen.findByRole('button', { name: /^Seat A-1, column 1, row 1/ }),
    ).toBeInTheDocument();
    expect(
      screen.getByText('Seat A-1 placed at column 1, row 1. Press space to pick it up.'),
    ).toBeInTheDocument();
  });

  it('adds a seat through the form and places it', async () => {
    const db = makeDb();
    api(db);
    const user = userEvent.setup();
    renderWithQuery(<LayoutEditor spaceId="s1" />);
    await planItem(/^Seat A-1/);
    await user.type(screen.getByLabelText('Name', { selector: '#add-name' }), 'B-7');
    await user.click(screen.getByRole('button', { name: 'Add' }));
    expect(await screen.findByRole('button', { name: /^Seat B-7, column/ })).toBeInTheDocument();
    expect(db.seats.map((s) => s.label)).toContain('B-7');
  });

  it('adds an area in the draft only', async () => {
    const db = makeDb();
    api(db);
    const user = userEvent.setup();
    renderWithQuery(<LayoutEditor spaceId="s1" />);
    await planItem(/^Seat A-1/);
    await user.selectOptions(screen.getByLabelText('Type'), 'area');
    await user.type(screen.getByLabelText('Name', { selector: '#add-name' }), 'Lounge');
    await user.click(screen.getByRole('button', { name: 'Add' }));
    expect(await screen.findByRole('button', { name: /^Area Lounge/ })).toBeInTheDocument();
    expect(screen.getByText('Unsaved changes')).toBeInTheDocument();
  });

  it('validates the add form name', async () => {
    api(makeDb());
    const user = userEvent.setup();
    renderWithQuery(<LayoutEditor spaceId="s1" />);
    await planItem(/^Seat A-1/);
    await user.click(screen.getByRole('button', { name: 'Add' }));
    expect(screen.getByText('Enter a name')).toBeInTheDocument();
    await user.type(screen.getByLabelText('Name', { selector: '#add-name' }), 'x'.repeat(21));
    await user.click(screen.getByRole('button', { name: 'Add' }));
    expect(screen.getByText('Use 20 characters or fewer')).toBeInTheDocument();
  });

  it('changes the grid size and refuses one that would cut an item', async () => {
    api(makeDb());
    const user = userEvent.setup();
    renderWithQuery(<LayoutEditor spaceId="s1" />);
    await planItem(/^Seat A-1/);
    const columns = screen.getByLabelText('Columns');
    await user.clear(columns);
    await user.type(columns, '12{Enter}');
    expect(screen.getByText('Items extend past column 12. Move them first.')).toBeInTheDocument();
    await user.clear(columns);
    await user.type(columns, '5{Enter}');
    expect(screen.getByText('Use a number from 10 to 80.')).toBeInTheDocument();
    await user.clear(columns);
    await user.type(columns, '50{Enter}');
    expect(
      screen.getByRole('region', { name: 'Floor plan, 50 by 30 squares' }),
    ).toBeInTheDocument();
  });
});

describe('pointer path', () => {
  it('drags an item by whole squares and commits on release', async () => {
    api(makeDb());
    renderWithQuery(<LayoutEditor spaceId="s1" />);
    const seatButton = await planItem(/^Seat A-1/);
    fireEvent.pointerDown(seatButton, { clientX: 10, clientY: 10, button: 0, pointerId: 1 });
    fireEvent.pointerMove(seatButton, { clientX: 10 + 48, clientY: 10 + 24, pointerId: 1 });
    fireEvent.pointerUp(seatButton, { pointerId: 1 });
    expect(
      await screen.findByRole('button', { name: /^Seat A-1, column 3, row 2/ }),
    ).toBeInTheDocument();
    expect(screen.getByText('Dropped seat A-1 at column 3, row 2.')).toBeInTheDocument();
  });

  it('a press without movement only selects', async () => {
    api(makeDb());
    renderWithQuery(<LayoutEditor spaceId="s1" />);
    const seatButton = await planItem(/^Seat A-1/);
    fireEvent.pointerDown(seatButton, { clientX: 5, clientY: 5, button: 0, pointerId: 1 });
    fireEvent.pointerUp(seatButton, { pointerId: 1 });
    expect(seatButton).toHaveAttribute('aria-current', 'true');
    expect(screen.queryByText('Unsaved changes')).not.toBeInTheDocument();
  });

  it('resizes with the handle of the selected item', async () => {
    api(makeDb());
    renderWithQuery(<LayoutEditor spaceId="s1" />);
    const seatButton = await planItem(/^Seat A-1/);
    fireEvent.pointerDown(seatButton, { clientX: 5, clientY: 5, button: 0, pointerId: 1 });
    fireEvent.pointerUp(seatButton, { pointerId: 1 });
    const handle = seatButton.querySelector('span[aria-hidden="true"].cursor-nwse-resize');
    expect(handle).not.toBeNull();
    if (!handle) return;
    fireEvent.pointerDown(handle, { clientX: 0, clientY: 0, button: 0, pointerId: 2 });
    fireEvent.pointerMove(handle, { clientX: 24, clientY: 0, pointerId: 2 });
    fireEvent.pointerUp(handle, { pointerId: 2 });
    expect(
      await screen.findByRole('button', { name: /^Seat A-1, column 1, row 1, 3 by 2/ }),
    ).toBeInTheDocument();
  });

  it('clearing by pressing empty cells', async () => {
    api(makeDb());
    renderWithQuery(<LayoutEditor spaceId="s1" />);
    const seatButton = await planItem(/^Seat A-1/);
    fireEvent.pointerDown(seatButton, { clientX: 5, clientY: 5, button: 0, pointerId: 1 });
    fireEvent.pointerUp(seatButton, { pointerId: 1 });
    const group = screen.getByRole('group', { name: 'Floor plan items' });
    fireEvent.pointerDown(group);
    expect(seatButton).not.toHaveAttribute('aria-current');
  });
});

describe('saving', () => {
  it('refuses an empty plan on the client with the Nothing to save alert', async () => {
    const db = makeDb({ layout: layoutOf({ version: 0, elements: [] }) });
    api(db);
    const user = userEvent.setup();
    renderWithQuery(<LayoutEditor spaceId="s1" />);
    await screen.findByText("You haven't drawn a plan yet.");
    await user.click(screen.getByRole('button', { name: 'Save layout' }));
    const alert = await screen.findByRole('alert');
    expect(within(alert).getByText('Nothing to save yet')).toBeInTheDocument();
    expect(alert).toHaveFocus();
    expect(db.saved).toHaveLength(0);
  });

  it('lists a seat outside its cubicle and selects it from the alert', async () => {
    const db = makeDb({
      layout: layoutOf({
        elements: [
          {
            id: 'c',
            kind: 'cubicle',
            seatId: null,
            cubicleId: CUB,
            label: 'Pod 1',
            x: 0,
            y: 0,
            w: 4,
            h: 4,
          },
          {
            id: 'e1',
            kind: 'seat',
            seatId: SEAT_A,
            cubicleId: CUB,
            label: 'A-1',
            x: 10,
            y: 0,
            w: 2,
            h: 2,
          },
        ],
      }),
      cubicles: [{ id: CUB, name: 'Pod 1', seatCount: 1 }],
    });
    api(db);
    const user = userEvent.setup();
    renderWithQuery(<LayoutEditor spaceId="s1" />);
    expect(await planItem(/problem: outside cubicle Pod 1/)).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Save layout' }));
    const alert = await screen.findByRole('alert');
    expect(within(alert).getByText('Fix 1 item before saving')).toBeInTheDocument();
    await user.click(
      within(alert).getByRole('button', { name: 'Seat A-1 is outside cubicle Pod 1' }),
    );
    expect(screen.getByRole('button', { name: /^Seat A-1/ })).toHaveFocus();
    expect(db.saved).toHaveLength(0);
  });

  it('shows the conflict state on a stale version and reloads on request', async () => {
    const db = makeDb();
    api(db, () => problem(409, 'layout:stale-version'));
    const user = userEvent.setup();
    renderWithQuery(<LayoutEditor spaceId="s1" />);
    (await planItem(/^Seat A-1/)).focus();
    await user.keyboard(' {ArrowRight} ');
    await user.click(screen.getByRole('button', { name: 'Save layout' }));
    const alert = await screen.findByRole('alert');
    expect(within(alert).getByText('This layout changed')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /^Seat A-1, column 2/ })).toBeInTheDocument();
    db.layout = layoutOf({ version: 5 });
    await user.click(within(alert).getByRole('button', { name: 'Reload layout' }));
    expect(
      await screen.findByRole('button', { name: /^Seat A-1, column 1, row 1/ }),
    ).toBeInTheDocument();
    expect(screen.queryByText('This layout changed')).not.toBeInTheDocument();
  });

  it('shows the out-of-bounds copy on a 422', async () => {
    api(makeDb(), () => problem(422, 'layout:out-of-bounds'));
    const user = userEvent.setup();
    renderWithQuery(<LayoutEditor spaceId="s1" />);
    await planItem(/^Seat A-1/);
    await user.click(screen.getByRole('button', { name: 'Save layout' }));
    expect(await screen.findByText('Items are outside the grid')).toBeInTheDocument();
  });

  it('discards the draft after confirmation', async () => {
    api(makeDb());
    const user = userEvent.setup();
    renderWithQuery(<LayoutEditor spaceId="s1" />);
    (await planItem(/^Seat A-1/)).focus();
    await user.keyboard('{Delete}');
    await user.click(screen.getByRole('button', { name: 'Discard changes' }));
    expect(screen.getByRole('alertdialog', { name: 'Discard your changes?' })).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Keep editing' }));
    expect(screen.queryByRole('button', { name: /^Seat A-1, column/ })).not.toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Discard changes' }));
    await user.click(
      within(screen.getByRole('alertdialog')).getByRole('button', { name: 'Discard changes' }),
    );
    expect(
      await screen.findByRole('button', { name: /^Seat A-1, column 1, row 1/ }),
    ).toBeInTheDocument();
    expect(screen.getByText('Changes discarded.')).toBeInTheDocument();
  });

  it('guards in-app links while the draft is dirty', async () => {
    api(makeDb());
    const user = userEvent.setup();
    renderWithQuery(
      <>
        <a href="/dashboard">Dashboard</a>
        <LayoutEditor spaceId="s1" />
      </>,
    );
    await user.click(screen.getByRole('link', { name: 'Dashboard' }));
    expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument();
    (await planItem(/^Seat A-1/)).focus();
    await user.keyboard('{Delete}');
    await user.click(screen.getByRole('link', { name: 'Dashboard' }));
    const dialog = await screen.findByRole('alertdialog', { name: 'Leave without saving?' });
    expect(within(dialog).getByRole('button', { name: 'Keep editing' })).toBeInTheDocument();
    expect(within(dialog).getByRole('button', { name: 'Leave page' })).toBeInTheDocument();
  });

  it('switches between list and grid view on small screens', async () => {
    api(makeDb());
    const user = userEvent.setup();
    renderWithQuery(<LayoutEditor spaceId="s1" />);
    await planItem(/^Seat A-1/);
    const list = screen.getByRole('button', { name: 'List view' });
    expect(list).toHaveAttribute('aria-pressed', 'true');
    await user.click(screen.getByRole('button', { name: 'Grid view' }));
    expect(screen.getByRole('button', { name: 'Grid view' })).toHaveAttribute(
      'aria-pressed',
      'true',
    );
  });
});

describe('seat and cubicle changes that save right away', () => {
  it('assigns a cubicle through the seat endpoint', async () => {
    const db = makeDb({ cubicles: [{ id: CUB, name: 'Pod 1', seatCount: 0 }] });
    api(db);
    let patched: unknown;
    server.use(
      http.patch(`${BASE}/seats/${SEAT_A}`, async ({ request }) => {
        patched = await request.json();
        return HttpResponse.json(seat(SEAT_A, 'A-1'));
      }),
    );
    const user = userEvent.setup();
    renderWithQuery(<LayoutEditor spaceId="s1" />);
    await planItem(/^Seat A-1/);
    await user.click(screen.getByRole('button', { name: 'Edit seat A-1' }));
    await user.selectOptions(screen.getByLabelText('Cubicle'), CUB);
    await waitFor(() => {
      expect(patched).toEqual({ cubicleId: CUB });
    });
    await waitFor(() => {
      expect(screen.getByLabelText('Cubicle')).toHaveValue(CUB);
    });
    expect(screen.queryByText('Unsaved changes')).not.toBeInTheDocument();
  });

  it('deletes a seat after confirmation and drops it from the plan', async () => {
    api(makeDb());
    server.use(
      http.delete(`${BASE}/seats/${SEAT_A}`, () => new HttpResponse(null, { status: 204 })),
    );
    const user = userEvent.setup();
    renderWithQuery(<LayoutEditor spaceId="s1" />);
    await planItem(/^Seat A-1/);
    await user.click(screen.getByRole('button', { name: 'Edit seat A-1' }));
    await user.click(screen.getByRole('button', { name: 'Delete seat…' }));
    const dialog = await screen.findByRole('alertdialog', { name: 'Remove seat A-1?' });
    await user.click(within(dialog).getByRole('button', { name: 'Remove seat' }));
    await waitFor(() => {
      expect(screen.queryByRole('button', { name: /^Seat A-1, column/ })).not.toBeInTheDocument();
    });
    expect(screen.queryByText('Unsaved changes')).not.toBeInTheDocument();
  });

  it('shows the future-bookings refusal as a page alert', async () => {
    api(makeDb());
    server.use(
      http.delete(`${BASE}/seats/${SEAT_A}`, () =>
        problem(409, 'listing:seat-has-future-bookings'),
      ),
    );
    const user = userEvent.setup();
    renderWithQuery(<LayoutEditor spaceId="s1" />);
    await planItem(/^Seat A-1/);
    await user.click(screen.getByRole('button', { name: 'Edit seat A-1' }));
    await user.click(screen.getByRole('button', { name: 'Delete seat…' }));
    await user.click(
      within(await screen.findByRole('alertdialog')).getByRole('button', { name: 'Remove seat' }),
    );
    expect(await screen.findByText('Seat has upcoming bookings')).toBeInTheDocument();
  });

  it('renames a seat immediately', async () => {
    api(makeDb());
    let patched: unknown;
    server.use(
      http.patch(`${BASE}/seats/${SEAT_A}`, async ({ request }) => {
        patched = await request.json();
        return HttpResponse.json(seat(SEAT_A, 'Z-9'));
      }),
    );
    const user = userEvent.setup();
    renderWithQuery(<LayoutEditor spaceId="s1" />);
    await planItem(/^Seat A-1/);
    await user.click(screen.getByRole('button', { name: 'Edit seat A-1' }));
    const name = screen.getByLabelText('Name', { selector: '#item-name' });
    await user.clear(name);
    await user.type(name, 'Z-9');
    await user.click(screen.getByRole('button', { name: 'Rename' }));
    await waitFor(() => {
      expect(patched).toEqual({ label: 'Z-9' });
    });
  });
});
