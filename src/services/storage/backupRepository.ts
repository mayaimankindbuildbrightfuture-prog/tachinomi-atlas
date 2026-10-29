/**
 * バックアップの書き出し・読み込みのための Repository。
 * 読み込みは全ストアを1つのトランザクションで更新し、途中で失敗した場合は何も変更しない。
 */
import type { ImportMode, UserData } from '../../domain/backup';
import { STORES, openDatabase, requestToPromise, runOrAbort, transactionDone } from './database';

const DATA_STORES = [
  STORES.shops,
  STORES.shopTombstones,
  STORES.sources,
  STORES.visits,
  STORES.shopMarks,
  STORES.surveyAreas,
  STORES.routes,
] as const;

const LAST_BACKUP_KEY = 'lastBackupAt';

export const backupRepository = {
  /** ブラウザ内に保存されている全ユーザーデータを、1つの読み取りトランザクションで取得する */
  async exportUserData(): Promise<UserData> {
    const db = await openDatabase();
    const tx = db.transaction([...DATA_STORES], 'readonly');
    const get = <T>(store: string) => requestToPromise(tx.objectStore(store).getAll() as IDBRequest<T[]>);
    const [shops, tombstones, sources, visits, marks, surveyAreas, routes] = await Promise.all([
      get<UserData['shops'][number]>(STORES.shops),
      get<{ id: string }>(STORES.shopTombstones),
      get<UserData['sources'][number]>(STORES.sources),
      get<UserData['visits'][number]>(STORES.visits),
      get<UserData['marks'][number]>(STORES.shopMarks),
      get<UserData['surveyAreas'][number]>(STORES.surveyAreas),
      get<UserData['routes'][number]>(STORES.routes),
    ]);
    return { shops, deletedShopIds: tombstones.map((t) => t.id), sources, visits, marks, surveyAreas, routes };
  },

  /**
   * 検証済みのデータを保存する。
   * - replace：既存のユーザーデータをすべて消してから保存
   * - merge：同じIDのデータは読み込んだ内容で上書きし、それ以外は残す
   */
  async importUserData(data: UserData, mode: ImportMode, importedAt: string): Promise<void> {
    const db = await openDatabase();
    const tx = db.transaction([...DATA_STORES, STORES.meta], 'readwrite');
    const done = transactionDone(tx);
    done.catch(() => undefined);
    runOrAbort(tx, () => {
      if (mode === 'replace') for (const s of DATA_STORES) tx.objectStore(s).clear();
      for (const shop of data.shops) tx.objectStore(STORES.shops).put(shop);
      // 店舗を読み込んだ場合、その店舗の削除記録は外す
      for (const shop of data.shops) tx.objectStore(STORES.shopTombstones).delete(shop.id);
      for (const id of data.deletedShopIds) {
        tx.objectStore(STORES.shopTombstones).put({ id, deletedAt: importedAt });
        tx.objectStore(STORES.shops).delete(id);
      }
      for (const src of data.sources) tx.objectStore(STORES.sources).put(src);
      for (const v of data.visits) tx.objectStore(STORES.visits).put(v);
      for (const m of data.marks) tx.objectStore(STORES.shopMarks).put(m);
      for (const a of data.surveyAreas) tx.objectStore(STORES.surveyAreas).put(a);
      for (const r of data.routes) tx.objectStore(STORES.routes).put(r);
      tx.objectStore(STORES.meta).put({ key: 'lastImportAt', value: importedAt });
    });
    await done;
  },

  async getLastBackupAt(): Promise<string | null> {
    const db = await openDatabase();
    const tx = db.transaction(STORES.meta, 'readonly');
    const row = await requestToPromise(
      tx.objectStore(STORES.meta).get(LAST_BACKUP_KEY) as IDBRequest<{ value: string } | undefined>,
    );
    return row?.value ?? null;
  },

  async setLastBackupAt(at: string): Promise<void> {
    const db = await openDatabase();
    const tx = db.transaction(STORES.meta, 'readwrite');
    const done = transactionDone(tx);
    tx.objectStore(STORES.meta).put({ key: LAST_BACKUP_KEY, value: at });
    await done;
  },
};

export type BackupRepository = typeof backupRepository;
