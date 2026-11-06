/**
 * 調査済みエリア。
 *
 * 「このエリアは立ち呑み屋を一通り調べた」と利用者が記録した範囲。
 * 密度表示では、調査済みエリア内で店舗が0件の場所を「調査済み・0件」として表示し、
 * それ以外の場所（データが無い・未調査）と区別する（仕様書 4.5・16.3）。
 */
import { distanceMeters } from './geo';

export type SurveyArea = {
  id: string;
  name: string;
  centerLatitude: number;
  centerLongitude: number;
  radiusM: number;
  /** 調査した日（YYYY-MM-DD） */
  surveyedAt: string;
  /** 調査した対象（例：立ち呑み・角打ちを現地で一通り確認） */
  scope: string;
  notes: string;
  createdAt: string;
  updatedAt: string;
};

export const SURVEY_RADIUS_MIN_M = 50;
export const SURVEY_RADIUS_MAX_M = 3000;

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

export function validateSurveyArea(value: unknown): { errors: string[] } {
  const errors: string[] = [];
  if (!value || typeof value !== 'object') return { errors: ['調査済みエリアのデータがオブジェクトではありません。'] };
  const a = value as Record<string, unknown>;
  if (typeof a.id !== 'string' || !a.id) errors.push('IDがありません。');
  if (typeof a.name !== 'string' || !a.name.trim()) errors.push('エリア名は必須です。');
  if (
    typeof a.centerLatitude !== 'number' ||
    typeof a.centerLongitude !== 'number' ||
    !Number.isFinite(a.centerLatitude) ||
    !Number.isFinite(a.centerLongitude) ||
    Math.abs(a.centerLatitude) > 90 ||
    Math.abs(a.centerLongitude) > 180
  ) {
    errors.push('中心の座標が不正です。');
  }
  if (
    typeof a.radiusM !== 'number' ||
    !Number.isFinite(a.radiusM) ||
    a.radiusM < SURVEY_RADIUS_MIN_M ||
    a.radiusM > SURVEY_RADIUS_MAX_M
  ) {
    errors.push(`半径は ${SURVEY_RADIUS_MIN_M}〜${SURVEY_RADIUS_MAX_M}m で指定してください。`);
  }
  if (typeof a.surveyedAt !== 'string' || !DATE_RE.test(a.surveyedAt)) errors.push('調査日は必須です（YYYY-MM-DD）。');
  if (typeof a.scope !== 'string') errors.push('調査対象の形式が不正です。');
  if (typeof a.notes !== 'string') errors.push('メモの形式が不正です。');
  return { errors };
}

export function isInSurveyArea(latitude: number, longitude: number, areas: readonly SurveyArea[]): boolean {
  return areas.some((a) => distanceMeters(latitude, longitude, a.centerLatitude, a.centerLongitude) <= a.radiusM);
}
