import type { OwnerSpacePhoto } from '@bseat/api-client';
import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { http, HttpResponse } from 'msw';
import { describe, expect, it, vi } from 'vitest';

import { server } from '@/test/msw';
import { renderWithQuery } from '@/test/render';

import { PhotoDescriptionForm } from './photo-description-form';

const photo: OwnerSpacePhoto = {
  id: 'p1',
  position: 2,
  description: null,
  altText: 'Hub photo 2',
  card: { url: 'https://img.test/1.webp', width: 640, height: 480 },
  display: { url: 'https://img.test/1d.webp', width: 1600, height: 1200 },
  createdAt: '2026-01-01T00:00:00Z',
};

function setup() {
  const onSaved = vi.fn();
  const onPageProblem = vi.fn();
  const view = renderWithQuery(
    <PhotoDescriptionForm
      spaceId="s1"
      spaceName="Hub"
      photo={photo}
      onSaved={onSaved}
      onPageProblem={onPageProblem}
    />,
  );
  return { onSaved, onPageProblem, ...view };
}

describe('PhotoDescriptionForm', () => {
  it('saves a trimmed description and shows it as saved', async () => {
    let body: unknown;
    server.use(
      http.patch('/api/owner/spaces/s1/photos/p1', async ({ request }) => {
        body = await request.json();
        return HttpResponse.json({ ...photo, description: 'A desk', altText: 'A desk' });
      }),
    );
    const user = userEvent.setup();
    const { onSaved } = setup();
    await user.type(screen.getByLabelText(/Description \(optional\)/), '  A desk  ');
    await user.click(screen.getByRole('button', { name: /Save description/ }));
    expect(await screen.findByText('Description saved')).toBeInTheDocument();
    expect(body).toEqual({ description: 'A desk' });
    expect(onSaved).toHaveBeenCalled();
  });

  it('shows the fallback in the hint and sends nothing for 151 characters', async () => {
    const sent = vi.fn();
    server.use(
      http.patch('/api/owner/spaces/s1/photos/p1', () => {
        sent();
        return HttpResponse.json(photo);
      }),
    );
    const user = userEvent.setup();
    setup();
    expect(screen.getByText(/Empty uses "Hub photo 2"/)).toBeInTheDocument();
    const field = screen.getByLabelText(/Description \(optional\)/);
    await user.click(field);
    await user.paste('x'.repeat(151));
    await user.click(screen.getByRole('button', { name: /Save description/ }));
    const error = await screen.findByText('Use 150 characters or fewer');
    expect(field).toHaveAttribute('aria-invalid', 'true');
    expect(field.getAttribute('aria-describedby')).toContain(error.id);
    expect(sent).not.toHaveBeenCalled();
  });

  it('shows a 400 as a field error and other failures as a page problem', async () => {
    server.use(
      http.patch('/api/owner/spaces/s1/photos/p1', () =>
        HttpResponse.json({ type: 'urn:bseat:problem:validation', status: 400 }, { status: 400 }),
      ),
    );
    const user = userEvent.setup();
    const { onPageProblem } = setup();
    await user.type(screen.getByLabelText(/Description \(optional\)/), 'hi');
    await user.click(screen.getByRole('button', { name: /Save description/ }));
    expect(await screen.findByText('Check the description and try again.')).toBeInTheDocument();
    server.use(
      http.patch('/api/owner/spaces/s1/photos/p1', () => HttpResponse.json({}, { status: 500 })),
    );
    await user.click(screen.getByRole('button', { name: /Save description/ }));
    await waitFor(() => {
      expect(onPageProblem).toHaveBeenCalledWith(
        expect.objectContaining({ title: "We couldn't save that description" }),
      );
    });
  });
});
