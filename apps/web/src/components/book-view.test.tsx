import {
  getSpacesAvailabilityMockHandler,
  getSpacesListMockHandler,
} from '@bseat/api-client/mocks';
import { screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { http } from 'msw';
import { describe, expect, it, vi } from 'vitest';

import { server } from '@/test/msw';
import { londonAvailability, problemResponse, twoSpaces } from '@/test/fixtures';
import { renderWithQuery } from '@/test/render';

import { BookView } from './book-view';

describe('BookView', () => {
  it('loads spaces, then seats for the chosen window', async () => {
    const user = userEvent.setup();
    const seen = vi.fn();
    server.use(
      getSpacesListMockHandler(twoSpaces),
      getSpacesAvailabilityMockHandler((info) => {
        seen(new URL(info.request.url).search);
        return londonAvailability;
      }),
    );
    renderWithQuery(<BookView />);

    await user.click(await screen.findByRole('radio', { name: 'London HQ' }));
    await user.click(screen.getByRole('button', { name: 'Show seats' }));

    expect(await screen.findByText('5 of 6 seats free.')).toBeInTheDocument();
    expect(screen.getAllByRole('radio', { name: /^A-0\d (Free|Taken)$/ })).toHaveLength(6);
    expect(seen).toHaveBeenCalledOnce();
    expect(seen.mock.calls[0]?.[0]).toMatch(/startTime=09%3A00&endTime=17%3A00|startTime=09:00/);
    expect(screen.getByRole('button', { name: 'Show seats' })).toBeEnabled();
  });

  it('marks the seats stale after the form changes, and refetches on the same window', async () => {
    const user = userEvent.setup();
    const seen = vi.fn();
    server.use(
      getSpacesListMockHandler(twoSpaces),
      getSpacesAvailabilityMockHandler(() => {
        seen();
        return londonAvailability;
      }),
    );
    renderWithQuery(<BookView />);

    await user.click(await screen.findByRole('radio', { name: 'London HQ' }));
    await user.click(screen.getByRole('button', { name: 'Show seats' }));
    await screen.findByText('5 of 6 seats free.');

    await user.selectOptions(screen.getByLabelText('End time'), '12:00');
    expect(screen.getByText(/You changed the details/)).toBeInTheDocument();

    await user.selectOptions(screen.getByLabelText('End time'), '17:00');
    expect(screen.queryByText(/You changed the details/)).not.toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'Show seats' }));
    await vi.waitFor(() => {
      expect(seen).toHaveBeenCalledTimes(2);
    });
  });

  it('shows an error when the seats cannot be loaded', async () => {
    const user = userEvent.setup();
    server.use(
      getSpacesListMockHandler(twoSpaces),
      http.get('*/api/spaces/:spaceId/availability', () =>
        problemResponse(422, 'booking-rule:invalid-local-time'),
      ),
    );
    renderWithQuery(<BookView />);

    await user.click(await screen.findByRole('radio', { name: 'London HQ' }));
    await user.click(screen.getByRole('button', { name: 'Show seats' }));

    expect(await screen.findByRole('alert')).toHaveTextContent("We couldn't load seats");
  });

  it('sends no availability request when validation fails', async () => {
    const user = userEvent.setup();
    const seen = vi.fn();
    server.use(
      getSpacesListMockHandler(twoSpaces),
      getSpacesAvailabilityMockHandler(() => {
        seen();
        return londonAvailability;
      }),
    );
    renderWithQuery(<BookView />);

    await user.click(await screen.findByRole('radio', { name: 'London HQ' }));
    await user.selectOptions(screen.getByLabelText('End time'), '08:00');
    await user.click(screen.getByRole('button', { name: 'Show seats' }));

    expect(await screen.findByText('End time must be after start time')).toBeInTheDocument();
    expect(seen).not.toHaveBeenCalled();
  });
});
