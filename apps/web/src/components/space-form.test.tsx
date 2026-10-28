import type { CreateSpaceInput, OwnerSpace, Reference, UpdateSpaceInput } from '@bseat/api-client';
import {
  getOwnerSpacesCreateResponseMock,
  getOwnerSpacesUpdateResponseMock,
  getReferenceGetMockHandler,
} from '@bseat/api-client/mocks';
import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { http, HttpResponse } from 'msw';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { server } from '@/test/msw';
import { renderWithQuery } from '@/test/render';

import { SpaceForm } from './space-form';

const push = vi.hoisted(() => vi.fn());
const success = vi.hoisted(() => vi.fn());
vi.mock('next/navigation', () => ({
  useRouter: () => ({ push }),
  usePathname: () => '/owner/spaces/new',
}));
vi.mock('@bseat/ui/components/sonner', () => ({ toast: { success } }));

const reference: Reference = {
  countries: [
    { code: 'GB', name: 'United Kingdom', timeZones: ['Europe/London'] },
    { code: 'IN', name: 'India', timeZones: ['Asia/Kolkata'] },
    { code: 'US', name: 'United States', timeZones: ['America/New_York', 'America/Chicago'] },
  ],
  currencies: [
    { code: 'GBP', name: 'Pound sterling' },
    { code: 'INR', name: 'Indian rupee' },
  ],
  utilities: ['wifi', 'parking', 'printer'],
};

const stored: OwnerSpace = getOwnerSpacesUpdateResponseMock({
  id: '11111111-1111-4111-8111-111111111111',
  status: 'draft',
  name: 'Hub',
  description: 'A hub',
  country: 'IN',
  city: 'Pune',
  area: 'Baner',
  streetAddress: '1 Main Rd',
  timeZone: 'Asia/Kolkata',
  currency: 'INR',
  openingHours: { mode: 'always_open', shiftChangeAt: '07:00' },
  utilities: ['wifi'],
  customUtilities: [],
});

function useReference() {
  server.use(getReferenceGetMockHandler(reference));
}

/** Records the JSON body of POSTs and answers 201. */
function captureCreate() {
  const bodies: CreateSpaceInput[] = [];
  server.use(
    http.post('*/api/owner/spaces', async ({ request }) => {
      bodies.push((await request.json()) as CreateSpaceInput);
      return HttpResponse.json(getOwnerSpacesCreateResponseMock({ id: stored.id }), {
        status: 201,
      });
    }),
  );
  return bodies;
}

type User = ReturnType<typeof userEvent.setup>;

async function fillCreate(user: User) {
  await screen.findByRole('option', { name: 'India' });
  await user.type(screen.getByLabelText('Name'), '  Pune Hub ');
  await user.type(screen.getByLabelText('Description'), 'Quiet desks');
  await user.selectOptions(screen.getByLabelText('Country'), 'IN');
  await user.type(screen.getByLabelText('City'), 'Pune');
  await user.type(screen.getByLabelText('Area or locality'), 'Baner');
  await user.type(screen.getByLabelText('Street address'), '1 Main Rd');
  await user.selectOptions(screen.getByLabelText('Currency'), 'INR');
}

beforeEach(() => {
  push.mockClear();
  success.mockClear();
});

describe('SpaceForm (create)', () => {
  it('shows each required error tied by aria-describedby and sends no request', async () => {
    useReference();
    const bodies = captureCreate();
    const user = userEvent.setup();
    renderWithQuery(<SpaceForm mode="create" />);
    await screen.findByRole('option', { name: 'India' });

    await user.click(screen.getByRole('button', { name: 'Create space' }));

    const expectError = (label: string, text: string) => {
      const field = screen.getByLabelText(label);
      expect(field).toHaveAttribute('aria-invalid', 'true');
      expect(field).toHaveAccessibleDescription(expect.stringContaining(text));
    };
    expectError('Name', 'Enter a name');
    expectError('Description', 'Enter a description');
    expectError('Country', 'Choose a country');
    expectError('City', 'Enter a city');
    expectError('Area or locality', 'Enter an area or locality');
    expectError('Street address', 'Enter a street address');
    expectError('Time zone', 'Choose a time zone');
    expectError('Currency', 'Choose a currency');
    expect(screen.getByRole('radiogroup', { name: 'Opening hours' })).toHaveAccessibleDescription(
      'Choose when your space is open',
    );
    expect(screen.getByLabelText('Name')).toHaveFocus();
    expect(bodies).toHaveLength(0);
  });

  it('suggests the country zone, keeps it changeable and never lists non-offered zones', async () => {
    useReference();
    const user = userEvent.setup();
    renderWithQuery(<SpaceForm mode="create" />);
    await screen.findByRole('option', { name: 'India' });
    const zone = screen.getByLabelText('Time zone');
    expect(zone).toHaveAccessibleDescription(
      expect.stringContaining('Choose a country first to see suggestions.'),
    );

    await user.selectOptions(screen.getByLabelText('Country'), 'IN');
    expect(zone).toHaveValue('Asia/Kolkata');
    expect(zone).toHaveAccessibleDescription('Suggested for India: Asia/Kolkata.');

    const ids = within(zone)
      .getAllByRole('option')
      .map((o) => o.textContent);
    expect(ids).toContain('UTC');
    expect(ids).toContain('Europe/London');
    expect(ids).not.toContain('Asia/Calcutta');
    expect(ids.filter((id) => id === 'Asia/Kolkata')).toHaveLength(1);
    expect(within(zone).getByRole('group', { name: 'Suggested for India' })).toBeInTheDocument();

    await user.selectOptions(zone, 'UTC');
    await user.selectOptions(screen.getByLabelText('Country'), 'GB');
    expect(zone).toHaveValue('UTC');
  });

  it('prefills 07:00 for 24 hours and swaps time fields by option, sending only the chosen', async () => {
    useReference();
    const bodies = captureCreate();
    const user = userEvent.setup();
    renderWithQuery(<SpaceForm mode="create" />);
    expect(screen.queryByLabelText('Shift change time')).not.toBeInTheDocument();

    await user.click(screen.getByRole('radio', { name: 'Open 24 hours' }));
    expect(screen.getByLabelText('Shift change time')).toHaveValue('07:00');
    expect(screen.queryByLabelText('Opens at')).not.toBeInTheDocument();

    await user.click(screen.getByRole('radio', { name: 'Fixed working hours' }));
    expect(screen.queryByLabelText('Shift change time')).not.toBeInTheDocument();
    await user.type(screen.getByLabelText('Opens at'), '09:00');
    await user.type(screen.getByLabelText('Closes at'), '18:00');

    await fillCreate(user);
    await user.click(screen.getByRole('button', { name: 'Create space' }));
    await waitFor(() => {
      expect(bodies).toHaveLength(1);
    });
    expect(bodies[0]?.openingHours).toEqual({
      mode: 'fixed_hours',
      opensAt: '09:00',
      closesAt: '18:00',
    });
  });

  it('refuses a closing time that is not after the opening time', async () => {
    useReference();
    const bodies = captureCreate();
    const user = userEvent.setup();
    renderWithQuery(<SpaceForm mode="create" />);
    await user.click(screen.getByRole('radio', { name: 'Fixed working hours' }));
    await user.type(screen.getByLabelText('Opens at'), '18:00');
    await user.type(screen.getByLabelText('Closes at'), '18:00');
    await user.click(screen.getByRole('button', { name: 'Create space' }));

    expect(screen.getByLabelText('Closes at')).toHaveAccessibleDescription(
      expect.stringContaining('Closing time must be after the opening time'),
    );
    expect(bodies).toHaveLength(0);
  });

  it('requires a shift change time', async () => {
    useReference();
    const user = userEvent.setup();
    renderWithQuery(<SpaceForm mode="create" />);
    await user.click(screen.getByRole('radio', { name: 'Open 24 hours' }));
    const shift = screen.getByLabelText('Shift change time');
    await user.clear(shift);
    await user.click(screen.getByRole('button', { name: 'Create space' }));
    expect(shift).toHaveAccessibleDescription(expect.stringContaining('Enter a shift change time'));
  });

  it('adds up to five own utilities, refuses the sixth, and Enter does not submit', async () => {
    useReference();
    const bodies = captureCreate();
    const user = userEvent.setup();
    renderWithQuery(<SpaceForm mode="create" />);
    await screen.findByRole('option', { name: 'India' });
    await user.click(screen.getByRole('checkbox', { name: 'Wi-Fi' }));

    const own = screen.getByLabelText('Add your own utility');
    for (const name of ['Gym', 'Showers', 'Bike rack', 'Quiet room', 'Pantry']) {
      await user.type(own, `${name}{Enter}`);
    }
    expect(bodies).toHaveLength(0);
    const list = screen.getByRole('list', { name: 'Your own utilities' });
    expect(within(list).getAllByRole('listitem')).toHaveLength(5);
    expect(own).toHaveFocus();
    expect(screen.getByText('Added Pantry. 5 of 5 own utilities.')).toBeInTheDocument();

    await user.type(own, 'Sixth{Enter}');
    expect(own).toHaveAccessibleDescription(
      expect.stringContaining('You can add up to 5 of your own utilities'),
    );
    expect(within(list).getAllByRole('listitem')).toHaveLength(5);
    expect(screen.getByRole('button', { name: 'Add utility' })).toBeEnabled();

    await user.type(own, 'x');
    expect(own).not.toHaveAccessibleDescription(expect.stringContaining('up to 5'));
  });

  it('refuses empty, over-long and duplicate own utilities and can remove one', async () => {
    useReference();
    const user = userEvent.setup();
    renderWithQuery(<SpaceForm mode="create" />);
    const own = screen.getByLabelText('Add your own utility');
    const add = screen.getByRole('button', { name: 'Add utility' });

    await user.click(add);
    expect(own).toHaveAccessibleDescription(expect.stringContaining('Enter a utility name'));
    await user.type(own, 'a'.repeat(41));
    await user.click(add);
    expect(own).toHaveAccessibleDescription(expect.stringContaining('Use 40 characters or fewer'));
    await user.clear(own);
    await user.type(own, 'Gym');
    await user.click(add);
    await user.type(own, 'gym');
    await user.click(add);
    expect(own).toHaveAccessibleDescription(expect.stringContaining('You already added that'));

    await user.click(screen.getByRole('button', { name: 'Remove Gym' }));
    expect(screen.queryByRole('button', { name: 'Remove Gym' })).not.toBeInTheDocument();
    expect(own).toHaveFocus();
    expect(screen.getByText('Removed Gym.')).toBeInTheDocument();
  });

  it('creates the space with trimmed values, toasts and goes to the dashboard (until T023)', async () => {
    useReference();
    const bodies = captureCreate();
    const user = userEvent.setup();
    renderWithQuery(<SpaceForm mode="create" />);
    await fillCreate(user);
    await user.click(screen.getByRole('radio', { name: 'Open 24 hours' }));
    await user.click(screen.getByRole('checkbox', { name: 'Parking' }));
    await user.type(screen.getByLabelText('Add your own utility'), 'Gym{Enter}');
    await user.click(screen.getByRole('button', { name: 'Create space' }));

    await waitFor(() => {
      expect(push).toHaveBeenCalledWith('/dashboard');
    });
    expect(bodies[0]).toEqual({
      name: 'Pune Hub',
      description: 'Quiet desks',
      country: 'IN',
      city: 'Pune',
      area: 'Baner',
      streetAddress: '1 Main Rd',
      timeZone: 'Asia/Kolkata',
      currency: 'INR',
      openingHours: { mode: 'always_open', shiftChangeAt: '07:00' },
      utilities: ['parking'],
      customUtilities: ['Gym'],
    });
    expect(success).toHaveBeenCalledWith('Space created');
  });

  it('disables the form and shows Creating… while the request runs', async () => {
    useReference();
    let release: () => void = () => undefined;
    const gate = new Promise<void>((resolve) => {
      release = resolve;
    });
    server.use(
      http.post('*/api/owner/spaces', async () => {
        await gate;
        return HttpResponse.json(getOwnerSpacesCreateResponseMock(), { status: 201 });
      }),
    );
    const user = userEvent.setup();
    renderWithQuery(<SpaceForm mode="create" />);
    await fillCreate(user);
    await user.click(screen.getByRole('radio', { name: 'Open 24 hours' }));
    await user.click(screen.getByRole('button', { name: 'Create space' }));

    const busy = await screen.findByRole('button', { name: 'Creating…' });
    expect(busy).toHaveAttribute('aria-busy', 'true');
    expect(screen.getByLabelText('Name')).toBeDisabled();
    release();
    await waitFor(() => {
      expect(push).toHaveBeenCalled();
    });
  });

  it('maps API 400 paths to fields and shows a focused Alert for an unmapped path', async () => {
    useReference();
    server.use(
      http.post('*/api/owner/spaces', () =>
        HttpResponse.json(
          {
            type: 'urn:bseat:problem:validation',
            title: 'Bad',
            status: 400,
            detail: 'SECRET DETAIL',
            errors: [
              { path: 'timeZone', message: 'raw server text' },
              { path: 'somethingElse', message: 'x' },
            ],
          },
          { status: 400 },
        ),
      ),
    );
    const user = userEvent.setup();
    renderWithQuery(<SpaceForm mode="create" />);
    await fillCreate(user);
    await user.click(screen.getByRole('radio', { name: 'Open 24 hours' }));
    await user.click(screen.getByRole('button', { name: 'Create space' }));

    const alert = await screen.findByRole('alert');
    expect(screen.getByLabelText('Time zone')).toHaveAccessibleDescription(
      expect.stringContaining("That time zone isn't supported. Choose one from the list."),
    );
    expect(alert).toHaveTextContent('Check the details');
    await waitFor(() => expect(alert).toHaveFocus());
    expect(document.body).not.toHaveTextContent('SECRET DETAIL');
    expect(screen.getByLabelText('Name')).toHaveValue('  Pune Hub ');
    expect(push).not.toHaveBeenCalled();
  });

  it('shows the fallback Alert for a server failure and keeps the input', async () => {
    useReference();
    server.use(
      http.post('*/api/owner/spaces', () => HttpResponse.json({ nope: true }, { status: 500 })),
    );
    const user = userEvent.setup();
    renderWithQuery(<SpaceForm mode="create" />);
    await fillCreate(user);
    await user.click(screen.getByRole('radio', { name: 'Open 24 hours' }));
    await user.click(screen.getByRole('button', { name: 'Create space' }));

    const alert = await screen.findByRole('alert');
    expect(alert).toHaveTextContent("We couldn't save your space");
    expect(alert).toHaveTextContent('Something went wrong on our side. Try again in a moment.');
    expect(screen.getByLabelText('City')).toHaveValue('Pune');
  });

  it('keeps the form locked after a successful create so it cannot post twice', async () => {
    useReference();
    const bodies = captureCreate();
    const user = userEvent.setup();
    renderWithQuery(<SpaceForm mode="create" />);
    await fillCreate(user);
    await user.click(screen.getByRole('radio', { name: 'Open 24 hours' }));
    await user.click(screen.getByRole('button', { name: 'Create space' }));
    await waitFor(() => {
      expect(push).toHaveBeenCalled();
    });
    expect(screen.getByRole('button', { name: 'Create space' })).toBeDisabled();
    expect(bodies).toHaveLength(1);
  });

  it('keeps an Enter-separated description as two lines', async () => {
    useReference();
    const bodies = captureCreate();
    const user = userEvent.setup();
    renderWithQuery(<SpaceForm mode="create" />);
    await fillCreate(user);
    const description = screen.getByLabelText('Description');
    await user.clear(description);
    await user.type(description, 'a{Enter}b');
    await user.click(screen.getByRole('radio', { name: 'Open 24 hours' }));
    await user.click(screen.getByRole('button', { name: 'Create space' }));
    await waitFor(() => {
      expect(bodies[0]?.description).toBe('a\nb');
    });
  });

  it('shows a utilities server error tied to the checkboxes and focuses the first one', async () => {
    useReference();
    server.use(
      http.post('*/api/owner/spaces', () =>
        HttpResponse.json(
          {
            type: 'urn:bseat:problem:validation',
            title: 'Bad',
            status: 400,
            errors: [{ path: 'utilities.0', message: 'x' }],
          },
          { status: 400 },
        ),
      ),
    );
    const user = userEvent.setup();
    renderWithQuery(<SpaceForm mode="create" />);
    await fillCreate(user);
    await user.click(screen.getByRole('radio', { name: 'Open 24 hours' }));
    await user.click(screen.getByRole('button', { name: 'Create space' }));

    const first = (await screen.findAllByRole('checkbox'))[0];
    expect(first).toBeDefined();
    await waitFor(() => {
      expect(first).toHaveFocus();
    });
    expect(first).toHaveAccessibleDescription('Check this field and try again.');
    await user.click(first!);
    expect(screen.queryByText('Check this field and try again.')).not.toBeInTheDocument();
  });

  it('disables the three selects with "Loading…" while the reference loads', () => {
    server.use(http.get('*/api/reference', () => new Promise(() => undefined)));
    renderWithQuery(<SpaceForm mode="create" />);
    for (const label of ['Country', 'Time zone', 'Currency']) {
      const select = screen.getByLabelText(label);
      expect(select).toBeDisabled();
      expect(select).toHaveAttribute('aria-busy', 'true');
      expect(within(select).getByRole('option', { name: 'Loading…' })).toBeInTheDocument();
    }
    expect(screen.getByLabelText('Name')).toBeEnabled();
  });

  it('shows a retry when the reference fails, and recovers', async () => {
    let fail = true;
    server.use(
      http.get('*/api/reference', () =>
        fail
          ? HttpResponse.json(
              { type: 'urn:bseat:problem:http-500', title: 'x', status: 500 },
              { status: 500 },
            )
          : HttpResponse.json(reference),
      ),
    );
    const user = userEvent.setup();
    renderWithQuery(<SpaceForm mode="create" />);
    expect(await screen.findByText("We couldn't load the country list.")).toBeInTheDocument();
    for (const label of ['Country', 'Time zone', 'Currency']) {
      expect(screen.getByLabelText(label)).toBeEnabled();
    }
    fail = false;
    await user.click(screen.getByRole('button', { name: 'Try again' }));
    expect(await screen.findByRole('option', { name: 'India' })).toBeInTheDocument();
    expect(screen.queryByText("We couldn't load the country list.")).not.toBeInTheDocument();
  });
});

describe('SpaceForm (edit)', () => {
  function captureUpdate(response: OwnerSpace = stored) {
    const bodies: UpdateSpaceInput[] = [];
    server.use(
      http.patch('*/api/owner/spaces/:spaceId', async ({ request }) => {
        bodies.push((await request.json()) as UpdateSpaceInput);
        return HttpResponse.json(response);
      }),
    );
    return bodies;
  }

  it('prefills from the space and sends only the changed fields', async () => {
    useReference();
    const bodies = captureUpdate({ ...stored, name: 'Hub 2' });
    const user = userEvent.setup();
    renderWithQuery(<SpaceForm mode="edit" space={stored} />);
    await screen.findByRole('option', { name: 'India' });
    expect(screen.getByLabelText('Name')).toHaveValue('Hub');
    expect(screen.getByLabelText('Time zone')).toHaveValue('Asia/Kolkata');
    expect(screen.getByRole('checkbox', { name: 'Wi-Fi' })).toBeChecked();
    expect(screen.getByRole('radio', { name: 'Open 24 hours' })).toBeChecked();
    expect(screen.queryByRole('link', { name: 'Cancel' })).not.toBeInTheDocument();

    await user.clear(screen.getByLabelText('Name'));
    await user.type(screen.getByLabelText('Name'), 'Hub 2');
    await user.click(screen.getByRole('button', { name: 'Save details' }));

    expect(await screen.findByRole('status')).toHaveTextContent('Details saved');
    expect(bodies).toEqual([{ name: 'Hub 2' }]);
    expect(push).not.toHaveBeenCalled();
  });

  it('keeps the stored zone when the country changes and sends openingHours whole', async () => {
    useReference();
    const bodies = captureUpdate();
    const user = userEvent.setup();
    renderWithQuery(<SpaceForm mode="edit" space={stored} />);
    await screen.findByRole('option', { name: 'India' });
    await user.selectOptions(screen.getByLabelText('Country'), 'GB');
    expect(screen.getByLabelText('Time zone')).toHaveValue('Asia/Kolkata');

    await user.click(screen.getByRole('radio', { name: 'Fixed working hours' }));
    await user.type(screen.getByLabelText('Opens at'), '09:00');
    await user.type(screen.getByLabelText('Closes at'), '17:00');
    expect(screen.getByText(/Changing opening hours applies to new bookings only/)).toBeVisible();
    expect(screen.getByText(/Changing the currency doesn't convert your prices/)).toBeVisible();
    await user.click(screen.getByRole('button', { name: 'Save details' }));

    await screen.findByRole('status');
    expect(bodies).toEqual([
      { country: 'GB', openingHours: { mode: 'fixed_hours', opensAt: '09:00', closesAt: '17:00' } },
    ]);
  });

  it('shows "Details saved" without a request when nothing changed', async () => {
    useReference();
    const bodies = captureUpdate();
    const user = userEvent.setup();
    renderWithQuery(<SpaceForm mode="edit" space={stored} />);
    await screen.findByRole('option', { name: 'India' });
    await user.click(screen.getByRole('button', { name: 'Save details' }));
    expect(await screen.findByRole('status')).toHaveTextContent('Details saved');
    expect(bodies).toHaveLength(0);
  });

  it('removes the saved status when a field changes again', async () => {
    useReference();
    captureUpdate();
    const user = userEvent.setup();
    renderWithQuery(<SpaceForm mode="edit" space={stored} />);
    await screen.findByRole('option', { name: 'India' });
    await user.click(screen.getByRole('button', { name: 'Save details' }));
    await screen.findByRole('status');
    await user.type(screen.getByLabelText('City'), 'x');
    expect(screen.queryByRole('status')).not.toBeInTheDocument();
  });
});
