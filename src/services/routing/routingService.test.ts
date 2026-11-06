import { ORS_ENDPOINT, RoutingError, fetchOrsWalkingRoute, parseOrsResponse, routeCacheKey } from './routingService';

const points = [
  { latitude: 35.7, longitude: 139.7 },
  { latitude: 35.701, longitude: 139.701 },
  { latitude: 35.702, longitude: 139.703 },
];

const okBody = {
  type: 'FeatureCollection',
  features: [
    {
      type: 'Feature',
      geometry: {
        type: 'LineString',
        coordinates: [
          [139.7, 35.7],
          [139.7005, 35.7006],
          [139.701, 35.701],
          [139.703, 35.702],
        ],
      },
      properties: {
        segments: [
          { distance: 160.5, duration: 115.2 },
          { distance: 240, duration: 173 },
        ],
      },
    },
  ],
};

const fetchReturning = (status: number, body: unknown) =>
  vi.fn(async () => new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } }));

describe('fetchOrsWalkingRoute', () => {
  it('座標を [経度, 緯度] で送り、区間ごとの道のりと所要時間を返す', async () => {
    const f = fetchReturning(200, okBody);
    const r = await fetchOrsWalkingRoute(points, ' my-key ', f as unknown as typeof fetch);
    expect(r.legs).toEqual([
      { distanceM: 160.5, durationMinutes: 2 },
      { distanceM: 240, durationMinutes: 3 },
    ]);
    expect(r.geometry).toHaveLength(4);
    const [url, init] = f.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe(ORS_ENDPOINT);
    expect((init.headers as Record<string, string>).Authorization).toBe('my-key');
    expect(JSON.parse(init.body as string).coordinates[0]).toEqual([139.7, 35.7]);
  });

  it('送信前に検証する（キー無し・地点不足）', async () => {
    const f = vi.fn();
    await expect(fetchOrsWalkingRoute(points, '', f)).rejects.toThrow('API キーが設定されていません');
    await expect(fetchOrsWalkingRoute(points.slice(0, 1), 'k', f)).rejects.toThrow('2地点以上');
    expect(f).not.toHaveBeenCalled();
  });

  it.each([
    [401, 'API キーが正しくない'],
    [403, 'API キーが正しくない'],
    [429, '利用回数の上限'],
    [404, '経路が見つかりません'],
    [500, 'HTTP 500'],
  ])('HTTP %i は日本語のエラーにする', async (status, message) => {
    await expect(
      fetchOrsWalkingRoute(points, 'k', fetchReturning(status, {}) as unknown as typeof fetch),
    ).rejects.toThrow(message);
  });

  it('接続できない場合', async () => {
    const f = vi.fn(async () => {
      throw new TypeError('Failed to fetch');
    });
    const err = await fetchOrsWalkingRoute(points, 'k', f as unknown as typeof fetch).catch((e: unknown) => e);
    expect(err).toBeInstanceOf(RoutingError);
    expect((err as Error).message).toContain('接続できませんでした');
    expect(f).toHaveBeenCalledTimes(1); // 自動で再試行しない
  });

  it('想定外の応答形式は拒否する', () => {
    expect(() => parseOrsResponse({ features: [] }, 2)).toThrow('形式');
    expect(() =>
      parseOrsResponse({ ...okBody, features: [{ ...okBody.features[0], properties: { segments: [] } }] }, 2),
    ).toThrow('形式');
  });

  it('同じ地点の並びは同じキー', () => {
    expect(routeCacheKey(points)).toBe(routeCacheKey([...points]));
    expect(routeCacheKey(points)).not.toBe(routeCacheKey([...points].reverse()));
  });
});
