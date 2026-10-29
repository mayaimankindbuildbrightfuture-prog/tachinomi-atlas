import { validateStyleMin } from '@maplibre/maplibre-gl-style-spec';
import type { StyleSpecification } from 'maplibre-gl';
import { makeShop } from '../../tests/fixtures';
import {
  SHOP_SOURCE_ID,
  buildClusterCountLayer,
  buildClusterLayer,
  buildHitLayer,
  buildLabelLayer,
  buildPointLayer,
  buildSelectedHaloLayer,
  buildShopSource,
  pickTextFont,
  shopsToFeatureCollection,
} from './shopLayers';

describe('shopsToFeatureCollection', () => {
  it('座標を [経度, 緯度] の順にし、代表ジャンルを付与する', () => {
    const fc = shopsToFeatureCollection([makeShop({ latitude: 35.1, longitude: 139.2, categories: ['oden', 'sake'] })]);
    expect(fc.features[0]!.geometry.coordinates).toEqual([139.2, 35.1]);
    expect(fc.features[0]!.properties.category).toBe('oden');
  });
});

describe('店舗レイヤー', () => {
  it('MapLibre のスタイル仕様として妥当', () => {
    const style: StyleSpecification = {
      version: 8,
      glyphs: 'https://example.invalid/fonts/{fontstack}/{range}.pbf',
      sources: { [SHOP_SOURCE_ID]: buildShopSource(shopsToFeatureCollection([makeShop()])) },
      layers: [
        buildClusterLayer(),
        buildClusterCountLayer(['Noto Sans Regular']),
        buildSelectedHaloLayer('test-shop-a'),
        buildPointLayer(),
        buildHitLayer(),
        buildLabelLayer(['Noto Sans Regular']),
      ],
    };
    expect(validateStyleMin(style)).toEqual([]);
  });

  it('文字フォントは既存のラベルから流用する', () => {
    expect(pickTextFont([{ type: 'fill' }, { type: 'symbol', layout: { 'text-font': ['Noto Sans Bold'] } }])).toEqual([
      'Noto Sans Bold',
    ]);
    expect(pickTextFont([])).toEqual(['Noto Sans Regular']);
  });
});
