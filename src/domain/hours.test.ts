import type { OpeningHours } from './shop';
import { formatHoursEntry, openStateAt, openStateOnDay, parseMinutes, tokyoNow } from './hours';

const h = (
  dayOfWeek: number,
  opensAt: string | null,
  closesAt: string | null,
  isClosed: boolean | null,
): OpeningHours => ({
  dayOfWeek,
  opensAt,
  closesAt,
  isClosed,
});

describe('parseMinutes', () => {
  it('HH:MM を分に変換し、24時以降も扱う', () => {
    expect(parseMinutes('17:30')).toBe(1050);
    expect(parseMinutes('25:00')).toBe(1500);
    expect(parseMinutes('abc')).toBeNull();
    expect(parseMinutes(null)).toBeNull();
  });
});

describe('openStateAt', () => {
  const week: OpeningHours[] = [
    h(0, null, null, true),
    h(1, '16:00', '23:00', false),
    h(2, '16:00', '02:00', false),
    h(3, '16:00', '23:00', false),
    h(4, null, null, null),
  ];

  it('営業時間内は open', () => {
    expect(openStateAt(week, 1, 17 * 60)).toBe('open');
  });

  it('前日・当日とも分かっていれば時間外は closed', () => {
    expect(openStateAt(week, 1, 23 * 60)).toBe('closed');
    expect(openStateAt([...week, h(6, '16:00', '23:00', false)], 0, 12 * 60)).toBe('closed');
  });

  it('定休日でも、前日が未確認なら深夜帯の可能性があるため unknown', () => {
    expect(openStateAt(week, 0, 12 * 60)).toBe('unknown');
  });

  it('日付をまたぐ営業を翌日の深夜帯に反映する', () => {
    expect(openStateAt(week, 3, 60)).toBe('open');
    expect(openStateAt(week, 3, 3 * 60)).toBe('closed');
  });

  it('未確認の曜日は unknown（営業と断定しない）', () => {
    expect(openStateAt(week, 4, 18 * 60)).toBe('unknown');
    expect(openStateAt(week, 5, 18 * 60)).toBe('unknown');
    expect(openStateAt([], 1, 18 * 60)).toBe('unknown');
  });

  it('当日開店前で前日が不明なら unknown', () => {
    expect(openStateAt(week, 5, 10 * 60)).toBe('unknown');
  });

  it('25:00 表記の深夜営業', () => {
    expect(openStateAt([h(5, '18:00', '25:00', false), h(6, null, null, true)], 6, 30)).toBe('open');
  });
});

describe('openStateOnDay / format', () => {
  it('曜日単位の判定と表示', () => {
    const week = [h(1, '16:00', '23:00', false), h(0, null, null, true)];
    expect(openStateOnDay(week, 1)).toBe('open');
    expect(openStateOnDay(week, 0)).toBe('closed');
    expect(openStateOnDay(week, 2)).toBe('unknown');
    expect(formatHoursEntry(week[0])).toBe('16:00〜23:00');
    expect(formatHoursEntry(week[1])).toBe('定休日');
    expect(formatHoursEntry(undefined)).toBe('未確認');
  });
});

describe('tokyoNow', () => {
  it('PCのタイムゾーンに関わらず日本時間で判定する', () => {
    // 2026-10-29T15:30:00Z は日本時間 2026-10-30（金）0:30
    expect(tokyoNow(new Date('2026-10-29T15:30:00Z'))).toEqual({ day: 5, minutes: 30 });
  });
});
