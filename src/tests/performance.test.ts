/**
 * 店舗数が増えた場合の処理時間の測定（仕様書 15章「測定せずに高速性を保証しない」）。
 * 架空の店舗を5,000件作り、主な集計処理の時間を測る。結果はコンソールに出力し、
 * 目安として極端に遅い場合だけ失敗させる（実行環境の性能に左右されるため、厳しい閾値にはしない）。
 */
import stationsJson from '../data/stations.json';
import { aggregateByMunicipality, buildDensityGrid, countShopsNearStations } from '../domain/density';
import { parseStationsJson } from '../domain/dataset';
import { EMPTY_FILTER, filterShops } from '../domain/search';
import { shopsToFeatureCollection } from '../services/map/shopLayers';
import { makeShop } from './fixtures';

const SHOP_COUNT = 5000;
const LIMIT_MS = 2000;

function syntheticShops(n: number) {
  // 決まった並びの擬似乱数（毎回同じデータにする）
  let seed = 42;
  const rand = () => {
    seed = (seed * 1103515245 + 12345) % 2 ** 31;
    return seed / 2 ** 31;
  };
  const munis = ['北区', '台東区', '新宿区', '武蔵野市', 'さいたま市大宮区', '川越市'];
  return Array.from({ length: n }, (_, i) =>
    makeShop({
      id: `perf-${i}`,
      name: `架空酒場${i}`,
      latitude: 35.55 + rand() * 0.45,
      longitude: 139.35 + rand() * 0.55,
      municipality: munis[i % munis.length]!,
      categories: [['yakitori', 'oden', 'kakuuchi', 'sake'][i % 4]!],
      priceExamples: [{ itemName: 'ビール', priceYen: 400 + (i % 5) * 100, checkedAt: '2026-10-01', sourceId: null }],
    }),
  );
}

function measure<T>(label: string, fn: () => T): number {
  const start = performance.now();
  fn();
  const ms = performance.now() - start;
  console.info(`[性能] ${label}: ${ms.toFixed(1)}ms`);
  return ms;
}

describe(`店舗 ${SHOP_COUNT} 件での処理時間`, () => {
  const shops = syntheticShops(SHOP_COUNT);
  const stations = parseStationsJson(stationsJson).items;

  it('検索・地図データ・密度・集計が目安時間内に終わる', () => {
    expect(
      measure('検索（キーワード＋ジャンル＋予算）', () =>
        filterShops(shops, {
          ...EMPTY_FILTER,
          keyword: '酒場1',
          categories: ['yakitori', 'oden'],
          budgetYen: 1000,
          budgetItemCount: 2,
        }),
      ),
    ).toBeLessThan(LIMIT_MS);
    expect(measure('地図用 GeoJSON 変換', () => shopsToFeatureCollection(shops))).toBeLessThan(LIMIT_MS);
    expect(measure('3D柱の格子集計（500m）', () => buildDensityGrid(shops, 500, []))).toBeLessThan(LIMIT_MS);
    expect(measure('市区町村別の集計', () => aggregateByMunicipality(shops))).toBeLessThan(LIMIT_MS);
    expect(
      measure(`駅周辺の集計（${stations.length}駅×500m）`, () => countShopsNearStations(stations, shops, 500)),
    ).toBeLessThan(LIMIT_MS);
  });
});
