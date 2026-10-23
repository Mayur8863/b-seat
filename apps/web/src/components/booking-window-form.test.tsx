import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';

import { LONDON_ID, PARIS_ID, twoSpaces } from '@/test/fixtures';

import { BookingWindowForm } from './booking-window-form';

describe('BookingWindowForm', () => {
  it('labels every field and describes the time zone', async () => {
    const user = userEvent.setup();
    render(<BookingWindowForm spaces={twoSpaces.items} onSubmit={vi.fn()} />);

    expect(screen.getByLabelText('Date')).toHaveAttribute('type', 'date');
    expect(screen.getByLabelText('Start time')).toHaveValue('09:00');
    expect(screen.getByLabelText('End time')).toHaveValue('17:00');
    expect(screen.getByLabelText('Start time')).toHaveAccessibleDescription(
      'Times are local to the office you choose.',
    );

    await user.click(screen.getByRole('radio', { name: 'London HQ' }));
    expect(screen.getByLabelText('Start time')).toHaveAccessibleDescription(
      'Times are local to London HQ (Europe/London).',
    );
  });

  it('shows space details on each card', () => {
    render(<BookingWindowForm spaces={twoSpaces.items} onSubmit={vi.fn()} />);
    expect(screen.getByText('London, United Kingdom')).toBeInTheDocument();
    expect(screen.getByText('Europe/London · 6 seats')).toBeInTheDocument();
    expect(screen.getByText('Europe/Paris · 1 seat')).toBeInTheDocument();
  });

  it('preselects the only space', () => {
    render(<BookingWindowForm spaces={[twoSpaces.items[1]!]} onSubmit={vi.fn()} />);
    expect(screen.getByRole('radio', { name: 'Paris Hub' })).toBeChecked();
  });

  it('requires a space and sends no request without one', async () => {
    const user = userEvent.setup();
    const onSubmit = vi.fn();
    render(<BookingWindowForm spaces={twoSpaces.items} onSubmit={onSubmit} />);

    await user.click(screen.getByRole('button', { name: 'Show seats' }));

    expect(await screen.findByText('Choose an office space')).toBeInTheDocument();
    expect(screen.getByRole('radio', { name: 'London HQ' })).toHaveFocus();
    expect(onSubmit).not.toHaveBeenCalled();
  });

  it('puts the space radios in the tab order, first in the form', async () => {
    const user = userEvent.setup();
    render(<BookingWindowForm spaces={twoSpaces.items} onSubmit={vi.fn()} />);

    await user.tab();

    expect(screen.getByRole('radio', { name: 'London HQ' })).toHaveFocus();
  });

  it('names the space group once, from its legend', () => {
    render(<BookingWindowForm spaces={twoSpaces.items} onSubmit={vi.fn()} />);
    expect(screen.getByRole('radiogroup')).toHaveAccessibleName('Office space');
    expect(screen.getByRole('radiogroup')).not.toHaveAttribute('aria-label');
  });

  it('shows the space error under the legend, above the cards', async () => {
    const user = userEvent.setup();
    render(<BookingWindowForm spaces={twoSpaces.items} onSubmit={vi.fn()} />);
    await user.click(screen.getByRole('button', { name: 'Show seats' }));

    const message = await screen.findByText('Choose an office space');
    const group = screen.getByRole('radiogroup');
    expect(message.compareDocumentPosition(group) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(group).toHaveAccessibleDescription('Choose an office space');
  });

  it('rejects an end time that is not after the start, linked by aria-describedby', async () => {
    const user = userEvent.setup();
    const onSubmit = vi.fn();
    render(<BookingWindowForm spaces={twoSpaces.items} onSubmit={onSubmit} />);

    await user.click(screen.getByRole('radio', { name: 'London HQ' }));
    await user.selectOptions(screen.getByLabelText('Start time'), '10:00');
    await user.selectOptions(screen.getByLabelText('End time'), '09:30');
    await user.click(screen.getByRole('button', { name: 'Show seats' }));

    const end = screen.getByLabelText('End time');
    const message = await screen.findByText('End time must be after start time');
    expect(end).toBeInvalid();
    expect(end.getAttribute('aria-describedby')).toContain(message.id);
    expect(end).toHaveFocus();
    expect(onSubmit).not.toHaveBeenCalled();
  });

  it('requires a date', async () => {
    const user = userEvent.setup();
    render(<BookingWindowForm spaces={[twoSpaces.items[1]!]} onSubmit={vi.fn()} />);

    await user.clear(screen.getByLabelText('Date'));
    await user.click(screen.getByRole('button', { name: 'Show seats' }));

    expect(await screen.findByText('Choose a date')).toBeInTheDocument();
  });

  it('submits the chosen window and reports changes', async () => {
    const user = userEvent.setup();
    const onSubmit = vi.fn();
    const onValuesChange = vi.fn();
    render(
      <BookingWindowForm
        spaces={twoSpaces.items}
        onSubmit={onSubmit}
        onValuesChange={onValuesChange}
      />,
    );

    await user.click(screen.getByRole('radio', { name: 'Paris Hub' }));
    await user.selectOptions(screen.getByLabelText('End time'), '12:00');
    await user.click(screen.getByRole('button', { name: 'Show seats' }));

    expect(onSubmit).toHaveBeenCalledOnce();
    expect(onSubmit.mock.calls[0]?.[0]).toMatchObject({
      spaceId: PARIS_ID,
      startTime: '09:00',
      endTime: '12:00',
    });
    expect(onSubmit.mock.calls[0]?.[0].spaceId).not.toBe(LONDON_ID);
    expect(onValuesChange).toHaveBeenLastCalledWith(
      expect.objectContaining({ spaceId: PARIS_ID, endTime: '12:00' }),
    );
  });

  it('disables the button and says so while seats load', () => {
    render(<BookingWindowForm spaces={twoSpaces.items} pending onSubmit={vi.fn()} />);
    const button = screen.getByRole('button', { name: 'Loading seats…' });
    expect(button).toBeDisabled();
    expect(button).toHaveAttribute('aria-busy', 'true');
  });
});
