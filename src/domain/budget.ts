/**
 * 予算計算・注文モデル（仕様書 9章、F-18）。
 *
 * 合計は「登録された価格例の合算」のみ。お通し・チャージ・税・サービス料は登録されていないため、
 * 合計を確定金額として扱わない（表示側で必ず注記する）。
 */
import type { PriceExample, Shop } from './shop';

export const BUDGET_PRESETS_YEN = [1000, 2000, 3000] as const;

/** 予算検索の注文モデル：価格例のうち安いものから何品頼むか */
export const ORDER_MODEL_ITEM_COUNTS = [2, 3] as const;
export type OrderModelItemCount = (typeof ORDER_MODEL_ITEM_COUNTS)[number];

export const ORDER_MODEL_LABELS: Record<OrderModelItemCount, string> = {
  2: '安い順に2品（例：1杯＋1品）',
  3: '安い順に3品（例：2杯＋1品）',
};

export const PRICE_CAVEAT = 'お通し・チャージ・税・サービス料は含みません（登録されていないため）。';

export function pricedExamples(shop: Pick<Shop, 'priceExamples'>): (PriceExample & { priceYen: number })[] {
  return shop.priceExamples.filter((p): p is PriceExample & { priceYen: number } => p.priceYen !== null);
}

/**
 * 価格例の安いものから n 品の合計。価格の登録が n 品に満たない店舗は null（予算内とは断定しない）。
 */
export function cheapestOrderTotal(shop: Pick<Shop, 'priceExamples'>, n: number): number | null {
  const prices = pricedExamples(shop)
    .map((p) => p.priceYen)
    .sort((a, b) => a - b);
  if (prices.length < n) return null;
  return prices.slice(0, n).reduce((sum, p) => sum + p, 0);
}

/** 選んだ品の合計。価格が未確認の品は合計に含めず件数を返す */
export function selectedItemsTotal(
  shop: Pick<Shop, 'priceExamples'>,
  itemNames: readonly string[],
): { totalYen: number; pricedCount: number; unpricedCount: number; missingCount: number } {
  let totalYen = 0;
  let pricedCount = 0;
  let unpricedCount = 0;
  let missingCount = 0;
  for (const name of itemNames) {
    const ex = shop.priceExamples.find((p) => p.itemName === name);
    if (!ex) missingCount += 1;
    else if (ex.priceYen === null) unpricedCount += 1;
    else {
      totalYen += ex.priceYen;
      pricedCount += 1;
    }
  }
  return { totalYen, pricedCount, unpricedCount, missingCount };
}
