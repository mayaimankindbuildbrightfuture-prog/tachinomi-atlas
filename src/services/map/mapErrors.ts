/**
 * MapLibre のエラーを利用者向けの日本語メッセージに分類する。
 */

export type MapIssueKind = 'webgl_unavailable' | 'style_load_failed' | 'tiles_failed' | 'offline' | 'unknown';

export type MapIssue = {
  kind: MapIssueKind;
  /** 何が起きたか */
  title: string;
  /** 利用者が取れる対処 */
  actions: string[];
  /** 開発者向けの詳細（URL・HTTPステータスなど） */
  detail: string | null;
  /** true の場合は地図そのものが使えない重大な状態 */
  fatal: boolean;
};

type ErrorLike = {
  message?: unknown;
  status?: unknown;
  url?: unknown;
};

function describe(error: unknown): { message: string; status: number | null; url: string | null } {
  if (error && typeof error === 'object') {
    const e = error as ErrorLike;
    return {
      message: typeof e.message === 'string' ? e.message : String(error),
      status: typeof e.status === 'number' ? e.status : null,
      url: typeof e.url === 'string' ? e.url : null,
    };
  }
  return { message: String(error), status: null, url: null };
}

function detailText(d: { message: string; status: number | null; url: string | null }): string {
  const parts = [d.message];
  if (d.status !== null) parts.push(`HTTP ${d.status}`);
  if (d.url) parts.push(d.url);
  return parts.join(' / ');
}

/** URL の見た目からタイル系リクエストかどうかを判定する */
export function isTileLikeUrl(url: string | null): boolean {
  if (!url) return false;
  return (
    /\.(pbf|mvt|png|jpe?g|webp)(\?|$)/i.test(url) ||
    /\/\d+\/\d+\/\d+/.test(url) ||
    /\/fonts?\//.test(url) ||
    /sprite/.test(url)
  );
}

export function webglUnavailableIssue(error: unknown): MapIssue {
  return {
    kind: 'webgl_unavailable',
    title: 'このブラウザでは3D地図（WebGL）を表示できません。',
    actions: [
      'Chrome・Edge・Firefox の最新版で開いてください。',
      'ブラウザ設定の「ハードウェア アクセラレーション」を有効にしてください。',
      'リモートデスクトップ経由の場合は、手元のPCで直接開いてください。',
    ],
    detail: describe(error).message,
    fatal: true,
  };
}

export function styleLoadFailedIssue(error: unknown, online: boolean): MapIssue {
  const d = describe(error);
  if (!online) return offlineIssue(d);
  return {
    kind: 'style_load_failed',
    title: '地図サービス（OpenFreeMap）に接続できず、地図の背景を読み込めませんでした。',
    actions: [
      'インターネット接続を確認してから「再読み込み」を押してください。',
      '上部の「地図スタイル」で別のスタイルを選ぶと読み込めることがあります。',
      '社内ネットワーク等で tiles.openfreemap.org への通信が遮断されていないか確認してください。',
    ],
    detail: detailText(d),
    fatal: false,
  };
}

export function tilesFailedIssue(error: unknown, failedCount: number, online: boolean): MapIssue {
  const d = describe(error);
  if (!online) return offlineIssue(d);
  return {
    kind: 'tiles_failed',
    title: `地図タイルの一部（${failedCount}件）を読み込めませんでした。表示が欠けている可能性があります。`,
    actions: [
      '地図を少し動かすと再取得されます。',
      '改善しない場合はインターネット接続を確認し、「再読み込み」を押してください。',
    ],
    detail: detailText(d),
    fatal: false,
  };
}

function offlineIssue(d: { message: string; status: number | null; url: string | null }): MapIssue {
  return {
    kind: 'offline',
    title: 'インターネットに接続されていないため、地図を読み込めません。',
    actions: ['ネットワーク接続を確認し、接続後に「再読み込み」を押してください。'],
    detail: detailText(d),
    fatal: false,
  };
}

export function unknownIssue(error: unknown): MapIssue {
  return {
    kind: 'unknown',
    title: '地図の表示中に予期しないエラーが発生しました。',
    actions: ['「再読み込み」を押してください。繰り返す場合は詳細をメモして開発者に共有してください。'],
    detail: detailText(describe(error)),
    fatal: false,
  };
}

export function getErrorUrl(error: unknown): string | null {
  return describe(error).url;
}
