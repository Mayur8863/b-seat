import { getListingsLocationsMockHandler } from '@bseat/api-client/mocks';
import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { http, HttpResponse } from 'msw';
import { useState } from 'react';
import { describe, expect, it, vi } from 'vitest';

import { server } from '@/test/msw';
import { renderWithQuery } from '@/test/render';

import { LocationCombobox } from './location-combobox';

function Harness({
  field = 'city',
  city = '',
  onEnter = () => undefined,
}: {
  field?: 'city' | 'area';
  city?: string;
  onEnter?: () => void;
}) {
  const [value, setValue] = useState('');
  return (
    <LocationCombobox
      field={field}
      label={field === 'city' ? 'City (optional)' : 'Area (optional)'}
      country="IN"
      city={city}
      value={value}
      onChange={setValue}
      onEnter={onEnter}
      debounceMs={0}
    />
  );
}

const pune = {
  items: [
    { value: 'Pune', count: 3 },
    { value: 'Punjab', count: 1 },
  ],
};

describe('LocationCombobox', () => {
  it('suggests after typing and picks with the keyboard without submitting', async () => {
    const user = userEvent.setup();
    const onEnter = vi.fn();
    const seen = vi.fn();
    server.use(
      getListingsLocationsMockHandler((info) => {
        seen(new URL(info.request.url).searchParams.toString());
        return pune;
      }),
    );
    renderWithQuery(<Harness onEnter={onEnter} />);
    const input = screen.getByRole('combobox', { name: 'City (optional)' });
    await user.type(input, 'pu');

    expect(await screen.findByRole('option', { name: /Pune/ })).toBeInTheDocument();
    expect(screen.getByRole('option', { name: /Pune/ })).toHaveTextContent('3 spaces');
    expect(screen.getByRole('option', { name: /Punjab/ })).toHaveTextContent('1 space');
    expect(
      await screen.findByText('2 suggestions available. Use the up and down keys.'),
    ).toBeInTheDocument();
    expect(seen).toHaveBeenLastCalledWith('country=IN&field=city&q=pu');

    await user.keyboard('{ArrowDown}{ArrowDown}');
    expect(input).toHaveAttribute(
      'aria-activedescendant',
      screen.getByRole('option', { name: /Punjab/ }).id,
    );
    await user.keyboard('{ArrowDown}');
    expect(input).toHaveAttribute(
      'aria-activedescendant',
      screen.getByRole('option', { name: /Pune/ }).id,
    );
    await user.keyboard('{Enter}');

    expect(input).toHaveValue('Pune');
    expect(screen.queryByRole('listbox')).not.toBeInTheDocument();
    expect(input).toHaveFocus();
    expect(onEnter).not.toHaveBeenCalled();
  });

  it('picks with the pointer', async () => {
    const user = userEvent.setup();
    server.use(getListingsLocationsMockHandler(pune));
    renderWithQuery(<Harness />);
    const input = screen.getByRole('combobox');
    await user.type(input, 'pu');
    await user.click(await screen.findByRole('option', { name: /Punjab/ }));
    expect(input).toHaveValue('Punjab');
  });

  it('Enter without an active option submits; Escape closes and keeps the text', async () => {
    const user = userEvent.setup();
    const onEnter = vi.fn();
    server.use(getListingsLocationsMockHandler(pune));
    renderWithQuery(<Harness onEnter={onEnter} />);
    const input = screen.getByRole('combobox');
    await user.type(input, 'pu');
    await screen.findByRole('listbox');
    await user.keyboard('{Escape}');
    expect(screen.queryByRole('listbox')).not.toBeInTheDocument();
    expect(input).toHaveValue('pu');
    await user.keyboard('{Enter}');
    expect(onEnter).toHaveBeenCalledOnce();
  });

  it('stays plain text when the request fails, and area needs a city', async () => {
    const user = userEvent.setup();
    const seen = vi.fn();
    server.use(
      http.get('*/api/listings/locations', () => {
        seen();
        return HttpResponse.json({}, { status: 500 });
      }),
    );
    const { unmount } = renderWithQuery(<Harness />);
    await user.type(screen.getByRole('combobox'), 'pu');
    await waitFor(() => {
      expect(seen).toHaveBeenCalled();
    });
    expect(screen.queryByRole('listbox')).not.toBeInTheDocument();
    expect(screen.getByRole('combobox')).toHaveValue('pu');
    unmount();

    seen.mockClear();
    renderWithQuery(<Harness field="area" />);
    await user.type(screen.getByRole('combobox'), 'ba');
    await new Promise((r) => setTimeout(r, 30));
    expect(seen).not.toHaveBeenCalled();
  });
});
