import type { LayerSpecification, StyleSpecification } from 'maplibre-gl';
import { validateStyleMin } from '@maplibre/maplibre-gl-style-spec';
import {
  BUILDINGS_3D_LAYER_ID,
  JAPANESE_NAME_EXPRESSION,
  OFFLINE_FALLBACK_STYLE,
  buildBuildings3DLayer,
  findBuildingSourceId,
  findExistingBuildingExtrusionIds,
  findBuildingInsertBeforeId,
  localizeLabelLayers,
} from './layers';
import { BUILDING_MIN_ZOOM } from './mapConfig';

function style(layers: LayerSpecification[], sources: StyleSpecification['sources'] = {}): StyleSpecification {
  return { version: 8, sources, layers };
}

const omtSources: StyleSpecification['sources'] = {
  openmaptiles: { type: 'vector', url: 'https://example.invalid/planet' },
};

describe('findBuildingSourceId', () => {
  it('building ソースレイヤーを参照しているレイヤーからソースIDを得る', () => {
    const s = style([{ id: 'b', type: 'fill', source: 'omt2', 'source-layer': 'building' }], {
      omt2: { type: 'vector', url: 'https://example.invalid/x' },
    });
    expect(findBuildingSourceId(s)).toBe('omt2');
  });

  it('建物レイヤーが無くても openmaptiles ソースがあれば使う', () => {
    expect(findBuildingSourceId(style([], omtSources))).toBe('openmaptiles');
  });

  it('ベクタータイルが無いスタイルでは null', () => {
    expect(findBuildingSourceId(OFFLINE_FALLBACK_STYLE)).toBeNull();
  });
});

describe('findExistingBuildingExtrusionIds', () => {
  it('既存の建物立体レイヤーのみを返し、自前のレイヤーは除外する', () => {
    const s = style(
      [
        { id: 'building', type: 'fill', source: 'openmaptiles', 'source-layer': 'building' },
        { id: 'building-3d', type: 'fill-extrusion', source: 'openmaptiles', 'source-layer': 'building' },
        buildBuildings3DLayer('openmaptiles'),
      ],
      omtSources,
    );
    expect(findExistingBuildingExtrusionIds(s)).toEqual(['building-3d']);
  });
});

describe('findBuildingInsertBeforeId', () => {
  it('平面の建物レイヤーより後で、最初の文字ラベルの前に入れる', () => {
    const s = style(
      [
        { id: 'bg', type: 'background' },
        { id: 'label-early', type: 'symbol', source: 'openmaptiles', 'source-layer': 'water_name' },
        { id: 'building', type: 'fill', source: 'openmaptiles', 'source-layer': 'building' },
        { id: 'road', type: 'line', source: 'openmaptiles', 'source-layer': 'transportation' },
        { id: 'label-a', type: 'symbol', source: 'openmaptiles', 'source-layer': 'place' },
        { id: 'label-b', type: 'symbol', source: 'openmaptiles', 'source-layer': 'place' },
      ],
      omtSources,
    );
    expect(findBuildingInsertBeforeId(s)).toBe('label-a');
  });

  it('建物レイヤーが無ければ最初の文字ラベルの前', () => {
    const s = style([
      { id: 'bg', type: 'background' },
      { id: 'label-a', type: 'symbol', source: 'openmaptiles', 'source-layer': 'place' },
    ]);
    expect(findBuildingInsertBeforeId(s)).toBe('label-a');
  });

  it('後ろに文字ラベルが無ければ undefined（最前面に追加）', () => {
    expect(findBuildingInsertBeforeId(OFFLINE_FALLBACK_STYLE)).toBeUndefined();
  });
});

describe('buildBuildings3DLayer', () => {
  it('MapLibre のスタイル仕様として妥当', () => {
    const s = style([buildBuildings3DLayer('openmaptiles')], omtSources);
    expect(validateStyleMin(s)).toEqual([]);
  });

  it('指定ズーム以上でのみ描画する', () => {
    const layer = buildBuildings3DLayer('openmaptiles');
    expect(layer.id).toBe(BUILDINGS_3D_LAYER_ID);
    expect(layer.minzoom).toBe(BUILDING_MIN_ZOOM);
    expect(layer['source-layer']).toBe('building');
  });
});

describe('localizeLabelLayers', () => {
  it('name を参照するラベルを日本語優先に置き換える', () => {
    const layers: LayerSpecification[] = [
      {
        id: 'place',
        type: 'symbol',
        source: 'openmaptiles',
        'source-layer': 'place',
        layout: { 'text-field': '{name:latin}\n{name:nonlatin}' },
      },
    ];
    const [out] = localizeLabelLayers(layers);
    expect(out?.type === 'symbol' && out.layout?.['text-field']).toEqual(JAPANESE_NAME_EXPRESSION);
  });

  it('道路番号など name を使わないラベルや symbol 以外は変更しない', () => {
    const layers: LayerSpecification[] = [
      {
        id: 'shield',
        type: 'symbol',
        source: 'openmaptiles',
        'source-layer': 'transportation_name',
        layout: { 'text-field': '{ref}' },
      },
      { id: 'icon-only', type: 'symbol', source: 'openmaptiles', 'source-layer': 'poi', layout: { 'icon-image': 'x' } },
      { id: 'bg', type: 'background' },
    ];
    const out = localizeLabelLayers(layers);
    out.forEach((l, i) => expect(l).toBe(layers[i]));
  });
});

describe('OFFLINE_FALLBACK_STYLE', () => {
  it('外部 URL を含まない妥当なスタイル', () => {
    expect(validateStyleMin(OFFLINE_FALLBACK_STYLE)).toEqual([]);
    expect(JSON.stringify(OFFLINE_FALLBACK_STYLE)).not.toMatch(/https?:/);
  });
});
