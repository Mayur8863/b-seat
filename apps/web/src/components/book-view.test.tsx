import {
  getSpacesAvailabilityMockHandler,
  getSpacesListMockHandler,
} from '@bseat/api-client/mocks';
import { act, fireEvent, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { delay, http } from 'msw';
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
    const query = new URLSearchParams(seen.mock.calls[0]?.[0] as string);
    expect(Object.fromEntries(query)).toEqual({
      date: expect.stringMatching(/^\d{4}-\d{2}-\d{2}$/),
      startTime: '09:00',
      endTime: '17:00',
    });
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

    expect(await screen.findByRole('alert')).toHaveTextContent(
      "That time doesn't exist in Europe/London",
    );
  });

  it('keeps the generic "We couldn\'t load seats" title for other failures', async () => {
    const user = userEvent.setup();
    server.use(
      getSpacesListMockHandler(twoSpaces),
      http.get('*/api/spaces/:spaceId/availability', () => problemResponse(500, 'http-500')),
    );
    renderWithQuery(<BookView />);

    await user.click(await screen.findByRole('radio', { name: 'London HQ' }));
    await user.click(screen.getByRole('button', { name: 'Show seats' }));

    expect(await screen.findByRole('alert')).toHaveTextContent("We couldn't load seats");
  });

  it('scrolls to the seats once the submitted request succeeds', async () => {
    const user = userEvent.setup();
    server.use(
      getSpacesListMockHandler(twoSpaces),
      getSpacesAvailabilityMockHandler(londonAvailability),
    );
    vi.mocked(Element.prototype.scrollIntoView).mockClear();
    renderWithQuery(<BookView />);

    await user.click(await screen.findByRole('radio', { name: 'London HQ' }));
    await user.click(screen.getByRole('button', { name: 'Show seats' }));
    await screen.findByText('5 of 6 seats free.');

    await vi.waitFor(() => {
      expect(Element.prototype.scrollIntoView).toHaveBeenCalledTimes(1);
    });
  });

  it('does not show the busy state for a background refetch', async () => {
    const user = userEvent.setup();
    server.use(
      getSpacesListMockHandler(twoSpaces),
      getSpacesAvailabilityMockHandler(londonAvailability),
    );
    renderWithQuery(<BookView />);
    await user.click(await screen.findByRole('radio', { name: 'London HQ' }));
    await user.click(screen.getByRole('button', { name: 'Show seats' }));
    await screen.findByText('5 of 6 seats free.');
    vi.mocked(Element.prototype.scrollIntoView).mockClear();

    const seen = vi.fn();
    server.use(
      http.get('*/api/spaces/:spaceId/availability', async () => {
        seen();
        await delay(150);
        return Response.json(londonAvailability);
      }),
    );
    await act(async () => {
      fireEvent(window, new Event('visibilitychange'));
      await delay(50);
    });
    expect(seen).toHaveBeenCalled();

    expect(screen.getByRole('button', { name: 'Show seats' })).toBeEnabled();
    expect(screen.getByRole('region', { name: 'Seats' })).not.toHaveAttribute('aria-busy');
    expect(screen.getByText('5 of 6 seats free.')).toBeInTheDocument();
    await act(async () => {
      await delay(250);
    });
    expect(Element.prototype.scrollIntoView).not.toHaveBeenCalled();
  });

  it('keeps the seats when a background refetch fails', async () => {
    const user = userEvent.setup();
    server.use(
      getSpacesListMockHandler(twoSpaces),
      getSpacesAvailabilityMockHandler(londonAvailability),
    );
    const { client } = renderWithQuery(<BookView />);
    await user.click(await screen.findByRole('radio', { name: 'London HQ' }));
    await user.click(screen.getByRole('button', { name: 'Show seats' }));
    await screen.findByText('5 of 6 seats free.');

    server.use(
      http.get('*/api/spaces/:spaceId/availability', () => problemResponse(500, 'http-500')),
    );
    await client.invalidateQueries();

    expect(await screen.findByRole('alert')).toHaveTextContent("We couldn't load seats");
    expect(screen.getAllByRole('radio', { name: /^A-0\d (Free|Taken)$/ })).toHaveLength(6);
    expect(screen.getByRole('radio', { name: 'London HQ' })).toBeChecked();
  });

  it('refetches the spaces when Try again follows a 404', async () => {
    const user = userEvent.setup();
    const spacesSeen = vi.fn();
    server.use(
      getSpacesListMockHandler(() => {
        spacesSeen();
        return twoSpaces;
      }),
      http.get('*/api/spaces/:spaceId/availability', () => problemResponse(404, 'http-404')),
    );
    renderWithQuery(<BookView />);
    await user.click(await screen.findByRole('radio', { name: 'London HQ' }));
    await user.click(screen.getByRole('button', { name: 'Show seats' }));
    const alert = await screen.findByRole('alert');
    expect(spacesSeen).toHaveBeenCalledTimes(1);

    await user.click(within(alert).getByRole('button', { name: 'Try again' }));

    await vi.waitFor(() => {
      expect(spacesSeen).toHaveBeenCalledTimes(2);
    });
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
