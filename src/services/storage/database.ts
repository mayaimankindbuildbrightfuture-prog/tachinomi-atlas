/**
 * IndexedDB の接続と、Promise ベースの最小ヘルパー。
 * 画面コンポーネントからは直接使わず、各 Repository を経由する（仕様書 8.1）。
 */

export const DB_NAME = 'tachinomi-atlas';
/** スキーマを変える場合は番号を上げ、upgrade 内に移行処理を追加する */
export const DB_VERSION = 3;

export const STORES = {
  /** ユーザーが追加・編集した店舗（完全な Shop レコード） */
  shops: 'shops',
  /** ユーザーが削除した初期データ店舗のID */
  shopTombstones: 'shopTombstones',
  /** ユーザーが追加した情報ソース */
  sources: 'sources',
  /** 調査済みエリア（バージョン2で追加） */
  surveyAreas: 'surveyAreas',
  /** 訪問記録（バージョン3で追加。shopId の索引つき） */
  visits: 'visits',
  /** お気に入り・行きたい店・再訪したい（バージョン3で追加。キーは shopId） */
  shopMarks: 'shopMarks',
  /** 最終バックアップ日時などの設定値（バージョン3で追加） */
  meta: 'meta',
} as const;

export type StoreName = (typeof STORES)[keyof typeof STORES];

export class StorageUnavailableError extends Error {
  constructor(message: string, options?: { cause?: unknown }) {
    super(message, options);
    this.name = 'StorageUnavailableError';
  }
}

let dbPromise: Promise<IDBDatabase> | null = null;

export function openDatabase(factory: IDBFactory | undefined = globalThis.indexedDB): Promise<IDBDatabase> {
  if (dbPromise) return dbPromise;
  if (!factory) {
    return Promise.reject(new StorageUnavailableError('このブラウザでは IndexedDB を利用できません。'));
  }
  dbPromise = new Promise<IDBDatabase>((resolve, reject) => {
    let req: IDBOpenDBRequest;
    try {
      req = factory.open(DB_NAME, DB_VERSION);
    } catch (e) {
      reject(new StorageUnavailableError('ブラウザ内データベースを開けませんでした。', { cause: e }));
      return;
    }
    req.onupgradeneeded = (event) => {
      const db = req.result;
      const oldVersion = event.oldVersion;
      // バージョンごとに差分だけを適用する（既存のデータは保持される）
      if (oldVersion < 1) {
        db.createObjectStore(STORES.shops, { keyPath: 'id' });
        db.createObjectStore(STORES.shopTombstones, { keyPath: 'id' });
        db.createObjectStore(STORES.sources, { keyPath: 'id' });
      }
      if (oldVersion < 2) {
        db.createObjectStore(STORES.surveyAreas, { keyPath: 'id' });
      }
      if (oldVersion < 3) {
        const visits = db.createObjectStore(STORES.visits, { keyPath: 'id' });
        visits.createIndex('shopId', 'shopId', { unique: false });
        db.createObjectStore(STORES.shopMarks, { keyPath: 'shopId' });
        db.createObjectStore(STORES.meta, { keyPath: 'key' });
      }
    };
    req.onsuccess = () => {
      const db = req.result;
      // 別タブで新しいバージョンが開かれたら接続を閉じる
      db.onversionchange = () => {
        db.close();
        dbPromise = null;
      };
      resolve(db);
    };
    req.onerror = () =>
      reject(new StorageUnavailableError('ブラウザ内データベースを開けませんでした。', { cause: req.error }));
    req.onblocked = () =>
      reject(
        new StorageUnavailableError('別のタブがデータベースを使用中です。他のタブを閉じてから再読み込みしてください。'),
      );
  });
  dbPromise.catch(() => {
    dbPromise = null;
  });
  return dbPromise;
}

/** テスト用：接続のキャッシュを破棄する */
export function resetDatabaseConnection() {
  dbPromise = null;
}

export function requestToPromise<T>(req: IDBRequest<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

/** トランザクション完了（全書き込みの確定）を待つ。途中で失敗した場合は全体が取り消される */
export function transactionDone(tx: IDBTransaction): Promise<void> {
  return new Promise((resolve, reject) => {
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
    tx.onabort = () => reject(tx.error ?? new Error('トランザクションが中断されました。'));
  });
}

export async function getAll<T>(storeName: StoreName): Promise<T[]> {
  const db = await openDatabase();
  const tx = db.transaction(storeName, 'readonly');
  return requestToPromise(tx.objectStore(storeName).getAll() as IDBRequest<T[]>);
}

/**
 * トランザクション内の書き込みを実行する。同期的な例外（キー不正など）が起きた場合は
 * トランザクションを中断し、それまでに積んだ書き込みも確定させない。
 */
export function runOrAbort(tx: IDBTransaction, work: () => void): void {
  try {
    work();
  } catch (e) {
    try {
      tx.abort();
    } catch {
      // 既に終了している場合は無視
    }
    throw e;
  }
}
