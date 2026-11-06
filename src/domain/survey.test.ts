import { circleRing, distanceMeters } from './geo';
import { isInSurveyArea, validateSurveyArea, type SurveyArea } from './survey';

const valid: SurveyArea = {
  id: 'a1',
  name: '架空駅周辺',
  centerLatitude: 35.7,
  centerLongitude: 139.7,
  radiusM: 400,
  surveyedAt: '2026-10-29',
  scope: '立ち呑み',
  notes: '',
  createdAt: '2026-10-29T00:00:00.000Z',
  updatedAt: '2026-10-29T00:00:00.000Z',
};

describe('調査済みエリア', () => {
  it('検証', () => {
    expect(validateSurveyArea(valid).errors).toEqual([]);
    const { errors } = validateSurveyArea({
      ...valid,
      name: '',
      radiusM: 10,
      surveyedAt: '',
      centerLatitude: Number.NaN,
    });
    expect(errors).toHaveLength(4);
    expect(validateSurveyArea(null).errors).toHaveLength(1);
  });

  it('エリア内の判定', () => {
    expect(isInSurveyArea(35.7, 139.7, [valid])).toBe(true);
    expect(isInSurveyArea(35.71, 139.7, [valid])).toBe(false);
    expect(isInSurveyArea(35.7, 139.7, [])).toBe(false);
  });

  it('円の多角形は中心から指定距離にある閉じたリング', () => {
    const ring = circleRing(35.7, 139.7, 500, 16);
    expect(ring).toHaveLength(17);
    expect(ring[0]).toEqual(ring[16]);
    for (const [lng, lat] of ring) expect(distanceMeters(35.7, 139.7, lat, lng)).toBeCloseTo(500, 0);
  });
});
