import { getReferenceGetMockHandler } from '@bseat/api-client/mocks';
import { getReferenceGetQueryKey } from '@bseat/api-client';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { http, HttpResponse } from 'msw';
import { describe, expect, it, vi } from 'vitest';

import { server } from '@/test/msw';
import { renderWithQuery } from '@/test/render';

import { type PreferenceValues, PreferencesForm } from './preferences-form';

const reference = getReferenceGetMockHandler({
  countries: [
    { code: 'IN', name: 'India', timeZones: ['Asia/Kolkata'] },
    { code: 'GB', name: 'United Kingdom', timeZones: ['Europe/London'] },
  ],
  currencies: [],
  utilities: [],
});
const none: PreferenceValues = { country: null, city: null, area: null };

function setup(variant: 'signup' | 'edit', initial: PreferenceValues = none) {
  const handlers = { onSaved: vi.fn(), onFailed: vi.fn(), onDismiss: vi.fn() };
  renderWithQuery(
    <PreferencesForm
      variant={variant}
      initial={initial}
      onSaved={handlers.onSaved}
      onFailed={variant === 'signup' ? handlers.onFailed : undefined}
      onDismiss={handlers.onDismiss}
    />,
  );
  return handlers;
}

function capturePut() {
  const bodies: unknown[] = [];
  server.use(
    http.put('*/api/me/preferences', async ({ request }) => {
      bodies.push(await request.json());
      return HttpResponse.json({ country: 'IN', city: 'Pune', area: null });
    }),
  );
  return bodies;
}

describe('PreferencesForm', () => {
  it('shows a disabled loading select, then the countries', async () => {
    server.use(reference);
    setup('signup');
    const select = screen.getByLabelText('Country');
    expect(select).toBeDisabled();
    expect(screen.getByRole('option', { name: 'Loading countries…' })).toBeInTheDocument();
    await waitFor(() => {
      expect(screen.getByLabelText('Country')).toBeEnabled();
    });
    expect(screen.getByRole('option', { name: 'No preference' })).toBeInTheDocument();
    expect(screen.getByRole('option', { name: 'India' })).toBeInTheDocument();
  });

  it('shows the load error with a retry, and still saves', async () => {
    server.use(
      http.get('*/api/reference', () => HttpResponse.json({ status: 500 }, { status: 500 })),
    );
    const bodies = capturePut();
    const { onSaved } = setup('signup');
    expect(await screen.findByText(/couldn't load the country list/)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Try again' })).toBeInTheDocument();
    await userEvent.type(screen.getByLabelText('City'), 'Pune');
    await userEvent.click(screen.getByRole('button', { name: 'Save and continue' }));
    await waitFor(() => {
      expect(onSaved).toHaveBeenCalledWith('saved', expect.anything());
    });
    expect(bodies).toEqual([{ country: null, city: 'Pune', area: null }]);
  });

  it('keeps the stored country when the list failed to load, and saves it', async () => {
    server.use(
      http.get('*/api/reference', () => HttpResponse.json({ status: 500 }, { status: 500 })),
    );
    const bodies = capturePut();
    const { onSaved } = setup('edit', { country: 'IN', city: null, area: null });
    expect(await screen.findByText('Country unavailable right now.')).toBeInTheDocument();
    expect(screen.queryByLabelText('Country')).not.toBeInTheDocument();
    await userEvent.type(screen.getByLabelText('City'), 'Pune');
    await userEvent.click(screen.getByRole('button', { name: 'Save preferences' }));
    await waitFor(() => {
      expect(onSaved).toHaveBeenCalledWith('saved', expect.anything());
    });
    expect(bodies).toEqual([{ country: 'IN', city: 'Pune', area: null }]);
  });

  it('Clear all keeps the stored country when the list failed to load', async () => {
    server.use(
      http.get('*/api/reference', () => HttpResponse.json({ status: 500 }, { status: 500 })),
    );
    const bodies = capturePut();
    setup('edit', { country: 'IN', city: 'Pune', area: 'Baner' });
    await screen.findByText('Country unavailable right now.');
    await userEvent.click(screen.getByRole('button', { name: 'Clear all' }));
    expect(screen.getByLabelText('City')).toHaveValue('');
    await userEvent.click(screen.getByRole('button', { name: 'Save preferences' }));
    await waitFor(() => {
      expect(bodies).toHaveLength(1);
    });
    expect(bodies).toEqual([{ country: 'IN', city: null, area: null }]);
  });

  it('shows the stored country once the list arrives after a slow load', async () => {
    server.use(
      http.get('*/api/reference', async () => {
        await new Promise((r) => setTimeout(r, 50));
        return HttpResponse.json({
          countries: [
            { code: 'IN', name: 'India', timeZones: ['Asia/Kolkata'] },
            { code: 'GB', name: 'United Kingdom', timeZones: ['Europe/London'] },
          ],
          currencies: [],
          utilities: [],
        });
      }),
    );
    setup('edit', { country: 'IN', city: null, area: null });
    await waitFor(() => {
      expect(screen.getByLabelText('Country')).toBeEnabled();
    });
    expect(screen.getByLabelText('Country')).toHaveValue('IN');
  });

  it('edit: focuses City while the list is loading', async () => {
    server.use(reference);
    setup('edit');
    await waitFor(() => {
      expect(screen.getByLabelText('City')).toHaveFocus();
    });
    await waitFor(() => {
      expect(screen.getByLabelText('Country')).toBeEnabled();
    });
    expect(screen.getByLabelText('City')).toHaveFocus();
  });

  it('edit: focuses Country when the list is already loaded', async () => {
    server.use(reference);
    const client = new QueryClient();
    client.setQueryData(getReferenceGetQueryKey(), {
      data: {
        countries: [{ code: 'IN', name: 'India', timeZones: [] }],
        currencies: [],
        utilities: [],
      },
    });
    render(
      <QueryClientProvider client={client}>
        <PreferencesForm variant="edit" initial={none} onSaved={vi.fn()} onDismiss={vi.fn()} />
      </QueryClientProvider>,
    );
    await waitFor(() => {
      expect(screen.getByLabelText('Country')).toHaveFocus();
    });
  });

  it('edit: focuses City when the list failed to load', async () => {
    server.use(
      http.get('*/api/reference', () => HttpResponse.json({ status: 500 }, { status: 500 })),
    );
    setup('edit');
    await screen.findByText('Country unavailable right now.');
    expect(screen.getByLabelText('City')).toHaveFocus();
  });

  it('signup: saves country, city and area; blank becomes null', async () => {
    server.use(reference);
    const bodies = capturePut();
    const { onSaved } = setup('signup');
    await waitFor(() => {
      expect(screen.getByLabelText('Country')).toBeEnabled();
    });
    await userEvent.selectOptions(screen.getByLabelText('Country'), 'IN');
    await userEvent.type(screen.getByLabelText('City'), '  Pune ');
    await userEvent.click(screen.getByRole('button', { name: 'Save and continue' }));
    await waitFor(() => {
      expect(onSaved).toHaveBeenCalledWith('saved', expect.anything());
    });
    expect(bodies).toEqual([{ country: 'IN', city: 'Pune', area: null }]);
  });

  it('signup: all empty sends nothing', async () => {
    server.use(reference);
    const { onSaved } = setup('signup');
    await userEvent.click(screen.getByRole('button', { name: 'Save and continue' }));
    await waitFor(() => {
      expect(onSaved).toHaveBeenCalledWith('skipped');
    });
  });

  it('signup: a failed save calls onFailed, not an inline alert', async () => {
    server.use(
      reference,
      http.put('*/api/me/preferences', () => HttpResponse.json({ status: 500 }, { status: 500 })),
    );
    const { onFailed } = setup('signup');
    await userEvent.type(screen.getByLabelText('City'), 'Pune');
    await userEvent.click(screen.getByRole('button', { name: 'Save and continue' }));
    await waitFor(() => {
      expect(onFailed).toHaveBeenCalled();
    });
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
  });

  it('signup: Skip for now dismisses without a request', async () => {
    server.use(reference);
    const { onDismiss } = setup('signup');
    await userEvent.click(screen.getByRole('button', { name: 'Skip for now' }));
    expect(onDismiss).toHaveBeenCalled();
  });

  it('rejects a city over 100 characters with a described error', async () => {
    server.use(reference);
    setup('edit');
    const city = screen.getByLabelText('City');
    await userEvent.click(city);
    await userEvent.paste('x'.repeat(101));
    await userEvent.click(screen.getByRole('button', { name: 'Save preferences' }));
    const error = await screen.findByText('Use 100 characters or fewer');
    expect(city).toHaveAttribute('aria-describedby', error.id);
    expect(city).toHaveAttribute('aria-invalid', 'true');
  });

  it('edit: prefills, Clear all then save sends three nulls', async () => {
    server.use(reference);
    const bodies = capturePut();
    const { onSaved } = setup('edit', { country: 'IN', city: 'Pune', area: 'Baner' });
    expect(screen.getByLabelText('City')).toHaveValue('Pune');
    await userEvent.click(screen.getByRole('button', { name: 'Clear all' }));
    expect(bodies).toHaveLength(0);
    await userEvent.click(screen.getByRole('button', { name: 'Save preferences' }));
    await waitFor(() => {
      expect(onSaved).toHaveBeenCalledWith('saved', expect.anything());
    });
    expect(bodies).toEqual([{ country: null, city: null, area: null }]);
  });

  it('edit: a failed save shows a focused alert and keeps the input', async () => {
    server.use(
      reference,
      http.put('*/api/me/preferences', () => HttpResponse.json({ status: 500 }, { status: 500 })),
    );
    setup('edit', { country: null, city: 'Pune', area: null });
    await userEvent.click(screen.getByRole('button', { name: 'Save preferences' }));
    const alert = await screen.findByRole('alert');
    expect(alert).toHaveTextContent("We couldn't save your preferences");
    expect(alert).toHaveTextContent('Your previous preferences are unchanged. Try again.');
    expect(alert).toHaveFocus();
    expect(screen.getByLabelText('City')).toHaveValue('Pune');
  });

  it('edit: Cancel dismisses', async () => {
    server.use(reference);
    const { onDismiss } = setup('edit');
    await userEvent.click(screen.getByRole('button', { name: 'Cancel' }));
    expect(onDismiss).toHaveBeenCalled();
  });
});
