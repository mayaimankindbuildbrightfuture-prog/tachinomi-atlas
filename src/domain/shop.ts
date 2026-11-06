/**
 * 店舗・駅・情報ソースのデータモデル（仕様書 6章）と、その検証。
 * MapLibre・IndexedDB・React に依存しない純粋なドメイン層。
 */
import { distanceMeters } from './geo';

export type ShopStatus = 'unverified' | 'verified' | 'possibly_closed' | 'closed';

export type PriceLevel = 'budget' | 'standard' | 'premium' | 'unknown';

export type Prefecture = '東京都' | '埼玉県';

export type PriceExample = {
  itemName: string;
  priceYen: number | null;
  checkedAt: string | null;
  sourceId: string | null;
};

export type OpeningHours = {
  /** 0=日曜 … 6=土曜 */
  dayOfWeek: number;
  /** "HH:MM"。深夜営業は "25:00" のように24時以降で表すか、閉店時刻を開店時刻より前にする */
  opensAt: string | null;
  closesAt: string | null;
  /** true=定休日 / false=営業日 / null=未確認 */
  isClosed: boolean | null;
  note?: string;
};

export type Shop = {
  id: string;
  name: string;

  latitude: number;
  longitude: number;
  address: string | null;

  prefecture: Prefecture | null;
  municipality: string | null;
  stationIds: string[];

  categories: string[];
  drinkTags: string[];

  standingOnly: boolean | null;
  hasSeating: boolean | null;

  priceLevel: PriceLevel;
  priceExamples: PriceExample[];

  openingHours: OpeningHours[];
  officialUrl: string | null;

  status: ShopStatus;
  sourceIds: string[];

  createdAt: string;
  updatedAt: string;
  lastVerifiedAt: string | null;

  notes?: string;
};

export type Station = {
  id: string;
  name: string;
  latitude: number;
  longitude: number;
  prefecture: string | null;
  municipality: string | null;
  lines: string[];
};

export type DataSourceType = 'official_site' | 'open_data' | 'manual' | 'field_check' | 'other';

export type DataSource = {
  id: string;
  type: DataSourceType;
  name: string;
  url: string | null;
  accessedAt: string | null;
  notes: string | null;
};

// ---------------------------------------------------------------------------
// 表示用ラベル
// ---------------------------------------------------------------------------

export type CategoryDef = { key: string; label: string; short: string; color: string };

/** 料理ジャンル（仕様書 5.2）。マーカーの色と一文字アイコンに使う */
export const CATEGORIES: readonly CategoryDef[] = [
  { key: 'yakitori', label: '焼きとん・焼き鳥', short: '焼', color: '#e0703a' },
  { key: 'nikomi', label: '煮込み', short: '煮', color: '#b8573f' },
  { key: 'oden', label: 'おでん', short: 'お', color: '#d9a441' },
  { key: 'seafood', label: '刺身・海鮮', short: '魚', color: '#3f9bd1' },
  { key: 'sake', label: '日本酒', short: '酒', color: '#8f7ad6' },
  { key: 'beer', label: 'ビール・ホッピー', short: '麦', color: '#e6c84f' },
  { key: 'kakuuchi', label: '角打ち', short: '角', color: '#4fb38a' },
  { key: 'other', label: 'その他・未分類', short: '他', color: '#9aa0aa' },
] as const;

export const UNCATEGORIZED_KEY = 'other';

export function getCategory(key: string): CategoryDef {
  return CATEGORIES.find((c) => c.key === key) ?? (CATEGORIES.find((c) => c.key === UNCATEGORIZED_KEY) as CategoryDef);
}

/** 地図マーカーに使う代表ジャンル（先頭のジャンル。未設定ならその他） */
export function primaryCategory(shop: Pick<Shop, 'categories'>): string {
  const first = shop.categories.find((c) => CATEGORIES.some((d) => d.key === c));
  return first ?? UNCATEGORIZED_KEY;
}

/** 酒の種類の候補（自由入力も可） */
export const DRINK_TAG_SUGGESTIONS: readonly string[] = [
  'ビール',
  'ホッピー',
  '日本酒',
  '焼酎',
  'サワー',
  'ハイボール',
  'ワイン',
  'クラフトビール',
];

export const STATUS_LABELS: Record<ShopStatus, string> = {
  unverified: '未確認',
  verified: '確認済み',
  possibly_closed: '閉店の可能性あり',
  closed: '閉店確認済み',
};

export const PRICE_LEVEL_LABELS: Record<PriceLevel, string> = {
  budget: '安い（〜2,000円目安）',
  standard: '普通（2,000〜4,000円目安）',
  premium: '高め（4,000円〜目安）',
  unknown: '未確認',
};

export const SOURCE_TYPE_LABELS: Record<DataSourceType, string> = {
  official_site: '公式サイト・公式SNS',
  open_data: 'オープンデータ',
  manual: '手入力',
  field_check: '現地確認',
  other: 'その他',
};

export const DAY_LABELS = ['日', '月', '火', '水', '木', '金', '土'] as const;

export const PREFECTURES: readonly Prefecture[] = ['東京都', '埼玉県'];

// ---------------------------------------------------------------------------
// 検証
// ---------------------------------------------------------------------------

export type ValidationResult = {
  errors: string[];
  warnings: string[];
};

const TIME_RE = /^([01]?\d|2[0-9]):[0-5]\d$/;
const DATE_RE = /^\d{4}-\d{2}-\d{2}(T.*)?$/;

/** 東京都（本土）・埼玉県のおおよその範囲。範囲外は入力ミスの可能性として警告する */
const TARGET_AREA = { west: 138.6, east: 140.0, south: 35.4, north: 36.35 };

export function isHttpUrl(value: string): boolean {
  try {
    const u = new URL(value);
    return u.protocol === 'http:' || u.protocol === 'https:';
  } catch {
    return false;
  }
}

export function isValidTime(value: string): boolean {
  return TIME_RE.test(value);
}

export function validateCoordinates(latitude: number, longitude: number): ValidationResult {
  const errors: string[] = [];
  const warnings: string[] = [];
  const looksSwapped =
    latitude >= TARGET_AREA.west &&
    latitude <= TARGET_AREA.east &&
    longitude >= TARGET_AREA.south &&
    longitude <= TARGET_AREA.north;
  if (looksSwapped) {
    errors.push('緯度と経度が逆になっています（東京周辺は緯度35〜36、経度139〜140）。');
    return { errors, warnings };
  }
  if (!Number.isFinite(latitude) || latitude < -90 || latitude > 90) {
    errors.push('緯度は -90〜90 の数値で入力してください。');
  }
  if (!Number.isFinite(longitude) || longitude < -180 || longitude > 180) {
    errors.push('経度は -180〜180 の数値で入力してください。');
  }
  if (errors.length === 0) {
    const inArea =
      longitude >= TARGET_AREA.west &&
      longitude <= TARGET_AREA.east &&
      latitude >= TARGET_AREA.south &&
      latitude <= TARGET_AREA.north;
    if (!inArea) warnings.push('座標が東京都・埼玉県の範囲外です。入力を確認してください。');
  }
  return { errors, warnings };
}

function isStringArray(v: unknown): v is string[] {
  return Array.isArray(v) && v.every((x) => typeof x === 'string');
}

function isNullableString(v: unknown): v is string | null {
  return v === null || typeof v === 'string';
}

function isNullableBoolean(v: unknown): v is boolean | null {
  return v === null || typeof v === 'boolean';
}

const SHOP_STATUSES: readonly ShopStatus[] = ['unverified', 'verified', 'possibly_closed', 'closed'];
const PRICE_LEVELS: readonly PriceLevel[] = ['budget', 'standard', 'premium', 'unknown'];
const SOURCE_TYPES: readonly DataSourceType[] = ['official_site', 'open_data', 'manual', 'field_check', 'other'];

/**
 * 任意の値が Shop として妥当か検証する（初期データの読み込み・フォーム保存・将来のインポートで共通利用）。
 * エラーが1件でもあれば保存しない。警告は利用者に確認を促すもの。
 */
export function validateShop(value: unknown): ValidationResult {
  const errors: string[] = [];
  const warnings: string[] = [];
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return { errors: ['店舗データがオブジェクトではありません。'], warnings };
  }
  const s = value as Record<string, unknown>;

  if (typeof s.id !== 'string' || s.id.trim() === '') errors.push('ID がありません。');
  if (typeof s.name !== 'string' || s.name.trim() === '') errors.push('店名は必須です。');
  else if (s.name.length > 100) errors.push('店名は100文字以内にしてください。');

  if (typeof s.latitude !== 'number' || typeof s.longitude !== 'number') {
    errors.push('緯度・経度は必須です。');
  } else {
    const c = validateCoordinates(s.latitude, s.longitude);
    errors.push(...c.errors);
    warnings.push(...c.warnings);
  }

  if (!isNullableString(s.address)) errors.push('住所の形式が不正です。');
  if (!(
    s.prefecture === null ||
    (typeof s.prefecture === 'string' && (PREFECTURES as string[]).includes(s.prefecture))
  )) {
    errors.push('都道府県は「東京都」「埼玉県」または未設定にしてください。');
  }
  if (!isNullableString(s.municipality)) errors.push('市区町村の形式が不正です。');
  if (!isStringArray(s.stationIds)) errors.push('最寄り駅の形式が不正です。');
  if (!isStringArray(s.categories)) errors.push('料理ジャンルの形式が不正です。');
  if (!isStringArray(s.drinkTags)) errors.push('酒の種類の形式が不正です。');
  if (!isNullableBoolean(s.standingOnly)) errors.push('立ち呑み専業の値が不正です。');
  if (!isNullableBoolean(s.hasSeating)) errors.push('座席の有無の値が不正です。');
  if (typeof s.priceLevel !== 'string' || !(PRICE_LEVELS as string[]).includes(s.priceLevel)) {
    errors.push('予算帯の値が不正です。');
  }

  if (!Array.isArray(s.priceExamples)) {
    errors.push('価格例の形式が不正です。');
  } else {
    s.priceExamples.forEach((p: unknown, i) => {
      const label = `価格例${i + 1}`;
      if (!p || typeof p !== 'object') {
        errors.push(`${label}の形式が不正です。`);
        return;
      }
      const pe = p as Record<string, unknown>;
      if (typeof pe.itemName !== 'string' || pe.itemName.trim() === '') errors.push(`${label}の品名がありません。`);
      if (!(
        pe.priceYen === null ||
        (typeof pe.priceYen === 'number' &&
          Number.isInteger(pe.priceYen) &&
          pe.priceYen >= 0 &&
          pe.priceYen <= 1_000_000)
      )) {
        errors.push(`${label}の価格は0以上の整数（円）にしてください。`);
      }
      if (!(pe.checkedAt === null || (typeof pe.checkedAt === 'string' && DATE_RE.test(pe.checkedAt)))) {
        errors.push(`${label}の確認日は YYYY-MM-DD 形式にしてください。`);
      }
      if (!isNullableString(pe.sourceId)) errors.push(`${label}の出典の形式が不正です。`);
      if (typeof pe.priceYen === 'number' && pe.checkedAt === null) {
        warnings.push(`${label}（${String(pe.itemName)}）の価格に確認日がありません。`);
      }
    });
  }

  if (!Array.isArray(s.openingHours)) {
    errors.push('営業時間の形式が不正です。');
  } else {
    const days = new Set<number>();
    s.openingHours.forEach((h: unknown, i) => {
      const label = `営業時間${i + 1}`;
      if (!h || typeof h !== 'object') {
        errors.push(`${label}の形式が不正です。`);
        return;
      }
      const oh = h as Record<string, unknown>;
      if (typeof oh.dayOfWeek !== 'number' || !Number.isInteger(oh.dayOfWeek) || oh.dayOfWeek < 0 || oh.dayOfWeek > 6) {
        errors.push(`${label}の曜日が不正です。`);
      } else {
        days.add(oh.dayOfWeek);
      }
      for (const key of ['opensAt', 'closesAt'] as const) {
        const t = oh[key];
        if (!(t === null || (typeof t === 'string' && isValidTime(t)))) {
          errors.push(`${label}の時刻は HH:MM 形式にしてください（深夜は 25:00 のようにも書けます）。`);
        }
      }
      if (!isNullableBoolean(oh.isClosed)) errors.push(`${label}の定休日の値が不正です。`);
      if (oh.isClosed === false && (oh.opensAt === null || oh.closesAt === null)) {
        errors.push(`${label}：営業日の場合は開店・閉店時刻を入力してください。`);
      }
    });
    if (days.size !== s.openingHours.length) errors.push('同じ曜日の営業時間が重複しています。');
  }

  if (!(s.officialUrl === null || (typeof s.officialUrl === 'string' && isHttpUrl(s.officialUrl)))) {
    errors.push('公式サイトURLは http:// または https:// で始まるURLにしてください。');
  }
  if (typeof s.status !== 'string' || !(SHOP_STATUSES as string[]).includes(s.status)) {
    errors.push('確認状況の値が不正です。');
  }
  if (!isStringArray(s.sourceIds)) errors.push('出典の形式が不正です。');
  else if (s.status === 'verified' && s.sourceIds.length === 0) {
    errors.push('「確認済み」にするには出典を1件以上登録してください。');
  }
  if (s.status === 'verified' && s.lastVerifiedAt === null) {
    errors.push('「確認済み」にするには最終確認日を入力してください。');
  }

  for (const key of ['createdAt', 'updatedAt'] as const) {
    if (typeof s[key] !== 'string' || !DATE_RE.test(s[key] as string)) errors.push(`${key} の日時が不正です。`);
  }
  if (!(s.lastVerifiedAt === null || (typeof s.lastVerifiedAt === 'string' && DATE_RE.test(s.lastVerifiedAt)))) {
    errors.push('最終確認日は YYYY-MM-DD 形式にしてください。');
  }
  if (s.notes !== undefined && typeof s.notes !== 'string') errors.push('メモの形式が不正です。');

  return { errors, warnings };
}

export function validateDataSource(value: unknown): ValidationResult {
  const errors: string[] = [];
  if (!value || typeof value !== 'object')
    return { errors: ['出典データがオブジェクトではありません。'], warnings: [] };
  const s = value as Record<string, unknown>;
  if (typeof s.id !== 'string' || s.id.trim() === '') errors.push('出典IDがありません。');
  if (typeof s.type !== 'string' || !(SOURCE_TYPES as string[]).includes(s.type)) errors.push('出典の種類が不正です。');
  if (typeof s.name !== 'string' || s.name.trim() === '') errors.push('出典名は必須です。');
  if (!(s.url === null || (typeof s.url === 'string' && isHttpUrl(s.url))))
    errors.push('出典URLは http(s) のURLにしてください。');
  if (!(s.accessedAt === null || (typeof s.accessedAt === 'string' && DATE_RE.test(s.accessedAt)))) {
    errors.push('出典の参照日は YYYY-MM-DD 形式にしてください。');
  }
  if (!isNullableString(s.notes)) errors.push('出典メモの形式が不正です。');
  return { errors, warnings: [] };
}

// ---------------------------------------------------------------------------
// 重複判定
// ---------------------------------------------------------------------------

/** 表記ゆれ（全角半角・空白・大文字小文字）を吸収した店名 */
export function normalizeName(name: string): string {
  return name
    .normalize('NFKC')
    .toLowerCase()
    .replace(/[\s・･]/g, '');
}

/** 同名とみなす店舗間の距離（メートル） */
export const DUPLICATE_DISTANCE_M = 150;

/**
 * 重複の可能性がある既存店舗を返す。自分自身（同じID）は除外する。
 * 同じ店名（表記ゆれ除去後）で、かつ近い位置にある店舗を重複候補とする。
 */
export function findPossibleDuplicates(
  candidate: Pick<Shop, 'id' | 'name' | 'latitude' | 'longitude'>,
  shops: readonly Shop[],
): Shop[] {
  const name = normalizeName(candidate.name);
  return shops.filter(
    (s) =>
      s.id !== candidate.id &&
      normalizeName(s.name) === name &&
      distanceMeters(s.latitude, s.longitude, candidate.latitude, candidate.longitude) <= DUPLICATE_DISTANCE_M,
  );
}

export function createId(prefix: string): string {
  const uuid =
    typeof crypto !== 'undefined' && 'randomUUID' in crypto
      ? crypto.randomUUID()
      : `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
  return `${prefix}-${uuid}`;
}

/** 新規店舗のひな形（未確認・不明値で初期化し、勝手に補完しない） */
export function createEmptyShop(now: string, coords?: { latitude: number; longitude: number }): Shop {
  return {
    id: createId('shop'),
    name: '',
    latitude: coords?.latitude ?? Number.NaN,
    longitude: coords?.longitude ?? Number.NaN,
    address: null,
    prefecture: null,
    municipality: null,
    stationIds: [],
    categories: [],
    drinkTags: [],
    standingOnly: null,
    hasSeating: null,
    priceLevel: 'unknown',
    priceExamples: [],
    openingHours: [],
    officialUrl: null,
    status: 'unverified',
    sourceIds: [],
    createdAt: now,
    updatedAt: now,
    lastVerifiedAt: null,
  };
}
