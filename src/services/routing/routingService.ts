/**
 * 徒歩経路の取得（仕様書 10.2・F-16）。
 *
 * 既定では外部サービスを使わず、直線距離と概算のみを表示する（domain/route.ts）。
 * 利用者が openrouteservice の API キーを設定し、「徒歩ルートを取得」を押したときだけ、
 * ルート上の地点（店舗・駅）の座標を openrouteservice に送信する。個人記録は送信しない。
 *
 * openrouteservice：https://openrouteservice.org/ （無料の Standard プランは API キーが必要。
 * 経路検索は1日2,000回・1分40回まで、経由地は50地点まで。2026-10-29 に Web 検索で確認）
 */

export type RoutingProvider = 'none' | 'openrouteservice';

export type RoutingSettings = {
  provider: RoutingProvider;
  /** 利用者自身の API キー。ブラウザ内にのみ保存し、バックアップには含めない */
  orsApiKey: string;
};

export const DEFAULT_ROUTING_SETTINGS: RoutingSettings = { provider: 'none', orsApiKey: '' };

export const ORS_ENDPOINT = 'https://api.openrouteservice.org/v2/directions/foot-walking/geojson';
export const ORS_MAX_POINTS = 50;
export const ORS_ATTRIBUTION = '経路：openrouteservice.org by HeiGIT／地図データ © OpenStreetMap contributors';
const TIMEOUT_MS = 15_000;

export type WalkingRoute = {
  provider: 'openrouteservice';
  attribution: string;
  /** 区間ごとの道のりと所要時間 */
  legs: { distanceM: number; durationMinutes: number }[];
  /** 経路の線（[経度, 緯度]） */
  geometry: [number, number][];
};

export class RoutingError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'RoutingError';
  }
}

type Point = { latitude: number; longitude: number };

/** 同じ地点の並びに対する結果を再利用するためのキー */
export function routeCacheKey(points: readonly Point[]): string {
  return points.map((p) => `${p.longitude.toFixed(6)},${p.latitude.toFixed(6)}`).join(';');
}

/**
 * openrouteservice で徒歩経路を取得する。失敗しても自動で再試行はしない。
 */
export async function fetchOrsWalkingRoute(
  points: readonly Point[],
  apiKey: string,
  fetchImpl: typeof fetch = fetch,
): Promise<WalkingRoute> {
  if (!apiKey.trim()) throw new RoutingError('openrouteservice の API キーが設定されていません。');
  if (points.length < 2) throw new RoutingError('経路を求めるには2地点以上が必要です。');
  if (points.length > ORS_MAX_POINTS)
    throw new RoutingError(`openrouteservice で一度に扱える地点は${ORS_MAX_POINTS}までです。`);

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
  let res: Response;
  try {
    res = await fetchImpl(ORS_ENDPOINT, {
      method: 'POST',
      headers: { Authorization: apiKey.trim(), 'Content-Type': 'application/json', Accept: 'application/geo+json' },
      body: JSON.stringify({ coordinates: points.map((p) => [p.longitude, p.latitude]), units: 'm' }),
      signal: controller.signal,
    });
  } catch (e) {
    const aborted = e instanceof DOMException && e.name === 'AbortError';
    throw new RoutingError(
      aborted
        ? 'openrouteservice の応答がありませんでした（タイムアウト）。時間をおいて再度お試しください。'
        : 'openrouteservice に接続できませんでした。インターネット接続を確認してください。',
    );
  } finally {
    clearTimeout(timer);
  }

  if (!res.ok) {
    const reason =
      res.status === 401 || res.status === 403
        ? 'API キーが正しくないか、徒歩経路の利用が許可されていません。キーを確認してください。'
        : res.status === 429
          ? '利用回数の上限に達しました（無料プランは1日2,000回・1分40回まで）。時間をおいて再度お試しください。'
          : res.status === 404
            ? '経路が見つかりませんでした。店舗の位置が道路から離れすぎている可能性があります。'
            : `openrouteservice がエラーを返しました（HTTP ${res.status}）。`;
    throw new RoutingError(reason);
  }

  let json: unknown;
  try {
    json = await res.json();
  } catch {
    throw new RoutingError('openrouteservice の応答を読み取れませんでした。');
  }
  return parseOrsResponse(json, points.length - 1);
}

/** 応答の形式を検証して必要な値だけを取り出す */
export function parseOrsResponse(json: unknown, expectedLegs: number): WalkingRoute {
  const feature = (json as { features?: unknown[] } | null)?.features?.[0] as
    { geometry?: { type?: string; coordinates?: unknown }; properties?: { segments?: unknown } } | undefined;
  const coords = feature?.geometry?.type === 'LineString' ? feature.geometry.coordinates : null;
  const segments = feature?.properties?.segments;
  const valid =
    Array.isArray(coords) &&
    coords.every(
      (c) => Array.isArray(c) && c.length >= 2 && c.every((n) => typeof n === 'number' && Number.isFinite(n)),
    ) &&
    Array.isArray(segments) &&
    segments.length === expectedLegs &&
    segments.every(
      (s) =>
        s &&
        typeof s === 'object' &&
        typeof (s as { distance?: unknown }).distance === 'number' &&
        typeof (s as { duration?: unknown }).duration === 'number',
    );
  if (!valid) throw new RoutingError('openrouteservice の応答の形式が想定と異なります。');
  return {
    provider: 'openrouteservice',
    attribution: ORS_ATTRIBUTION,
    legs: (segments as { distance: number; duration: number }[]).map((s) => ({
      distanceM: s.distance,
      durationMinutes: Math.max(1, Math.round(s.duration / 60)),
    })),
    geometry: (coords as number[][]).map((c) => [c[0]!, c[1]!] as [number, number]),
  };
}
