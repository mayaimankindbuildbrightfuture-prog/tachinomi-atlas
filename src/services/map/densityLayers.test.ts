import { validateStyleMin } from '@maplibre/maplibre-gl-style-spec';
import type { StyleSpecification } from 'maplibre-gl';
import { buildDensityGrid } from '../../domain/density';
import { makeShop, testStation } from '../../tests/fixtures';
import {
  DENSITY_LAYER_IDS,
  DISPLAY_MODES,
  GRID_SOURCE_ID,
  RAW_SOURCE_ID,
  STATION_SOURCE_ID,
  SURVEY_SOURCE_ID,
  buildCategoryPointLayer,
  buildGrid3dLayer,
  buildGridZeroLayer,
  buildHeatmapLayer,
  buildPricePointLayer,
  buildStationLabelLayer,
  buildStationLayer,
  buildSurveyFillLayer,
  buildSurveyLineLayer,
  clickableShopLayers,
  layerVisibility,
  stationsToFeatureCollection,
  surveyAreasToFeatureCollection,
} from './densityLayers';
import { SHOP_LAYER_IDS, shopsToFeatureCollection } from './shopLayers';

describe('密度レイヤー', () => {
  it('MapLibre のスタイル仕様として妥当', () => {
    const style: StyleSpecification = {
      version: 8,
      glyphs: 'https://example.invalid/fonts/{fontstack}/{range}.pbf',
      sources: {
        [RAW_SOURCE_ID]: { type: 'geojson', data: shopsToFeatureCollection([makeShop()]) },
        [GRID_SOURCE_ID]: { type: 'geojson', data: buildDensityGrid([makeShop()], 500, []) },
        [SURVEY_SOURCE_ID]: { type: 'geojson', data: surveyAreasToFeatureCollection([]) },
        [STATION_SOURCE_ID]: { type: 'geojson', data: stationsToFeatureCollection([testStation]) },
      },
      layers: [
        buildSurveyFillLayer(),
        buildSurveyLineLayer(),
        buildGridZeroLayer(),
        buildGrid3dLayer(),
        buildHeatmapLayer(),
        buildStationLayer(),
        buildStationLabelLayer(['Noto Sans Regular']),
        buildCategoryPointLayer(),
        buildPricePointLayer(),
      ],
    };
    expect(validateStyleMin(style)).toEqual([]);
  });

  it('表示モードごとに、該当するレイヤーだけを表示する', () => {
    for (const { id } of DISPLAY_MODES) {
      const v = layerVisibility(id, false);
      expect(v[SHOP_LAYER_IDS.points]).toBe(id === 'markers');
      expect(v[DENSITY_LAYER_IDS.heatmap]).toBe(id === 'heatmap');
      expect(v[DENSITY_LAYER_IDS.grid3d]).toBe(id === 'grid');
      expect(v[DENSITY_LAYER_IDS.categoryPoints]).toBe(id === 'category');
      expect(v[DENSITY_LAYER_IDS.pricePoints]).toBe(id === 'priceLevel');
      expect(v[DENSITY_LAYER_IDS.surveyLine]).toBe(id === 'heatmap' || id === 'grid');
      expect(v[DENSITY_LAYER_IDS.stations]).toBe(false);
    }
    expect(layerVisibility('markers', true)[DENSITY_LAYER_IDS.stations]).toBe(true);
  });

  it('分布表示の点もクリックで店舗を選べる。密度表示では店舗を選ばない', () => {
    expect(clickableShopLayers('markers')).toContain(SHOP_LAYER_IDS.hit);
    expect(clickableShopLayers('category')).toEqual([DENSITY_LAYER_IDS.categoryPoints]);
    expect(clickableShopLayers('heatmap')).toEqual([]);
  });

  it('調査済みエリア・駅を GeoJSON に変換する', () => {
    const fc = surveyAreasToFeatureCollection([
      {
        id: 'a',
        name: 'x',
        centerLatitude: 35.7,
        centerLongitude: 139.7,
        radiusM: 300,
        surveyedAt: '2026-10-29',
        scope: '',
        notes: '',
        createdAt: '',
        updatedAt: '',
      },
    ]);
    expect(fc.features[0]!.geometry.type).toBe('Polygon');
    expect(stationsToFeatureCollection([testStation]).features[0]!.geometry.coordinates).toEqual([139.701, 35.701]);
  });
});
