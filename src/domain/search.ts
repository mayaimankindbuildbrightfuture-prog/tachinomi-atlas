/**
 * 店舗の検索・絞り込み（仕様書 4.4）。純粋関数として実装し、地図・UI から独立させる。
 *
 * 訪問済み・お気に入り・予算内の注文モデルによる絞り込みは、個人記録（Phase 4）と
 * 注文モデル（F-18）の実装時に追加する。
 */
import { distanceMeters } from './geo';
import { MARK_LABELS, type MarkKind, type ShopMark } from './visit';
import { openStateAt, openStateOnDay, parseMinutes, formatDay } from './hours';
import {
  PRICE_LEVEL_LABELS,
  STATUS_LABELS,
  getCategory,
  normalizeName,
  type PriceLevel,
  type Prefecture,
  type Shop,
  type ShopStatus,
  type Station,
} from './shop';

export type SeatingStyle = 'any' | 'standingOnly' | 'withSeating';

export type VisitedFilter = 'any' | 'visited' | 'unvisited';

/** 個人記録による絞り込みに使う情報（店舗データとは別に管理されている） */
export type PersonalContext = {
  visitedShopIds: ReadonlySet<string>;
  marks: ReadonlyMap<string, ShopMark>;
};

const EMPTY_PERSONAL: PersonalContext = { visitedShopIds: new Set(), marks: new Map() };

export type ShopFilter = {
  keyword: string;
  prefectures: Prefecture[];
  municipality: string;
  /** 駅を起点とした探索：この駅に最寄り駅として登録された店舗、または駅から stationRadiusM 以内の店舗 */
  stationId: string;
  stationRadiusM: number;
  categories: string[];
  drinkTags: string[];
  priceLevels: PriceLevel[];
  seating: SeatingStyle;
  /** 0=日〜6=土。null は曜日指定なし */
  openDay: number | null;
  /** "HH:MM"。空文字は時刻指定なし */
  openTime: string;
  /** 営業時間が未登録・不明な店舗も結果に含めるか */
  includeUnknownHours: boolean;
  statuses: ShopStatus[];
  /** 訪問済み・未訪問 */
  visited: VisitedFilter;
  /** お気に入り・行きたい店・再訪したい（いずれかに当てはまる） */
  marks: MarkKind[];
};

export const EMPTY_FILTER: ShopFilter = {
  keyword: '',
  prefectures: [],
  municipality: '',
  stationId: '',
  stationRadiusM: 500,
  categories: [],
  drinkTags: [],
  priceLevels: [],
  seating: 'any',
  openDay: null,
  openTime: '',
  includeUnknownHours: false,
  statuses: [],
  visited: 'any',
  marks: [],
};

function matchesKeyword(shop: Shop, keyword: string): boolean {
  const k = normalizeName(keyword);
  if (k === '') return true;
  return [shop.name, shop.address ?? '', shop.municipality ?? ''].some((v) => normalizeName(v).includes(k));
}

function matchesHours(shop: Shop, filter: ShopFilter): boolean {
  if (filter.openDay === null) return true;
  const minutes = parseMinutes(filter.openTime || null);
  const state =
    minutes === null
      ? openStateOnDay(shop.openingHours, filter.openDay)
      : openStateAt(shop.openingHours, filter.openDay, minutes);
  if (state === 'open') return true;
  return state === 'unknown' && filter.includeUnknownHours;
}

function matchesStation(shop: Shop, filter: ShopFilter, stations: readonly Station[]): boolean {
  if (filter.stationId === '') return true;
  if (shop.stationIds.includes(filter.stationId)) return true;
  const station = stations.find((s) => s.id === filter.stationId);
  if (!station) return false;
  return distanceMeters(station.latitude, station.longitude, shop.latitude, shop.longitude) <= filter.stationRadiusM;
}

function matchesPersonal(shop: Shop, filter: ShopFilter, personal: PersonalContext): boolean {
  const visited = personal.visitedShopIds.has(shop.id);
  if (filter.visited === 'visited' && !visited) return false;
  if (filter.visited === 'unvisited' && visited) return false;
  if (filter.marks.length > 0) {
    const mark = personal.marks.get(shop.id);
    if (!mark || !filter.marks.some((k) => mark[k])) return false;
  }
  return true;
}

export function matchesFilter(
  shop: Shop,
  filter: ShopFilter,
  stations: readonly Station[] = [],
  personal: PersonalContext = EMPTY_PERSONAL,
): boolean {
  if (!matchesKeyword(shop, filter.keyword)) return false;
  if (filter.prefectures.length > 0 && (shop.prefecture === null || !filter.prefectures.includes(shop.prefecture)))
    return false;
  if (filter.municipality !== '' && shop.municipality !== filter.municipality) return false;
  if (!matchesStation(shop, filter, stations)) return false;
  if (filter.categories.length > 0 && !shop.categories.some((c) => filter.categories.includes(c))) return false;
  if (filter.drinkTags.length > 0 && !shop.drinkTags.some((d) => filter.drinkTags.includes(d))) return false;
  if (filter.priceLevels.length > 0 && !filter.priceLevels.includes(shop.priceLevel)) return false;
  if (filter.seating === 'standingOnly' && shop.standingOnly !== true) return false;
  if (filter.seating === 'withSeating' && shop.hasSeating !== true) return false;
  if (!matchesHours(shop, filter)) return false;
  if (filter.statuses.length > 0 && !filter.statuses.includes(shop.status)) return false;
  if (!matchesPersonal(shop, filter, personal)) return false;
  return true;
}

export function filterShops(
  shops: readonly Shop[],
  filter: ShopFilter,
  stations: readonly Station[] = [],
  personal: PersonalContext = EMPTY_PERSONAL,
): Shop[] {
  return shops.filter((s) => matchesFilter(s, filter, stations, personal));
}

export function isFilterActive(filter: ShopFilter): boolean {
  return activeFilterChips(filter, []).length > 0;
}

export type FilterChip = {
  /** 解除時に適用するフィルター */
  clear: (f: ShopFilter) => ShopFilter;
  label: string;
};

/** 現在適用中の条件を、解除ボタン付きの表示用ラベルに変換する */
export function activeFilterChips(filter: ShopFilter, stations: readonly Station[]): FilterChip[] {
  const chips: FilterChip[] = [];
  if (filter.keyword.trim())
    chips.push({ label: `「${filter.keyword.trim()}」`, clear: (f) => ({ ...f, keyword: '' }) });
  for (const p of filter.prefectures) {
    chips.push({ label: p, clear: (f) => ({ ...f, prefectures: f.prefectures.filter((x) => x !== p) }) });
  }
  if (filter.municipality) chips.push({ label: filter.municipality, clear: (f) => ({ ...f, municipality: '' }) });
  if (filter.stationId) {
    const name = stations.find((s) => s.id === filter.stationId)?.name ?? filter.stationId;
    chips.push({ label: `${name}駅から${filter.stationRadiusM}m以内`, clear: (f) => ({ ...f, stationId: '' }) });
  }
  for (const c of filter.categories) {
    chips.push({
      label: getCategory(c).label,
      clear: (f) => ({ ...f, categories: f.categories.filter((x) => x !== c) }),
    });
  }
  for (const d of filter.drinkTags) {
    chips.push({ label: d, clear: (f) => ({ ...f, drinkTags: f.drinkTags.filter((x) => x !== d) }) });
  }
  for (const p of filter.priceLevels) {
    chips.push({
      label: `予算:${PRICE_LEVEL_LABELS[p].replace(/（.*）/, '')}`,
      clear: (f) => ({ ...f, priceLevels: f.priceLevels.filter((x) => x !== p) }),
    });
  }
  if (filter.seating === 'standingOnly')
    chips.push({ label: '立ち呑み専業', clear: (f) => ({ ...f, seating: 'any' }) });
  if (filter.seating === 'withSeating') chips.push({ label: '座席あり', clear: (f) => ({ ...f, seating: 'any' }) });
  if (filter.openDay !== null) {
    const time = filter.openTime ? ` ${filter.openTime}` : '';
    const unknown = filter.includeUnknownHours ? '（不明含む）' : '';
    chips.push({
      label: `${formatDay(filter.openDay)}曜${time}に営業${unknown}`,
      clear: (f) => ({ ...f, openDay: null, openTime: '', includeUnknownHours: false }),
    });
  }
  for (const s of filter.statuses) {
    chips.push({ label: STATUS_LABELS[s], clear: (f) => ({ ...f, statuses: f.statuses.filter((x) => x !== s) }) });
  }
  if (filter.visited !== 'any') {
    chips.push({
      label: filter.visited === 'visited' ? '訪問済み' : '未訪問',
      clear: (f) => ({ ...f, visited: 'any' }),
    });
  }
  for (const k of filter.marks) {
    chips.push({ label: MARK_LABELS[k], clear: (f) => ({ ...f, marks: f.marks.filter((x) => x !== k) }) });
  }
  return chips;
}

/** 絞り込みの選択肢に使う、データ中に存在する値の一覧 */
export function collectOptions(shops: readonly Shop[]) {
  const municipalities = new Set<string>();
  const drinkTags = new Set<string>();
  for (const s of shops) {
    if (s.municipality) municipalities.add(s.municipality);
    s.drinkTags.forEach((d) => drinkTags.add(d));
  }
  const collator = new Intl.Collator('ja');
  return {
    municipalities: [...municipalities].sort(collator.compare),
    drinkTags: [...drinkTags].sort(collator.compare),
  };
}
