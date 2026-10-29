import type { Page } from '@playwright/test';

/** OpenFreeMap の代わりに返す、外部通信を一切必要としないテスト用スタイル */
export const FIXTURE_STYLE = {
  version: 8,
  name: 'e2e-fixture',
  sources: {
    'fixture-area': {
      type: 'geojson',
      attribution: 'E2E fixture',
      data: {
        type: 'Feature',
        properties: {},
        geometry: {
          type: 'Polygon',
          coordinates: [
            [
              [139.6, 35.6],
              [139.9, 35.6],
              [139.9, 35.9],
              [139.6, 35.9],
              [139.6, 35.6],
            ],
          ],
        },
      },
    },
  },
  layers: [
    { id: 'bg', type: 'background', paint: { 'background-color': '#222833' } },
    { id: 'area', type: 'fill', source: 'fixture-area', paint: { 'fill-color': '#3b4252' } },
  ],
};

/**
 * OpenMapTiles 形式のベクタータイルソースを持つスタイル。
 * タイル本体は空（0バイト＝地物なし）で返し、3D建物レイヤーの追加処理がブラウザ上で成立するかを検証する。
 */
export const FIXTURE_STYLE_WITH_BUILDINGS = {
  ...FIXTURE_STYLE,
  sources: {
    ...FIXTURE_STYLE.sources,
    openmaptiles: {
      type: 'vector',
      tiles: ['https://tiles.openfreemap.org/planet/test/{z}/{x}/{y}.pbf'],
      minzoom: 0,
      maxzoom: 14,
    },
  },
  layers: [
    ...FIXTURE_STYLE.layers,
    {
      id: 'building-3d',
      type: 'fill-extrusion',
      source: 'openmaptiles',
      'source-layer': 'building',
      paint: { 'fill-extrusion-color': '#ff00ff', 'fill-extrusion-height': 10 },
    },
  ],
};

export const TILE_HOST_PATTERN = 'https://tiles.openfreemap.org/**';

export async function serveFixtureStyle(page: Page) {
  await page.route(TILE_HOST_PATTERN, (route) =>
    route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(FIXTURE_STYLE) }),
  );
}

export async function serveFixtureStyleWithBuildings(page: Page) {
  await page.route(TILE_HOST_PATTERN, (route) => {
    if (route.request().url().endsWith('.pbf')) {
      return route.fulfill({ status: 200, contentType: 'application/x-protobuf', body: Buffer.alloc(0) });
    }
    return route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify(FIXTURE_STYLE_WITH_BUILDINGS),
    });
  });
}

export async function blockTileHost(page: Page) {
  await page.route(TILE_HOST_PATTERN, (route) => route.abort('internetdisconnected'));
}

/** ステータスバーからズーム値を読む */
export async function readZoom(page: Page): Promise<number> {
  const text = await page.getByText(/^ズーム [\d.]+$/).textContent();
  return Number(text?.replace('ズーム ', ''));
}

export async function readPitch(page: Page): Promise<number> {
  const text = await page.getByText(/^傾き \d+°$/).textContent();
  return Number(text?.replace(/[^\d]/g, ''));
}
