import { makeShop, testStation } from '../tests/fixtures';
import {
  EMPTY_FILTER,
  activeFilterChips,
  collectOptions,
  filterShops,
  isFilterActive,
  type ShopFilter,
} from './search';

const shops = [
  makeShop({
    id: 'a',
    name: '架空酒場あ',
    municipality: '北区',
    categories: ['yakitori', 'nikomi'],
    drinkTags: ['ホッピー'],
    priceLevel: 'budget',
    standingOnly: true,
    hasSeating: false,
    stationIds: [testStation.id],
    status: 'unverified',
    openingHours: [{ dayOfWeek: 1, opensAt: '16:00', closesAt: '22:00', isClosed: false }],
  }),
  makeShop({
    id: 'b',
    name: '架空角打ちい',
    prefecture: '埼玉県',
    municipality: 'さいたま市大宮区',
    address: '架空町1-2-3',
    categories: ['kakuuchi'],
    drinkTags: ['日本酒'],
    priceLevel: 'standard',
    standingOnly: null,
    hasSeating: true,
    status: 'possibly_closed',
  }),
];

const f = (patch: Partial<ShopFilter>): ShopFilter => ({ ...EMPTY_FILTER, ...patch });
const ids = (filter: ShopFilter) => filterShops(shops, filter).map((s) => s.id);

describe('filterShops', () => {
  it('条件なしは全件', () => {
    expect(ids(EMPTY_FILTER)).toEqual(['a', 'b']);
    expect(isFilterActive(EMPTY_FILTER)).toBe(false);
  });

  it('店名・住所のキーワード（表記ゆれ吸収）', () => {
    expect(ids(f({ keyword: '角打ち' }))).toEqual(['b']);
    expect(ids(f({ keyword: '架空町１' }))).toEqual(['b']);
  });

  it('都道府県・市区町村・駅', () => {
    expect(ids(f({ prefectures: ['埼玉県'] }))).toEqual(['b']);
    expect(ids(f({ municipality: '北区' }))).toEqual(['a']);
    expect(ids(f({ stationId: testStation.id }))).toEqual(['a']);
  });

  it('ジャンル・酒・予算帯はいずれかに一致', () => {
    expect(ids(f({ categories: ['nikomi', 'kakuuchi'] }))).toEqual(['a', 'b']);
    expect(ids(f({ drinkTags: ['日本酒'] }))).toEqual(['b']);
    expect(ids(f({ priceLevels: ['budget'] }))).toEqual(['a']);
  });

  it('立ち呑み形式は確認済みの値のみ一致', () => {
    expect(ids(f({ seating: 'standingOnly' }))).toEqual(['a']);
    expect(ids(f({ seating: 'withSeating' }))).toEqual(['b']);
  });

  it('営業日時：未確認は既定で除外し、指定時のみ含める', () => {
    expect(ids(f({ openDay: 1, openTime: '17:00' }))).toEqual(['a']);
    expect(ids(f({ openDay: 1, openTime: '23:00' }))).toEqual([]);
    expect(ids(f({ openDay: 1, openTime: '17:00', includeUnknownHours: true }))).toEqual(['a', 'b']);
    expect(ids(f({ openDay: 1 }))).toEqual(['a']);
  });

  it('確認状況', () => {
    expect(ids(f({ statuses: ['possibly_closed'] }))).toEqual(['b']);
  });

  it('複数条件の組み合わせ（AND）', () => {
    expect(ids(f({ prefectures: ['東京都'], categories: ['kakuuchi'] }))).toEqual([]);
    expect(ids(f({ prefectures: ['東京都'], categories: ['yakitori'], seating: 'standingOnly' }))).toEqual(['a']);
  });
});

describe('activeFilterChips', () => {
  it('適用中の条件を表示し、個別に解除できる', () => {
    const filter = f({
      keyword: '酒場',
      categories: ['oden'],
      stationId: testStation.id,
      openDay: 5,
      openTime: '18:00',
    });
    const chips = activeFilterChips(filter, [testStation]);
    expect(chips.map((c) => c.label)).toEqual(['「酒場」', '架空駅', 'おでん', '金曜 18:00に営業']);
    const cleared = chips[3]!.clear(filter);
    expect(cleared.openDay).toBeNull();
    expect(cleared.openTime).toBe('');
    expect(isFilterActive(filter)).toBe(true);
  });
});

describe('collectOptions', () => {
  it('データに存在する市区町村・酒の種類を返す', () => {
    const o = collectOptions(shops);
    expect(o.municipalities).toEqual(expect.arrayContaining(['北区', 'さいたま市大宮区']));
    expect(o.drinkTags).toEqual(expect.arrayContaining(['ホッピー', '日本酒']));
  });
});
