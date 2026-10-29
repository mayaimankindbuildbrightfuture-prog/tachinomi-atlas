#!/usr/bin/env node
/**
 * 国土数値情報の「鉄道データ（N02）」と「行政区域データ（N03）」から、
 * 東京都・埼玉県の駅データ（src/data/stations.json）を生成する。
 *
 * 使い方（データは国土数値情報ダウンロードサイトから取得し、展開しておく）:
 *   node scripts/build-stations.mjs <N02_Station.geojson> <N03_東京都.geojson> <N03_埼玉県.geojson> [出力先]
 *
 * - 同じ「駅グループコード（N02_005g）」を持つ駅（路線・事業者が違う同じ駅）を1駅にまとめる。
 * - 駅の座標は、グループ内の駅（ホームの線）の中点の平均。
 * - 都道府県・市区町村は、駅の座標が含まれる行政区域から判定する。島しょ部は対象外。
 */
import { readFileSync, writeFileSync } from 'node:fs';

const [stationPath, tokyoPath, saitamaPath, outPath = 'src/data/stations.json'] = process.argv.slice(2);
if (!stationPath || !tokyoPath || !saitamaPath) {
  console.error(
    '使い方: node scripts/build-stations.mjs <N02_Station.geojson> <N03_13.geojson> <N03_11.geojson> [出力先]',
  );
  process.exit(1);
}

const SOURCE_ID = 'src-ksj-n02-2024';
const readJson = (p) => JSON.parse(readFileSync(p, 'utf8'));

/** LineString / MultiLineString の全頂点の中点（両端の平均）を求める */
function lineMidpoint(geometry) {
  const lines = geometry.type === 'LineString' ? [geometry.coordinates] : geometry.coordinates;
  const pts = lines.flat();
  const first = pts[0];
  const last = pts[pts.length - 1];
  return [(first[0] + last[0]) / 2, (first[1] + last[1]) / 2];
}

function ringContains(ring, [x, y]) {
  let inside = false;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const [xi, yi] = ring[i];
    const [xj, yj] = ring[j];
    if (yi > y !== yj > y && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) inside = !inside;
  }
  return inside;
}

function polygonContains(rings, pt) {
  if (!ringContains(rings[0], pt)) return false;
  return !rings.slice(1).some((hole) => ringContains(hole, pt));
}

function prepareAreas(geojson) {
  return geojson.features
    .filter((f) => f.geometry && f.properties.N03_004 && f.properties.N03_004 !== '所属未定地')
    .map((f) => {
      const polys = f.geometry.type === 'Polygon' ? [f.geometry.coordinates] : f.geometry.coordinates;
      let minX = Infinity,
        minY = Infinity,
        maxX = -Infinity,
        maxY = -Infinity;
      for (const poly of polys)
        for (const [x, y] of poly[0]) {
          minX = Math.min(minX, x);
          maxX = Math.max(maxX, x);
          minY = Math.min(minY, y);
          maxY = Math.max(maxY, y);
        }
      const p = f.properties;
      // 政令指定都市の区（N03_005）がある場合は「さいたま市大宮区」のように市名＋区名にする
      const municipality = p.N03_005 ? `${p.N03_004}${p.N03_005}` : p.N03_004;
      return { prefecture: p.N03_001, municipality, polys, bbox: [minX, minY, maxX, maxY] };
    });
}

const areas = [...prepareAreas(readJson(tokyoPath)), ...prepareAreas(readJson(saitamaPath))];

function locate(pt) {
  for (const a of areas) {
    const [minX, minY, maxX, maxY] = a.bbox;
    if (pt[0] < minX || pt[0] > maxX || pt[1] < minY || pt[1] > maxY) continue;
    if (a.polys.some((poly) => polygonContains(poly, pt))) return a;
  }
  return null;
}

const groups = new Map();
for (const f of readJson(stationPath).features) {
  const p = f.properties;
  const key = p.N02_005g || p.N02_005c;
  const g = groups.get(key) ?? { names: new Set(), lines: new Set(), points: [] };
  g.names.add(p.N02_005);
  g.lines.add(`${p.N02_004} ${p.N02_003}`);
  g.points.push(lineMidpoint(f.geometry));
  groups.set(key, g);
}

const stations = [];
for (const [key, g] of groups) {
  const lng = g.points.reduce((s, p) => s + p[0], 0) / g.points.length;
  const lat = g.points.reduce((s, p) => s + p[1], 0) / g.points.length;
  // 本土のみ（島しょ部を除外するため緯度で足切り）
  if (lat < 35.4 || lat > 36.4 || lng < 138.6 || lng > 140.0) continue;
  const area = locate([lng, lat]);
  if (!area) continue;
  stations.push({
    id: `ksj-n02-${key}`,
    name: [...g.names].join('・'),
    latitude: Math.round(lat * 1e6) / 1e6,
    longitude: Math.round(lng * 1e6) / 1e6,
    prefecture: area.prefecture,
    municipality: area.municipality,
    lines: [...g.lines].sort((a, b) => a.localeCompare(b, 'ja')),
  });
}
stations.sort(
  (a, b) =>
    a.prefecture.localeCompare(b.prefecture, 'ja') || a.name.localeCompare(b.name, 'ja') || a.id.localeCompare(b.id),
);

const out = {
  schemaVersion: 1,
  attribution:
    '駅データは国土数値情報（鉄道データ N02 令和6年度・行政区域データ N03 令和7年）をもとに作成（国土交通省、CC BY 4.0）。scripts/build-stations.mjs で加工。',
  sourceId: SOURCE_ID,
  stations,
};
writeFileSync(outPath, `${JSON.stringify(out, null, 2)}\n`);
console.log(`${stations.length} 駅を ${outPath} に出力しました`);
