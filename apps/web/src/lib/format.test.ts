import { describe, expect, it } from 'vitest';

import { formatMoney, savingText, slotTitle, utilityLabel } from './format';

describe('utilityLabel', () => {
  it('uses the standard label for a known code', () => {
    expect(utilityLabel('wifi')).toBe('Wi-Fi');
    expect(utilityLabel('security_24h')).toBe('24-hour security');
  });

  it('falls back to the code in sentence case', () => {
    expect(utilityLabel('standing_desks')).toBe('Standing desks');
  });
});

describe('listing formats', () => {
  it('formats money without rounding', () => {
    expect(formatMoney({ amount: '500.00', currency: 'INR' })).toBe('₹500.00');
    expect(formatMoney({ amount: '1500.00', currency: 'JPY' })).toBe('¥1,500');
    expect(formatMoney({ amount: '1500.50', currency: 'JPY' })).toBe('¥1,500.50');
  });
  it('titles slots with their times', () => {
    expect(
      slotTitle({ slot: 'night', startTime: '19:00', endTime: '07:00', endsNextDay: true }),
    ).toBe('Night slot, 19:00 to 07:00 next day');
    expect(
      slotTitle({
        slot: 'working_hours',
        startTime: '09:00',
        endTime: '18:00',
        endsNextDay: false,
      }),
    ).toBe('Working hours, 09:00 to 18:00');
  });
  it('describes a saving with amount and percent', () => {
    expect(savingText({ amount: '300.00', percent: 17 }, 'INR')).toBe(
      'Save ₹300.00 (17%) compared with day and night passes',
    );
  });
});
