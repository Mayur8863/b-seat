import type { Calendar } from '@bseat/api-client';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';

import { CalendarForm } from './calendar-form';

const initial: Calendar = { startDate: '2026-01-05', endDate: null, weekdays: ['mon', 'tue'] };

function setup(extra: Partial<React.ComponentProps<typeof CalendarForm>> = {}) {
  const onSubmit = vi.fn();
  render(
    <CalendarForm
      idPrefix="t"
      initial={initial}
      submitLabel="Save calendar"
      pending={false}
      problem={null}
      onSubmit={onSubmit}
      {...extra}
    />,
  );
  return onSubmit;
}

describe('CalendarForm', () => {
  it('prefills and submits changed values with weekday names', async () => {
    const onSubmit = setup();
    const user = userEvent.setup();
    expect(screen.getByLabelText('Start date')).toHaveValue('2026-01-05');
    expect(screen.getByRole('checkbox', { name: 'Monday' })).toBeChecked();
    expect(screen.getByRole('checkbox', { name: 'Wednesday' })).not.toBeChecked();
    await user.click(screen.getByRole('checkbox', { name: 'Wednesday' }));
    await user.click(screen.getByRole('button', { name: 'Save calendar' }));
    await waitFor(() => {
      expect(onSubmit).toHaveBeenCalledWith({
        startDate: '2026-01-05',
        endDate: null,
        weekdays: ['mon', 'tue', 'wed'],
      });
    });
  });

  it('allows a start date in the past (no min)', () => {
    setup();
    expect(screen.getByLabelText('Start date')).not.toHaveAttribute('min');
  });

  it('presets set the toggles without submitting', async () => {
    const onSubmit = setup();
    const user = userEvent.setup();
    await user.click(screen.getByRole('button', { name: 'Weekends' }));
    expect(screen.getByRole('checkbox', { name: 'Saturday' })).toBeChecked();
    expect(screen.getByRole('checkbox', { name: 'Monday' })).not.toBeChecked();
    expect(onSubmit).not.toHaveBeenCalled();
  });

  it('requires a day and links the error to the group', async () => {
    const onSubmit = setup();
    const user = userEvent.setup();
    await user.click(screen.getByRole('checkbox', { name: 'Monday' }));
    await user.click(screen.getByRole('checkbox', { name: 'Tuesday' }));
    await user.click(screen.getByRole('button', { name: 'Save calendar' }));
    const error = await screen.findByText('Choose at least one day.');
    expect(
      screen.getByRole('group', { name: 'Days of the week' }).getAttribute('aria-describedby'),
    ).toContain(error.id);
    expect(onSubmit).not.toHaveBeenCalled();
  });

  it('validates the end date against the start', async () => {
    setup();
    const user = userEvent.setup();
    await user.click(screen.getByRole('radio', { name: 'On a date' }));
    await user.type(screen.getByLabelText('End date'), '2025-01-01');
    await user.click(screen.getByRole('button', { name: 'Save calendar' }));
    expect(await screen.findByText("The end date can't be before the start date.")).toBeVisible();
  });

  it('reports "unchanged" instead of submitting', async () => {
    const onUnchanged = vi.fn();
    const onSubmit = setup({ onUnchanged });
    await userEvent.setup().click(screen.getByRole('button', { name: 'Save calendar' }));
    await waitFor(() => {
      expect(onUnchanged).toHaveBeenCalled();
    });
    expect(onSubmit).not.toHaveBeenCalled();
  });

  it('shows pending and a problem alert', () => {
    setup({
      pending: true,
      problem: { title: "We couldn't save the calendar", description: ['x'] },
    });
    expect(screen.getByRole('button', { name: 'Saving…' })).toBeDisabled();
    expect(screen.getByRole('alert')).toHaveTextContent("We couldn't save the calendar");
  });
});
