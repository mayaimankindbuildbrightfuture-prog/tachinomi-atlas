import { makeShop, testStation } from '../tests/fixtures';
import {
  DENSITY_STEPS,
  aggregateByMunicipality,
  buildDensityGrid,
  categoryBreakdown,
  countShopsNearStations,
  gridKeyOf,
  gridStepDegrees,
  nearestStations,
  stationLabel,
} from './density';
import { distanceMeters } from './geo';
import type { SurveyArea } from './survey';

const area = (patch: Partial<SurveyArea> = {}): SurveyArea => ({
  id: 'a1',
  name: '架空エリア',
  centerLatitude: 35.7,
  centerLongitude: 139.7,
  radiusM: 300,
  surveyedAt: '2026-10-29',
  scope: '',
  notes: '',
  createdAt: '2026-10-29T00:00:00.000Z',
  updatedAt: '2026-10-29T00:00:00.000Z',
  ...patch,
});

describe('格子集計', () => {
  it('マスの大きさは指定したメートルにおおむね一致する', () => {
    const { dLat, dLng } = gridStepDegrees(500);
    expect(distanceMeters(35.8, 139.7, 35.8 + dLat, 139.7)).toBeCloseTo(500, -1);
    expect(distanceMeters(35.8, 139.7, 35.8, 139.7 + dLng)).toBeCloseTo(500, -1);
  });

  it('同じマスの店舗を数え、店舗の無いマスは（調査済みでなければ）作らない', () => {
    const shops = [
      makeShop({ id: 'a', latitude: 35.70001, longitude: 139.70001 }),
      makeShop({ id: 'b', latitude: 35.70002, longitude: 139.70002 }),
      makeShop({ id: 'c', latitude: 35.75, longitude: 139.75 }),
    ];
    expect(gridKeyOf(35.70001, 139.70001, 500)).toBe(gridKeyOf(35.70002, 139.70002, 500));
    const fc = buildDensityGrid(shops, 500, []);
    expect(fc.features.map((f) => f.properties.count).sort()).toEqual([1, 2]);
    expect(fc.features.every((f) => !f.properties.surveyed)).toBe(true);
  });

  it('調査済みエリア内の店舗0件のマスを「調査済み・0件」として区別する', () => {
    const shops = [makeShop({ latitude: 35.7, longitude: 139.7 })];
    const fc = buildDensityGrid(shops, 250, [area({ radiusM: 600 })]);
    const zero = fc.features.filter((f) => f.properties.count === 0);
    const withShop = fc.features.filter((f) => f.properties.count > 0);
    expect(zero.length).toBeGreaterThan(5);
    expect(zero.every((f) => f.properties.surveyed)).toBe(true);
    expect(withShop).toHaveLength(1);
    expect(withShop[0]!.properties.surveyed).toBe(true);
    // 調査済みエリアの外に0件のマスは作らない
    expect(buildDensityGrid([], 250, []).features).toEqual([]);
  });

  it('柱の高さはマスの大きさに比例する', () => {
    const shops = [makeShop({ id: 'a' }), makeShop({ id: 'b' })];
    expect(buildDensityGrid(shops, 500, []).features[0]!.properties.height).toBe(300);
    expect(buildDensityGrid(shops, 1000, []).features[0]!.properties.height).toBe(600);
  });

  it('マスは閉じた四角形', () => {
    const ring = buildDensityGrid([makeShop()], 500, []).features[0]!.geometry.coordinates[0]!;
    expect(ring).toHaveLength(5);
    expect(ring[0]).toEqual(ring[4]);
  });

  it('目盛りは固定で昇順', () => {
    const mins = DENSITY_STEPS.map((s) => s.min);
    expect(mins).toEqual([...mins].sort((a, b) => a - b));
    expect(mins[0]).toBe(1);
  });
});

describe('市区町村別の集計', () => {
  it('件数・確認済み・ジャンル・予算帯を集計し、件数の多い順に並べる', () => {
    const rows = aggregateByMunicipality([
      makeShop({
        id: '1',
        municipality: '北区',
        categories: ['yakitori'],
        status: 'verified',
        sourceIds: ['s'],
        lastVerifiedAt: '2026-10-29',
      }),
      makeShop({ id: '2', municipality: '北区', categories: ['yakitori', 'oden'], priceLevel: 'standard' }),
      makeShop({ id: '3', municipality: '台東区', categories: [] }),
      makeShop({ id: '4', municipality: null, prefecture: null }),
    ]);
    expect(rows[0]).toMatchObject({ municipality: '北区', total: 2, verified: 1 });
    expect(rows[0]!.byCategory).toEqual({ yakitori: 2 });
    expect(rows[0]!.byPriceLevel).toEqual({ budget: 1, standard: 1, premium: 0, unknown: 0 });
    expect(rows.map((r) => r.municipality)).toContain('市区町村未設定');
    expect(categoryBreakdown({ oden: 1, yakitori: 3 }).map((c) => c.key)).toEqual(['yakitori', 'oden']);
  });
});

describe('駅周辺の集計', () => {
  const near = makeShop({ id: 'near', latitude: 35.7035, longitude: 139.701 }); // 約280m
  const mid = makeShop({ id: 'mid', latitude: 35.7055, longitude: 139.701 }); // 約500m
  const far = makeShop({ id: 'far', latitude: 35.75, longitude: 139.75 });

  it('駅から指定距離以内の店舗数を数え、0件の駅は除く', () => {
    const other = { ...testStation, id: 'other', name: '遠い', latitude: 36.2, longitude: 139.3 };
    expect(countShopsNearStations([testStation, other], [near, mid, far], 300)).toEqual([
      { station: testStation, count: 1, shopIds: ['near'] },
    ]);
    expect(countShopsNearStations([testStation], [near, mid, far], 800)[0]!.count).toBe(2);
  });

  it('近い駅を近い順に返す', () => {
    const second = { ...testStation, id: 's2', name: '二番目', latitude: 35.71, longitude: 139.701 };
    const result = nearestStations(near, [second, testStation]);
    expect(result.map((r) => r.station.id)).toEqual([testStation.id, 's2']);
    expect(result[0]!.distanceM).toBeCloseTo(278, -1);
    expect(nearestStations(far, [testStation], 3, 1000)).toEqual([]);
  });

  it('同名の駅を区別できるよう路線を併記する', () => {
    expect(stationLabel({ ...testStation, lines: ['A線', 'B線', 'C線'] })).toBe('架空（A線・B線 他1路線）');
    expect(stationLabel({ ...testStation, lines: [] })).toBe('架空');
  });
});
