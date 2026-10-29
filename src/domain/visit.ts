/**
 * 訪問記録（仕様書 7.1）と、お気に入り・行きたい店・再訪したい店（7.2）。
 * 店舗データ本体とは別に管理し、店舗に個人の評価や訪問状態を混在させない。
 */

export type Visit = {
  id: string;
  shopId: string;

  /** 訪問日時（ISO 8601。日本時間のオフセット付き、例 2026-10-29T19:30:00+09:00） */
  visitedAt: string;
  orderedItems: string[];

  amountYen: number | null;
  /** 1〜5。未評価は null */
  rating: number | null;

  atmosphereTags: string[];
  memo: string;

  /** 写真のファイル名や保存場所のメモ（画像そのものは保存・送信しない） */
  photoRefs: string[];

  createdAt: string;
  updatedAt: string;

  /**
   * 記録時点の店名（仕様書の Visit 型への追加項目・任意）。
   * 店舗が削除・改名されても、過去の記録がどの店のものか分かるようにする。
   */
  shopNameAtVisit?: string;
};

export type ShopMark = {
  shopId: string;
  /** 気に入った店 */
  favorite: boolean;
  /** 今後訪問する候補 */
  wantToGo: boolean;
  /** 再び行く意思がある店 */
  revisit: boolean;
  updatedAt: string;
};

export type MarkKind = 'favorite' | 'wantToGo' | 'revisit';

export const MARK_LABELS: Record<MarkKind, string> = {
  favorite: 'お気に入り',
  wantToGo: '行きたい店',
  revisit: '再訪したい',
};

export const MARK_KINDS: readonly MarkKind[] = ['favorite', 'wantToGo', 'revisit'];

export const RATING_MIN = 1;
export const RATING_MAX = 5;

export const ATMOSPHERE_SUGGESTIONS: readonly string[] = [
  '一人飲み向き',
  '常連が多い',
  '賑やか',
  '静か',
  '昼飲み',
  '朝飲み',
  'キャッシュオン',
  '外飲み',
];

const ISO_RE = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(:\d{2}(\.\d+)?)?(Z|[+-]\d{2}:\d{2})$/;
const MAX_TEXT = 5000;

function isStringArray(v: unknown, maxLen = 200): v is string[] {
  return Array.isArray(v) && v.length <= 100 && v.every((x) => typeof x === 'string' && x.length <= maxLen);
}

export function validateVisit(value: unknown): { errors: string[] } {
  const errors: string[] = [];
  if (!value || typeof value !== 'object' || Array.isArray(value))
    return { errors: ['訪問記録がオブジェクトではありません。'] };
  const v = value as Record<string, unknown>;
  if (typeof v.id !== 'string' || !v.id) errors.push('訪問記録のIDがありません。');
  if (typeof v.shopId !== 'string' || !v.shopId) errors.push('訪問した店舗のIDがありません。');
  if (typeof v.visitedAt !== 'string' || !ISO_RE.test(v.visitedAt) || Number.isNaN(Date.parse(v.visitedAt))) {
    errors.push('訪問日時が不正です。');
  }
  if (!isStringArray(v.orderedItems)) errors.push('注文した品の形式が不正です。');
  if (!(
    v.amountYen === null ||
    (typeof v.amountYen === 'number' && Number.isInteger(v.amountYen) && v.amountYen >= 0 && v.amountYen <= 10_000_000)
  )) {
    errors.push('金額は0以上の整数（円）にしてください。');
  }
  if (!(
    v.rating === null ||
    (typeof v.rating === 'number' && Number.isInteger(v.rating) && v.rating >= RATING_MIN && v.rating <= RATING_MAX)
  )) {
    errors.push(`評価は${RATING_MIN}〜${RATING_MAX}、または未評価にしてください。`);
  }
  if (!isStringArray(v.atmosphereTags, 50)) errors.push('雰囲気タグの形式が不正です。');
  if (typeof v.memo !== 'string' || v.memo.length > MAX_TEXT)
    errors.push(`感想・メモは${MAX_TEXT}文字以内の文字列にしてください。`);
  if (!isStringArray(v.photoRefs, 500)) errors.push('写真の参照先の形式が不正です。');
  for (const key of ['createdAt', 'updatedAt'] as const) {
    if (typeof v[key] !== 'string' || Number.isNaN(Date.parse(v[key] as string)))
      errors.push(`${key} の日時が不正です。`);
  }
  if (v.shopNameAtVisit !== undefined && (typeof v.shopNameAtVisit !== 'string' || v.shopNameAtVisit.length > 100)) {
    errors.push('記録時の店名の形式が不正です。');
  }
  return { errors };
}

export function validateMark(value: unknown): { errors: string[] } {
  const errors: string[] = [];
  if (!value || typeof value !== 'object' || Array.isArray(value))
    return { errors: ['お気に入り等の記録がオブジェクトではありません。'] };
  const m = value as Record<string, unknown>;
  if (typeof m.shopId !== 'string' || !m.shopId) errors.push('店舗のIDがありません。');
  for (const k of MARK_KINDS) if (typeof m[k] !== 'boolean') errors.push(`${MARK_LABELS[k]}の値が不正です。`);
  if (typeof m.updatedAt !== 'string' || Number.isNaN(Date.parse(m.updatedAt))) errors.push('更新日時が不正です。');
  return { errors };
}

export function isMarkEmpty(mark: ShopMark): boolean {
  return MARK_KINDS.every((k) => !mark[k]);
}

export function toggleMark(current: ShopMark | undefined, shopId: string, kind: MarkKind, now: string): ShopMark {
  const base: ShopMark = current ?? { shopId, favorite: false, wantToGo: false, revisit: false, updatedAt: now };
  return { ...base, [kind]: !base[kind], updatedAt: now };
}

/** 日本時間の日時文字列（+09:00）を作る */
export function toJstIso(date: Date): string {
  const jst = new Date(date.getTime() + 9 * 60 * 60 * 1000);
  return `${jst.toISOString().slice(0, 19)}+09:00`;
}

/** datetime-local 入力値（日本時間として解釈）⇔ ISO の変換 */
export function fromDateTimeLocal(value: string): string | null {
  if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(value)) return null;
  return `${value}:00+09:00`;
}

export function toDateTimeLocal(iso: string): string {
  const t = Date.parse(iso);
  if (Number.isNaN(t)) return '';
  return toJstIso(new Date(t)).slice(0, 16);
}

/** 新しい順 */
export function sortVisitsDesc(visits: readonly Visit[]): Visit[] {
  return [...visits].sort((a, b) => Date.parse(b.visitedAt) - Date.parse(a.visitedAt));
}

export type VisitStats = {
  visitCount: number;
  shopCount: number;
  /** 金額が記録された訪問の合計 */
  totalAmountYen: number;
  amountRecordedCount: number;
  averageRating: number | null;
  ratedCount: number;
};

export function visitStats(visits: readonly Visit[]): VisitStats {
  const withAmount = visits.filter((v) => v.amountYen !== null);
  const rated = visits.filter((v) => v.rating !== null);
  return {
    visitCount: visits.length,
    shopCount: new Set(visits.map((v) => v.shopId)).size,
    totalAmountYen: withAmount.reduce((n, v) => n + (v.amountYen ?? 0), 0),
    amountRecordedCount: withAmount.length,
    averageRating: rated.length ? rated.reduce((n, v) => n + (v.rating ?? 0), 0) / rated.length : null,
    ratedCount: rated.length,
  };
}

/** 訪問履歴を日本時間の年月ごとにまとめる（新しい月から） */
export function groupVisitsByMonth(visits: readonly Visit[]): { month: string; label: string; visits: Visit[] }[] {
  const groups = new Map<string, Visit[]>();
  for (const v of sortVisitsDesc(visits)) {
    const month = toDateTimeLocal(v.visitedAt).slice(0, 7);
    groups.set(month, [...(groups.get(month) ?? []), v]);
  }
  return [...groups.entries()].map(([month, list]) => ({
    month,
    label: `${month.slice(0, 4)}年${Number(month.slice(5, 7))}月`,
    visits: list,
  }));
}

/** 改行区切りの入力を配列にする（空行は除く） */
export function linesToList(text: string): string[] {
  return text
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter(Boolean);
}
