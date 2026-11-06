/**
 * 初期データ（JSON）の読み込み検証と、ユーザーデータとの統合（仕様書 8.2）。
 */
import {
  validateCoordinates,
  validateDataSource,
  validateShop,
  type DataSource,
  type Shop,
  type Station,
} from './shop';

export const SEED_SCHEMA_VERSION = 1;

export type DatasetIssue = { id: string | null; messages: string[] };

export type ParsedDataset<T> = { items: T[]; issues: DatasetIssue[] };

function readArray(json: unknown, key: string): { version: unknown; list: unknown[] } {
  if (!json || typeof json !== 'object') throw new Error('初期データがオブジェクトではありません。');
  const obj = json as Record<string, unknown>;
  const list = obj[key];
  if (!Array.isArray(list)) throw new Error(`初期データに "${key}" 配列がありません。`);
  return { version: obj.schemaVersion, list };
}

function checkVersion(version: unknown) {
  if (version !== SEED_SCHEMA_VERSION) {
    throw new Error(
      `初期データのスキーマバージョン ${String(version)} には対応していません（対応: ${SEED_SCHEMA_VERSION}）。`,
    );
  }
}

function idOf(v: unknown): string | null {
  return v && typeof v === 'object' && typeof (v as { id?: unknown }).id === 'string' ? (v as { id: string }).id : null;
}

/** 妥当なものだけを取り込み、不正なもの・重複IDは issues として報告する */
function parseList<T>(list: unknown[], validate: (v: unknown) => { errors: string[] }): ParsedDataset<T> {
  const items: T[] = [];
  const issues: DatasetIssue[] = [];
  const seen = new Set<string>();
  for (const raw of list) {
    const id = idOf(raw);
    const { errors } = validate(raw);
    if (errors.length > 0) {
      issues.push({ id, messages: errors });
      continue;
    }
    if (id !== null && seen.has(id)) {
      issues.push({ id, messages: ['IDが重複しているため2件目以降を無視しました。'] });
      continue;
    }
    if (id !== null) seen.add(id);
    items.push(raw as T);
  }
  return { items, issues };
}

export function parseShopsJson(json: unknown): ParsedDataset<Shop> {
  const { version, list } = readArray(json, 'shops');
  checkVersion(version);
  return parseList<Shop>(list, validateShop);
}

export function parseSourcesJson(json: unknown): ParsedDataset<DataSource> {
  const { version, list } = readArray(json, 'sources');
  checkVersion(version);
  return parseList<DataSource>(list, validateDataSource);
}

export function validateStation(value: unknown): { errors: string[] } {
  const errors: string[] = [];
  if (!value || typeof value !== 'object') return { errors: ['駅データがオブジェクトではありません。'] };
  const s = value as Record<string, unknown>;
  if (typeof s.id !== 'string' || !s.id) errors.push('駅IDがありません。');
  if (typeof s.name !== 'string' || !s.name) errors.push('駅名がありません。');
  if (typeof s.latitude !== 'number' || typeof s.longitude !== 'number') errors.push('駅の座標がありません。');
  else errors.push(...validateCoordinates(s.latitude, s.longitude).errors);
  if (!Array.isArray(s.lines) || !s.lines.every((l) => typeof l === 'string')) errors.push('路線の形式が不正です。');
  return { errors };
}

export function parseStationsJson(json: unknown): ParsedDataset<Station> {
  const { version, list } = readArray(json, 'stations');
  checkVersion(version);
  return parseList<Station>(list, validateStation);
}

/** 参照先（出典・駅）が存在しないIDを報告する。データ自体は変更しない */
export function findDanglingReferences(
  shops: readonly Shop[],
  sources: readonly DataSource[],
  stations: readonly Station[],
): DatasetIssue[] {
  const sourceIds = new Set(sources.map((s) => s.id));
  const stationIds = new Set(stations.map((s) => s.id));
  const issues: DatasetIssue[] = [];
  for (const shop of shops) {
    const messages: string[] = [];
    const missingSources = [
      ...shop.sourceIds,
      ...shop.priceExamples.map((p) => p.sourceId).filter((x): x is string => x !== null),
    ].filter((id) => !sourceIds.has(id));
    if (missingSources.length) messages.push(`存在しない出典ID: ${[...new Set(missingSources)].join(', ')}`);
    const missingStations = shop.stationIds.filter((id) => !stationIds.has(id));
    if (missingStations.length) messages.push(`存在しない駅ID: ${missingStations.join(', ')}`);
    if (messages.length) issues.push({ id: shop.id, messages });
  }
  return issues;
}

/**
 * 初期データとユーザーデータを統合する。
 * - 同じIDはユーザーが保存した版を優先（初期データ更新でユーザーの編集が消えない）
 * - ユーザーが削除した初期データの店舗（tombstone）は除外
 */
export function mergeById<T extends { id: string }>(
  seed: readonly T[],
  user: readonly T[],
  deletedIds: readonly string[] = [],
): T[] {
  const deleted = new Set(deletedIds);
  const map = new Map<string, T>();
  for (const s of seed) if (!deleted.has(s.id)) map.set(s.id, s);
  for (const u of user) map.set(u.id, u);
  return [...map.values()];
}
