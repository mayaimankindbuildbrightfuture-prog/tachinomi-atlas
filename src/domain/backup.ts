/**
 * JSON の書き出し・読み込み（仕様書 8.3）。
 *
 * 読み込みは「解析・検証」と「保存」を分け、検証がすべて終わってからデータを変更する。
 * ここでは検証まで（純粋関数）を行い、保存は Repository が1つのトランザクションで行う。
 */
import { validateDataSource, validateShop, type DataSource, type Shop } from './shop';
import { validateSurveyArea, type SurveyArea } from './survey';
import { validateMark, validateVisit, type ShopMark, type Visit } from './visit';
import { validateRoute, type PlannedRoute } from './route';

export const BACKUP_FORMAT = 'tachinomi-atlas-backup';
export const BACKUP_VERSION = 1;

/** 読み込むファイルの上限（バイト） */
export const MAX_IMPORT_BYTES = 20 * 1024 * 1024;

export type BackupKind = 'full' | 'shops' | 'personal';

export const BACKUP_KIND_LABELS: Record<BackupKind, string> = {
  full: '全データのバックアップ',
  shops: '店舗データ',
  personal: '個人記録',
};

/** ユーザーデータ（ブラウザ内に保存されている部分）。初期データ（同梱 JSON）は含めない */
export type UserData = {
  shops: Shop[];
  deletedShopIds: string[];
  sources: DataSource[];
  visits: Visit[];
  marks: ShopMark[];
  surveyAreas: SurveyArea[];
  routes: PlannedRoute[];
};

export type BackupFile = {
  format: typeof BACKUP_FORMAT;
  version: typeof BACKUP_VERSION;
  kind: BackupKind;
  exportedAt: string;
  app: 'Tachinomi Atlas';
  /** 種類に応じて一部の項目のみを持つ */
  data: Partial<UserData>;
};

export const EMPTY_USER_DATA: UserData = {
  shops: [],
  deletedShopIds: [],
  sources: [],
  visits: [],
  marks: [],
  surveyAreas: [],
  routes: [],
};

/**
 * 書き出す内容を作る。
 * - shops：店舗データ（初期データ＋自分で追加・編集した店舗、すべての出典）と削除記録
 * - personal：訪問記録・お気に入り等・調査済みエリア
 * - full：ブラウザ内に保存されている全データ（初期データ自体は同梱されているため含めない）
 */
export function buildBackup(
  kind: BackupKind,
  user: UserData,
  allShops: readonly Shop[],
  allSources: readonly DataSource[],
  exportedAt: string,
): BackupFile {
  const data: Partial<UserData> =
    kind === 'shops'
      ? { shops: [...allShops], sources: [...allSources], deletedShopIds: user.deletedShopIds }
      : kind === 'personal'
        ? { visits: user.visits, marks: user.marks, surveyAreas: user.surveyAreas, routes: user.routes }
        : { ...user };
  return { format: BACKUP_FORMAT, version: BACKUP_VERSION, kind, exportedAt, app: 'Tachinomi Atlas', data };
}

export function backupFileName(kind: BackupKind, exportedAt: string): string {
  const stamp = exportedAt.slice(0, 16).replace(/[-:T]/g, '');
  const name = { full: 'backup', shops: 'shops', personal: 'personal' }[kind];
  return `tachinomi-atlas-${name}-${stamp}.json`;
}

export type ImportPreview = {
  kind: BackupKind;
  exportedAt: string | null;
  data: UserData;
  /** 1件でもあれば読み込まない */
  errors: string[];
  /** 確認のうえ読み込める注意点 */
  warnings: string[];
  /** 参照先の店舗が見つからない訪問記録・お気に入り等のID */
  danglingVisitIds: string[];
  danglingMarkShopIds: string[];
};

function list(value: unknown, label: string, errors: string[]): unknown[] {
  if (value === undefined) return [];
  if (!Array.isArray(value)) {
    errors.push(`「${label}」が配列ではありません。`);
    return [];
  }
  return value;
}

function checkItems<T>(
  items: unknown[],
  label: string,
  idOf: (x: Record<string, unknown>) => unknown,
  validate: (x: unknown) => { errors: string[] },
  errors: string[],
): T[] {
  const seen = new Set<string>();
  const MAX_REPORT = 10;
  let reported = 0;
  items.forEach((item, i) => {
    const r = validate(item);
    const id = item && typeof item === 'object' ? idOf(item as Record<string, unknown>) : undefined;
    const where = `${label} ${i + 1}件目${typeof id === 'string' ? `（${id}）` : ''}`;
    if (r.errors.length) {
      if (reported++ < MAX_REPORT) errors.push(`${where}：${r.errors.join(' ')}`);
      return;
    }
    if (typeof id === 'string') {
      if (seen.has(id)) {
        if (reported++ < MAX_REPORT) errors.push(`${where}：IDが重複しています。`);
      }
      seen.add(id);
    }
  });
  if (reported > MAX_REPORT) errors.push(`${label}にはほかにも ${reported - MAX_REPORT} 件の問題があります。`);
  return items as T[];
}

/**
 * 読み込むファイルを解析・検証する。データベースは変更しない。
 * @param knownShopIds 既存の店舗（初期データ＋保存済み）のID。参照先不明の記録の判定に使う
 */
export function parseBackup(text: string, knownShopIds: ReadonlySet<string>): ImportPreview {
  const errors: string[] = [];
  const warnings: string[] = [];
  const empty: ImportPreview = {
    kind: 'full',
    exportedAt: null,
    data: { ...EMPTY_USER_DATA },
    errors,
    warnings,
    danglingVisitIds: [],
    danglingMarkShopIds: [],
  };

  if (new Blob([text]).size > MAX_IMPORT_BYTES) {
    errors.push(`ファイルが大きすぎます（上限 ${MAX_IMPORT_BYTES / 1024 / 1024}MB）。`);
    return empty;
  }
  let json: unknown;
  try {
    json = JSON.parse(text);
  } catch {
    errors.push('JSON として読み込めませんでした。ファイルが壊れていないか確認してください。');
    return empty;
  }
  if (!json || typeof json !== 'object' || Array.isArray(json)) {
    errors.push('立ち呑み地形図のバックアップ形式ではありません。');
    return empty;
  }
  const file = json as Record<string, unknown>;
  if (file.format !== BACKUP_FORMAT) {
    errors.push('立ち呑み地形図のバックアップ形式ではありません（format が一致しません）。');
    return empty;
  }
  if (file.version !== BACKUP_VERSION) {
    errors.push(
      `バックアップ形式のバージョン ${String(file.version)} には対応していません（対応: ${BACKUP_VERSION}）。`,
    );
    return empty;
  }
  const kind: BackupKind = file.kind === 'shops' || file.kind === 'personal' ? file.kind : 'full';
  const exportedAt = typeof file.exportedAt === 'string' ? file.exportedAt : null;
  const d = file.data;
  if (!d || typeof d !== 'object' || Array.isArray(d)) {
    errors.push('バックアップに data がありません。');
    return { ...empty, kind, exportedAt };
  }
  const raw = d as Record<string, unknown>;

  const shops = checkItems<Shop>(list(raw.shops, '店舗', errors), '店舗', (x) => x.id, validateShop, errors);
  const sources = checkItems<DataSource>(
    list(raw.sources, '出典', errors),
    '出典',
    (x) => x.id,
    validateDataSource,
    errors,
  );
  const visits = checkItems<Visit>(
    list(raw.visits, '訪問記録', errors),
    '訪問記録',
    (x) => x.id,
    validateVisit,
    errors,
  );
  const marks = checkItems<ShopMark>(
    list(raw.marks, 'お気に入り等', errors),
    'お気に入り等',
    (x) => x.shopId,
    validateMark,
    errors,
  );
  const surveyAreas = checkItems<SurveyArea>(
    list(raw.surveyAreas, '調査済みエリア', errors),
    '調査済みエリア',
    (x) => x.id,
    validateSurveyArea,
    errors,
  );
  const routes = checkItems<PlannedRoute>(
    list(raw.routes, 'はしご酒ルート', errors),
    'はしご酒ルート',
    (x) => x.id,
    validateRoute,
    errors,
  );
  const deletedRaw = list(raw.deletedShopIds, '削除記録', errors);
  if (!deletedRaw.every((x) => typeof x === 'string')) errors.push('削除記録の形式が不正です。');
  const deletedShopIds = deletedRaw.filter((x): x is string => typeof x === 'string');

  // 参照先の確認（店舗は「既存＋このファイル」の中にあれば良い。削除予定の店舗は除く）
  const shopIds = new Set([...knownShopIds, ...shops.map((s) => s.id)]);
  for (const id of deletedShopIds) shopIds.delete(id);
  const danglingVisitIds = errors.length ? [] : visits.filter((v) => !shopIds.has(v.shopId)).map((v) => v.id);
  const danglingMarkShopIds = errors.length ? [] : marks.filter((m) => !shopIds.has(m.shopId)).map((m) => m.shopId);
  if (danglingVisitIds.length) {
    warnings.push(
      `店舗が見つからない訪問記録が ${danglingVisitIds.length} 件あります（記録時の店名があれば表示できます）。`,
    );
  }
  if (danglingMarkShopIds.length) {
    warnings.push(`店舗が見つからないお気に入り等が ${danglingMarkShopIds.length} 件あります。`);
  }
  const sourceIds = new Set(sources.map((s) => s.id));
  const missingSourceRefs = shops.flatMap((s) => s.sourceIds).filter((id) => !sourceIds.has(id));
  if (kind !== 'personal' && missingSourceRefs.length && !errors.length) {
    warnings.push(
      `ファイル内に無い出典を参照している店舗があります（${new Set(missingSourceRefs).size} 件の出典ID）。既存の出典に同じIDがあればそれを使います。`,
    );
  }
  if (
    !errors.length &&
    shops.length +
      sources.length +
      visits.length +
      marks.length +
      surveyAreas.length +
      routes.length +
      deletedShopIds.length ===
      0
  ) {
    warnings.push('読み込むデータがありません。');
  }

  return {
    kind,
    exportedAt,
    data: { shops, deletedShopIds, sources, visits, marks, surveyAreas, routes },
    errors,
    warnings,
    danglingVisitIds,
    danglingMarkShopIds,
  };
}

export type ImportMode = 'merge' | 'replace';

/** 参照先不明の記録を除外したデータを返す */
export function withoutDangling(preview: ImportPreview): UserData {
  const visitIds = new Set(preview.danglingVisitIds);
  const markIds = new Set(preview.danglingMarkShopIds);
  return {
    ...preview.data,
    visits: preview.data.visits.filter((v) => !visitIds.has(v.id)),
    marks: preview.data.marks.filter((m) => !markIds.has(m.shopId)),
  };
}

export function countUserData(d: UserData) {
  return {
    shops: d.shops.length,
    deletedShopIds: d.deletedShopIds.length,
    sources: d.sources.length,
    visits: d.visits.length,
    marks: d.marks.length,
    surveyAreas: d.surveyAreas.length,
    routes: d.routes.length,
  };
}

export const USER_DATA_LABELS: Record<keyof UserData, string> = {
  shops: '店舗',
  deletedShopIds: '削除した初期データ店舗',
  sources: '出典',
  visits: '訪問記録',
  marks: 'お気に入り等',
  surveyAreas: '調査済みエリア',
  routes: 'はしご酒ルート',
};

/** 書き出す前に、どの種類のデータを何件含むかを返す */
export function describeBackup(file: BackupFile): { key: keyof UserData; label: string; count: number }[] {
  return (Object.keys(USER_DATA_LABELS) as (keyof UserData)[])
    .filter((k) => file.data[k] !== undefined)
    .map((k) => ({ key: k, label: USER_DATA_LABELS[k], count: (file.data[k] as unknown[]).length }));
}
