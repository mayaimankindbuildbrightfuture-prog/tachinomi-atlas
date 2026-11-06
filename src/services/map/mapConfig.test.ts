import {
  DEFAULT_STYLE_ID,
  INITIAL_CAMERA,
  MAP_STYLES,
  MAX_PITCH,
  REGION_PRESETS,
  getRegionPreset,
  getStyleOption,
} from './mapConfig';

const all = getRegionPreset('all').bounds;
const inside = (lng: number, lat: number) =>
  lng >= all[0][0] && lng <= all[1][0] && lat >= all[0][1] && lat <= all[1][1];

describe('mapConfig', () => {
  it('既定スタイルが一覧に存在し、URL は HTTPS で APIキーを含まない', () => {
    expect(getStyleOption(DEFAULT_STYLE_ID).id).toBe(DEFAULT_STYLE_ID);
    for (const s of MAP_STYLES) {
      expect(s.url).toMatch(/^https:\/\//);
      expect(s.url).not.toMatch(/key=|token=/i);
    }
  });

  it('スタイルIDは重複しない', () => {
    expect(new Set(MAP_STYLES.map((s) => s.id)).size).toBe(MAP_STYLES.length);
  });

  it('初期表示の中心は東京都・埼玉県の範囲内', () => {
    expect(inside(...INITIAL_CAMERA.center)).toBe(true);
    expect(INITIAL_CAMERA.pitch).toBeLessThanOrEqual(MAX_PITCH);
  });

  it('各地域の範囲は南西 < 北東 で、全域の範囲内に収まる', () => {
    for (const r of REGION_PRESETS) {
      const [[w, s], [e, n]] = r.bounds;
      expect(w).toBeLessThan(e);
      expect(s).toBeLessThan(n);
      expect(inside(w, s) && inside(e, n)).toBe(true);
    }
  });

  it('主要地点が全域に含まれる（新宿・大宮・秩父・八王子）', () => {
    expect(inside(139.7, 35.69)).toBe(true);
    expect(inside(139.62, 35.906)).toBe(true);
    expect(inside(139.085, 35.992)).toBe(true);
    expect(inside(139.339, 35.666)).toBe(true);
  });

  it('未知のIDは例外', () => {
    // @ts-expect-error 型外の値を意図的に渡す
    expect(() => getRegionPreset('osaka')).toThrow();
  });
});
