/**
 * テスト専用の架空データ。実在の店舗ではない。
 */
import type { DataSource, Shop, Station } from '../domain/shop';

export function makeShop(overrides: Partial<Shop> = {}): Shop {
  return {
    id: 'test-shop-a',
    name: '架空酒場テストA',
    latitude: 35.7,
    longitude: 139.7,
    address: null,
    prefecture: '東京都',
    municipality: '架空区',
    stationIds: [],
    categories: ['yakitori'],
    drinkTags: ['ホッピー'],
    standingOnly: true,
    hasSeating: false,
    priceLevel: 'budget',
    priceExamples: [],
    openingHours: [],
    officialUrl: null,
    status: 'unverified',
    sourceIds: [],
    createdAt: '2026-10-01T00:00:00.000Z',
    updatedAt: '2026-10-01T00:00:00.000Z',
    lastVerifiedAt: null,
    ...overrides,
  };
}

export const testSource: DataSource = {
  id: 'test-src-1',
  type: 'manual',
  name: 'テスト用出典',
  url: 'https://example.com/test',
  accessedAt: '2026-10-01',
  notes: null,
};

export const testStation: Station = {
  id: 'test-station-1',
  name: '架空',
  latitude: 35.701,
  longitude: 139.701,
  prefecture: '東京都',
  municipality: '架空区',
  lines: ['架空線'],
};

export function makeVisit(overrides: Partial<import('../domain/visit').Visit> = {}): import('../domain/visit').Visit {
  return {
    id: 'visit-1',
    shopId: 'test-shop-a',
    visitedAt: '2026-10-20T19:30:00+09:00',
    orderedItems: ['ホッピーセット', '煮込み'],
    amountYen: 1500,
    rating: 4,
    atmosphereTags: ['一人飲み向き'],
    memo: '架空の感想',
    photoRefs: [],
    createdAt: '2026-10-20T12:00:00.000Z',
    updatedAt: '2026-10-20T12:00:00.000Z',
    shopNameAtVisit: '架空酒場テストA',
    ...overrides,
  };
}
