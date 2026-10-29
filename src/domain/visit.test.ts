import { makeVisit } from '../tests/fixtures';
import {
  fromDateTimeLocal,
  groupVisitsByMonth,
  isMarkEmpty,
  linesToList,
  sortVisitsDesc,
  toDateTimeLocal,
  toJstIso,
  toggleMark,
  validateMark,
  validateVisit,
  visitStats,
} from './visit';

describe('validateVisit', () => {
  it('妥当な記録、感想や評価なしでも可', () => {
    expect(validateVisit(makeVisit()).errors).toEqual([]);
    expect(validateVisit(makeVisit({ rating: null, amountYen: null, memo: '', orderedItems: [] })).errors).toEqual([]);
  });

  it('評価は1〜5の整数のみ', () => {
    expect(validateVisit(makeVisit({ rating: 0 })).errors.join()).toContain('評価');
    expect(validateVisit(makeVisit({ rating: 6 })).errors.join()).toContain('評価');
    expect(validateVisit(makeVisit({ rating: 3.5 })).errors.join()).toContain('評価');
  });

  it('日時・金額・型の不正を拒否する', () => {
    const { errors } = validateVisit({
      ...makeVisit(),
      visitedAt: '昨日',
      amountYen: -1,
      orderedItems: 'ビール',
      photoRefs: [1],
    });
    expect(errors).toHaveLength(4);
    expect(validateVisit(null).errors).toHaveLength(1);
    expect(validateVisit({ ...makeVisit(), memo: 'x'.repeat(5001) }).errors.join()).toContain('5000文字');
  });
});

describe('お気に入り等', () => {
  it('切り替えと検証', () => {
    const now = '2026-10-29T00:00:00.000Z';
    const m1 = toggleMark(undefined, 's1', 'favorite', now);
    expect(m1).toEqual({ shopId: 's1', favorite: true, wantToGo: false, revisit: false, updatedAt: now });
    expect(validateMark(m1).errors).toEqual([]);
    const m2 = toggleMark(m1, 's1', 'favorite', now);
    expect(isMarkEmpty(m2)).toBe(true);
    expect(validateMark({ shopId: 's1', favorite: 'yes' }).errors.length).toBeGreaterThan(0);
  });
});

describe('日時（日本時間）', () => {
  it('PCのタイムゾーンに関わらず日本時間で扱う', () => {
    expect(toJstIso(new Date('2026-10-29T15:30:00Z'))).toBe('2026-10-30T00:30:00+09:00');
    expect(fromDateTimeLocal('2026-10-30T00:30')).toBe('2026-10-30T00:30:00+09:00');
    expect(toDateTimeLocal('2026-10-29T15:30:00Z')).toBe('2026-10-30T00:30');
    expect(fromDateTimeLocal('')).toBeNull();
  });
});

describe('集計・並べ替え', () => {
  const visits = [
    makeVisit({ id: 'a', visitedAt: '2026-09-30T23:30:00+09:00', amountYen: 1000, rating: 5 }),
    makeVisit({ id: 'b', visitedAt: '2026-10-01T00:30:00+09:00', amountYen: null, rating: null, shopId: 'other' }),
    makeVisit({ id: 'c', visitedAt: '2026-10-15T19:00:00+09:00', amountYen: 2000, rating: 3 }),
  ];

  it('新しい順に並べ、日本時間の月ごとにまとめる', () => {
    expect(sortVisitsDesc(visits).map((v) => v.id)).toEqual(['c', 'b', 'a']);
    const groups = groupVisitsByMonth(visits);
    expect(groups.map((g) => g.label)).toEqual(['2026年10月', '2026年9月']);
    expect(groups[0]!.visits.map((v) => v.id)).toEqual(['c', 'b']);
  });

  it('金額・評価は記録があるものだけで集計する', () => {
    expect(visitStats(visits)).toEqual({
      visitCount: 3,
      shopCount: 2,
      totalAmountYen: 3000,
      amountRecordedCount: 2,
      averageRating: 4,
      ratedCount: 2,
    });
    expect(visitStats([]).averageRating).toBeNull();
  });

  it('改行区切りの入力を配列にする', () => {
    expect(linesToList(' ビール \n\n煮込み\r\n')).toEqual(['ビール', '煮込み']);
  });
});
