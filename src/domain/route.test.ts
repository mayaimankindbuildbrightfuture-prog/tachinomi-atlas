import { makeShop, testStation } from '../tests/fixtures';
import {
  DEFAULT_STAY_MINUTES,
  MAX_ROUTE_SHOPS,
  addShopToRoute,
  buildLegs,
  buildSchedule,
  createRoute,
  formatClock,
  formatDistance,
  formatDuration,
  moveShopInRoute,
  removeShopFromRoute,
  routePoints,
  validateRoute,
  type PlannedRoute,
} from './route';
import type { OpeningHours } from './shop';

const NOW = '2026-10-29T00:00:00.000Z';
const open = (dayOfWeek: number, opensAt: string, closesAt: string): OpeningHours => ({
  dayOfWeek,
  opensAt,
  closesAt,
  isClosed: false,
});

// 2026-10-30 は金曜日（5）
const shopA = makeShop({
  id: 'a',
  name: 'A',
  latitude: 35.7,
  longitude: 139.7,
  openingHours: [open(5, '17:00', '23:00')],
});
const shopB = makeShop({
  id: 'b',
  name: 'B',
  latitude: 35.704,
  longitude: 139.7,
  openingHours: [open(5, '18:00', '20:00'), { dayOfWeek: 4, opensAt: null, closesAt: null, isClosed: true }],
});
const shopC = makeShop({ id: 'c', name: 'C', latitude: 35.708, longitude: 139.7, openingHours: [] });

function route(patch: Partial<PlannedRoute> = {}): PlannedRoute {
  return { ...createRoute('r1', NOW, 'テスト'), shopIds: ['a', 'b', 'c'], ...patch };
}

describe('ルートの編集', () => {
  it('追加（重複・上限は追加しない）・削除・並べ替え', () => {
    let r = createRoute('r1', NOW);
    r = addShopToRoute(r, 'a', NOW);
    r = addShopToRoute(r, 'b', NOW);
    expect(addShopToRoute(r, 'a', NOW).shopIds).toEqual(['a', 'b']);
    expect(moveShopInRoute(r, 1, -1, NOW).shopIds).toEqual(['b', 'a']);
    expect(moveShopInRoute(r, 0, -1, NOW)).toBe(r);
    r = { ...r, stayMinutes: { a: 30 }, selectedItems: { a: ['ビール'] } };
    const removed = removeShopFromRoute(r, 'a', NOW);
    expect(removed.shopIds).toEqual(['b']);
    expect(removed.stayMinutes).toEqual({});
    expect(removed.selectedItems).toEqual({});
    const full = { ...r, shopIds: Array.from({ length: MAX_ROUTE_SHOPS }, (_, i) => `s${i}`) };
    expect(addShopToRoute(full, 'x', NOW)).toBe(full);
  });

  it('検証', () => {
    expect(validateRoute(route()).errors).toEqual([]);
    const bad = validateRoute({
      ...route(),
      name: '',
      shopIds: ['a', 'a'],
      budgetYen: -1,
      startTime: '25:00',
      plannedDate: '10/30',
    });
    expect(bad.errors).toHaveLength(5);
    expect(validateRoute({ ...route(), stayMinutes: { a: -5 } }).errors.join()).toContain('滞在時間');
    expect(validateRoute(null).errors).toHaveLength(1);
  });
});

describe('区間と時間計画', () => {
  it('出発駅を先頭に、直線距離と概算時間（分速80m）を求める', () => {
    const points = routePoints(route({ startStationId: testStation.id }), [shopA, shopB, shopC], [testStation]);
    expect(points.map((p) => p.kind)).toEqual(['station', 'shop', 'shop', 'shop']);
    const legs = buildLegs(points);
    expect(legs).toHaveLength(3);
    expect(Math.round(legs[1]!.straightM)).toBe(445);
    expect(legs[1]!.estimatedMinutes).toBe(6);
  });

  it('見つからない店舗は行程から除く', () => {
    expect(routePoints(route({ shopIds: ['a', 'gone'] }), [shopA], []).map((p) => p.id)).toEqual(['a']);
  });

  it('到着・出発時刻を計算し、登録された営業時間と照合する', () => {
    const r = route({ plannedDate: '2026-10-30', startTime: '18:30', stayMinutes: { a: 60, b: 60 } });
    const points = routePoints(r, [shopA, shopB, shopC], []);
    const s = buildSchedule(r, [shopA, shopB, shopC], points, [10, 10], 'estimate')!;
    expect(s.stops.map((x) => [formatClock(x.arrivalMinutes), formatClock(x.departureMinutes), x.openCheck])).toEqual([
      ['18:30', '19:30', 'open'],
      ['19:40', '20:40', 'closed'], // 20:00 閉店
      ['20:50', '21:35', 'unknown'], // 営業時間が未登録
    ]);
    expect(formatClock(s.endMinutes)).toBe('21:35');
    expect(DEFAULT_STAY_MINUTES).toBe(45);
  });

  it('日付をまたぐ場合は翌日の曜日で照合する', () => {
    const late = makeShop({ id: 'late', openingHours: [open(6, '00:00', '05:00'), open(5, '22:00', '23:59')] });
    const r = route({ shopIds: ['late'], plannedDate: '2026-10-30', startTime: '23:50', stayMinutes: { late: 30 } });
    const s = buildSchedule(r, [late], routePoints(r, [late], []), [], 'estimate')!;
    expect(formatClock(s.stops[0]!.departureMinutes)).toBe('翌0:20');
  });

  it('予定日・開始時刻が無ければ計画しない', () => {
    const r = route();
    expect(buildSchedule(r, [shopA], routePoints(r, [shopA], []), [], 'estimate')).toBeNull();
  });

  it('表示用の書式', () => {
    expect(formatDuration(135)).toBe('2時間15分');
    expect(formatDuration(40)).toBe('40分');
    expect(formatDistance(1234)).toBe('1.2km');
    expect(formatDistance(446)).toBe('450m');
  });
});
