/**
 * はしご酒のルート計画（仕様書 7.3・10章）。
 */
import { distanceMeters } from './geo';
import { openStateAt, parseMinutes, type OpenState } from './hours';
import { isValidTime, type Shop, type Station } from './shop';

export type PlannedRoute = {
  id: string;
  name: string;

  /** 店の順序は配列順 */
  shopIds: string[];
  startStationId: string | null;

  budgetYen: number | null;
  plannedDurationMinutes: number | null;

  memo: string;

  createdAt: string;
  updatedAt: string;

  // ---- 仕様書の型への追加項目（いずれも任意。時間計画・注文モデルのため） ----
  /** 予定日（YYYY-MM-DD）。曜日の判定に使う */
  plannedDate?: string | null;
  /** 開始時刻（HH:MM、日本時間） */
  startTime?: string | null;
  /** 店ごとの滞在時間（分） */
  stayMinutes?: Record<string, number>;
  /** 店ごとに頼む予定の品（価格例の品名） */
  selectedItems?: Record<string, string[]>;
};

export const DEFAULT_STAY_MINUTES = 45;
export const MAX_ROUTE_SHOPS = 20;

/**
 * 徒歩時間の概算に使う速さ（分速80m）。不動産の表示に関する公正競争規約の「徒歩1分＝80m」を目安にした値。
 * 直線距離から計算するため、実際の道のりの所要時間より短くなる。
 */
export const WALK_METERS_PER_MINUTE = 80;

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

export function validateRoute(value: unknown): { errors: string[] } {
  const errors: string[] = [];
  if (!value || typeof value !== 'object' || Array.isArray(value))
    return { errors: ['ルートがオブジェクトではありません。'] };
  const r = value as Record<string, unknown>;
  if (typeof r.id !== 'string' || !r.id) errors.push('ルートのIDがありません。');
  if (typeof r.name !== 'string' || !r.name.trim() || r.name.length > 100)
    errors.push('ルート名は1〜100文字で入力してください。');
  if (!Array.isArray(r.shopIds) || !r.shopIds.every((x) => typeof x === 'string'))
    errors.push('店舗の並びの形式が不正です。');
  else {
    if (new Set(r.shopIds).size !== r.shopIds.length) errors.push('同じ店舗が重複しています。');
    if (r.shopIds.length > MAX_ROUTE_SHOPS) errors.push(`1つのルートに入れられる店舗は${MAX_ROUTE_SHOPS}軒までです。`);
  }
  if (!(r.startStationId === null || typeof r.startStationId === 'string')) errors.push('出発駅の形式が不正です。');
  if (!(
    r.budgetYen === null ||
    (typeof r.budgetYen === 'number' && Number.isInteger(r.budgetYen) && r.budgetYen >= 0 && r.budgetYen <= 1_000_000)
  )) {
    errors.push('予算は0以上の整数（円）にしてください。');
  }
  if (!(
    r.plannedDurationMinutes === null ||
    (typeof r.plannedDurationMinutes === 'number' &&
      Number.isInteger(r.plannedDurationMinutes) &&
      r.plannedDurationMinutes > 0 &&
      r.plannedDurationMinutes <= 24 * 60)
  )) {
    errors.push('想定所要時間は1〜1440分で入力してください。');
  }
  if (typeof r.memo !== 'string' || r.memo.length > 5000) errors.push('メモの形式が不正です。');
  for (const key of ['createdAt', 'updatedAt'] as const) {
    if (typeof r[key] !== 'string' || Number.isNaN(Date.parse(r[key] as string)))
      errors.push(`${key} の日時が不正です。`);
  }
  if (!(
    r.plannedDate === undefined ||
    r.plannedDate === null ||
    (typeof r.plannedDate === 'string' && DATE_RE.test(r.plannedDate))
  )) {
    errors.push('予定日は YYYY-MM-DD 形式にしてください。');
  }
  if (!(
    r.startTime === undefined ||
    r.startTime === null ||
    (typeof r.startTime === 'string' && isValidTime(r.startTime) && (parseMinutes(r.startTime) ?? 9999) < 24 * 60)
  )) {
    errors.push('開始時刻は HH:MM（00:00〜23:59）にしてください。');
  }
  if (r.stayMinutes !== undefined) {
    const ok =
      r.stayMinutes !== null &&
      typeof r.stayMinutes === 'object' &&
      Object.values(r.stayMinutes).every((m) => typeof m === 'number' && Number.isInteger(m) && m >= 0 && m <= 600);
    if (!ok) errors.push('滞在時間は0〜600分で入力してください。');
  }
  if (r.selectedItems !== undefined) {
    const ok =
      r.selectedItems !== null &&
      typeof r.selectedItems === 'object' &&
      Object.values(r.selectedItems).every((l) => Array.isArray(l) && l.every((x) => typeof x === 'string'));
    if (!ok) errors.push('注文予定の品の形式が不正です。');
  }
  return { errors };
}

export function createRoute(id: string, now: string, name = '新しいはしご酒'): PlannedRoute {
  return {
    id,
    name,
    shopIds: [],
    startStationId: null,
    budgetYen: null,
    plannedDurationMinutes: null,
    memo: '',
    createdAt: now,
    updatedAt: now,
    plannedDate: null,
    startTime: null,
    stayMinutes: {},
    selectedItems: {},
  };
}

export function addShopToRoute(route: PlannedRoute, shopId: string, now: string): PlannedRoute {
  if (route.shopIds.includes(shopId) || route.shopIds.length >= MAX_ROUTE_SHOPS) return route;
  return { ...route, shopIds: [...route.shopIds, shopId], updatedAt: now };
}

export function removeShopFromRoute(route: PlannedRoute, shopId: string, now: string): PlannedRoute {
  const stayMinutes = { ...(route.stayMinutes ?? {}) };
  const selectedItems = { ...(route.selectedItems ?? {}) };
  delete stayMinutes[shopId];
  delete selectedItems[shopId];
  return { ...route, shopIds: route.shopIds.filter((id) => id !== shopId), stayMinutes, selectedItems, updatedAt: now };
}

/** index の店舗を delta（-1 で前へ、+1 で後ろへ）だけ移動する */
export function moveShopInRoute(route: PlannedRoute, index: number, delta: -1 | 1, now: string): PlannedRoute {
  const to = index + delta;
  if (index < 0 || index >= route.shopIds.length || to < 0 || to >= route.shopIds.length) return route;
  const ids = [...route.shopIds];
  [ids[index], ids[to]] = [ids[to]!, ids[index]!];
  return { ...route, shopIds: ids, updatedAt: now };
}

export function stayMinutesOf(route: PlannedRoute, shopId: string): number {
  return route.stayMinutes?.[shopId] ?? DEFAULT_STAY_MINUTES;
}

// ---------------------------------------------------------------------------
// 区間（直線距離・概算）
// ---------------------------------------------------------------------------

export type RoutePoint = { kind: 'station' | 'shop'; id: string; name: string; latitude: number; longitude: number };

export type Leg = {
  from: RoutePoint;
  to: RoutePoint;
  /** 直線距離（m） */
  straightM: number;
  /** 直線距離を分速80mで割った概算（分）。実際の徒歩時間ではない */
  estimatedMinutes: number;
};

/** ルートの地点（出発駅があれば先頭）を並べる。見つからない店舗は除く */
export function routePoints(route: PlannedRoute, shops: readonly Shop[], stations: readonly Station[]): RoutePoint[] {
  const points: RoutePoint[] = [];
  const station = route.startStationId ? stations.find((s) => s.id === route.startStationId) : undefined;
  if (station)
    points.push({
      kind: 'station',
      id: station.id,
      name: `${station.name}駅`,
      latitude: station.latitude,
      longitude: station.longitude,
    });
  for (const id of route.shopIds) {
    const shop = shops.find((s) => s.id === id);
    if (shop)
      points.push({ kind: 'shop', id: shop.id, name: shop.name, latitude: shop.latitude, longitude: shop.longitude });
  }
  return points;
}

export function buildLegs(points: readonly RoutePoint[]): Leg[] {
  const legs: Leg[] = [];
  for (let i = 1; i < points.length; i++) {
    const from = points[i - 1]!;
    const to = points[i]!;
    const straightM = distanceMeters(from.latitude, from.longitude, to.latitude, to.longitude);
    legs.push({ from, to, straightM, estimatedMinutes: Math.max(1, Math.ceil(straightM / WALK_METERS_PER_MINUTE)) });
  }
  return legs;
}

// ---------------------------------------------------------------------------
// 時間計画（仕様書 10.3）
// ---------------------------------------------------------------------------

export type StopSchedule = {
  shopId: string;
  /** 予定日の0:00からの分（24時を超えると翌日） */
  arrivalMinutes: number;
  departureMinutes: number;
  /**
   * 登録された営業時間との照合。
   * open：到着から出発まで営業時間内／closed：営業時間外を含む／unknown：営業時間が未確認などで判定できない
   */
  openCheck: OpenState;
};

export type Schedule = {
  stops: StopSchedule[];
  endMinutes: number;
  /** 移動時間に使った値の種類 */
  walkSource: 'estimate' | 'routed';
};

function dayOfWeekOf(date: string): number {
  // 日付だけを扱うため、UTC で曜日を求める（タイムゾーンの影響を受けない）
  return new Date(`${date}T00:00:00Z`).getUTCDay();
}

function stateAt(shop: Shop, baseDay: number, minutes: number): OpenState {
  const dayOffset = Math.floor(minutes / (24 * 60));
  return openStateAt(shop.openingHours, (baseDay + dayOffset) % 7, minutes - dayOffset * 24 * 60);
}

/**
 * 到着・出発時刻を計算し、登録された営業時間と照合する。予定日・開始時刻が無い場合は null。
 * @param walkMinutes 区間ごとの移動時間（分）。外部サービスで取得した値があればそれを、無ければ概算を渡す
 */
export function buildSchedule(
  route: PlannedRoute,
  shops: readonly Shop[],
  points: readonly RoutePoint[],
  walkMinutes: readonly number[],
  walkSource: Schedule['walkSource'],
): Schedule | null {
  if (!route.plannedDate || !route.startTime) return null;
  const start = parseMinutes(route.startTime);
  if (start === null || !DATE_RE.test(route.plannedDate)) return null;
  const baseDay = dayOfWeekOf(route.plannedDate);
  let t = start;
  const stops: StopSchedule[] = [];
  points.forEach((p, i) => {
    if (i > 0) t += walkMinutes[i - 1] ?? 0;
    if (p.kind !== 'shop') return;
    const shop = shops.find((s) => s.id === p.id);
    if (!shop) return;
    const arrival = t;
    const departure = t + stayMinutesOf(route, shop.id);
    const atArrival = stateAt(shop, baseDay, arrival);
    const beforeLeaving = stateAt(shop, baseDay, Math.max(arrival, departure - 1));
    const openCheck: OpenState =
      atArrival === 'closed' || beforeLeaving === 'closed'
        ? 'closed'
        : atArrival === 'open' && beforeLeaving === 'open'
          ? 'open'
          : 'unknown';
    stops.push({ shopId: shop.id, arrivalMinutes: arrival, departureMinutes: departure, openCheck });
    t = departure;
  });
  return { stops, endMinutes: t, walkSource };
}

/** 分を「19:30」「翌1:10」の形式にする */
export function formatClock(minutes: number): string {
  const day = Math.floor(minutes / (24 * 60));
  const m = minutes - day * 24 * 60;
  const text = `${Math.floor(m / 60)}:${String(m % 60).padStart(2, '0')}`;
  return day === 0 ? text : `${'翌'.repeat(day)}${text}`;
}

export function formatDuration(minutes: number): string {
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  return h ? `${h}時間${m ? `${m}分` : ''}` : `${m}分`;
}

export function formatDistance(meters: number): string {
  return meters >= 1000 ? `${(meters / 1000).toFixed(1)}km` : `${Math.round(meters / 10) * 10}m`;
}
