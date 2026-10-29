import { makeShop, testSource, testStation } from '../tests/fixtures';
import { findDanglingReferences, mergeById, parseShopsJson, parseSourcesJson, parseStationsJson } from './dataset';

describe('parseShopsJson', () => {
  it('妥当な店舗のみを取り込み、不正・重複IDを報告する', () => {
    const json = {
      schemaVersion: 1,
      shops: [makeShop({ id: 'a' }), makeShop({ id: 'a', name: '重複' }), { id: 'bad', name: '' }, 'x'],
    };
    const { items, issues } = parseShopsJson(json);
    expect(items.map((s) => s.id)).toEqual(['a']);
    expect(issues.map((i) => i.id)).toEqual(['a', 'bad', null]);
  });

  it('形式・バージョンが違う場合は例外', () => {
    expect(() => parseShopsJson({ schemaVersion: 2, shops: [] })).toThrow('スキーマバージョン');
    expect(() => parseShopsJson({ schemaVersion: 1 })).toThrow('"shops"');
    expect(() => parseShopsJson(null)).toThrow();
  });

  it('同梱の初期データファイルが読み込める', async () => {
    const shops = (await import('../data/shops.json')).default;
    const sources = (await import('../data/sources.json')).default;
    const stations = (await import('../data/stations.json')).default;
    const s = parseShopsJson(shops);
    const src = parseSourcesJson(sources);
    const st = parseStationsJson(stations);
    expect(s.issues).toEqual([]);
    expect(src.issues).toEqual([]);
    expect(st.issues).toEqual([]);
    expect(findDanglingReferences(s.items, src.items, st.items)).toEqual([]);
  });
});

describe('parseSourcesJson / parseStationsJson', () => {
  it('出典と駅を検証する', () => {
    expect(parseSourcesJson({ schemaVersion: 1, sources: [testSource, { id: 'x' }] }).items).toHaveLength(1);
    expect(
      parseStationsJson({ schemaVersion: 1, stations: [testStation, { ...testStation, id: 's2', latitude: 999 }] })
        .items,
    ).toHaveLength(1);
  });
});

describe('findDanglingReferences', () => {
  it('存在しない出典・駅への参照を報告する', () => {
    const shop = makeShop({
      sourceIds: ['missing-src', testSource.id],
      stationIds: ['missing-station'],
      priceExamples: [{ itemName: 'ビール', priceYen: 500, checkedAt: '2026-10-01', sourceId: 'missing-src' }],
    });
    const issues = findDanglingReferences([shop], [testSource], [testStation]);
    expect(issues).toHaveLength(1);
    expect(issues[0]!.messages.join()).toContain('missing-src');
    expect(issues[0]!.messages.join()).toContain('missing-station');
  });
});

describe('mergeById', () => {
  it('ユーザーの版を優先し、削除済みの初期データを除外する', () => {
    const seed = [makeShop({ id: 'a', name: '初期A' }), makeShop({ id: 'b', name: '初期B' }), makeShop({ id: 'c' })];
    const user = [makeShop({ id: 'a', name: '編集済みA' }), makeShop({ id: 'u', name: '追加' })];
    const merged = mergeById(seed, user, ['b']);
    expect(merged.map((s) => [s.id, s.name])).toEqual([
      ['a', '編集済みA'],
      ['c', '架空酒場テストA'],
      ['u', '追加'],
    ]);
  });
});
