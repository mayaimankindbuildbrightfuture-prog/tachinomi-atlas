import { makeShop } from '../tests/fixtures';
import { cheapestOrderTotal, pricedExamples, selectedItemsTotal } from './budget';
import { EMPTY_FILTER, filterShops } from './search';

const p = (itemName: string, priceYen: number | null) => ({
  itemName,
  priceYen,
  checkedAt: '2026-10-01',
  sourceId: null,
});

const shop = makeShop({
  id: 's',
  priceExamples: [p('ホッピーセット', 500), p('煮込み', 400), p('刺身', 700), p('日本酒', null)],
});

describe('注文モデル', () => {
  it('価格の分かる品だけを使い、安い順にn品を合計する', () => {
    expect(pricedExamples(shop)).toHaveLength(3);
    expect(cheapestOrderTotal(shop, 2)).toBe(900);
    expect(cheapestOrderTotal(shop, 3)).toBe(1600);
    expect(cheapestOrderTotal(shop, 4)).toBeNull();
    expect(cheapestOrderTotal(makeShop(), 2)).toBeNull();
  });

  it('選んだ品の合計では、価格未確認・見つからない品を数え分ける', () => {
    expect(selectedItemsTotal(shop, ['煮込み', '日本酒', '消えた品'])).toEqual({
      totalYen: 400,
      pricedCount: 1,
      unpricedCount: 1,
      missingCount: 1,
    });
  });
});

describe('予算での絞り込み（仕様書 9.2）', () => {
  const noPrices = makeShop({ id: 'none' });
  const ids = (budgetYen: number, budgetItemCount: 2 | 3 = 2) =>
    filterShops([shop, noPrices], { ...EMPTY_FILTER, budgetYen, budgetItemCount }).map((s) => s.id);

  it('注文モデルの合計が予算内の店舗だけを返し、価格例のない店舗は含めない', () => {
    expect(ids(1000)).toEqual(['s']);
    expect(ids(800)).toEqual([]);
    expect(ids(1500, 3)).toEqual([]);
    expect(ids(2000, 3)).toEqual(['s']);
  });
});
