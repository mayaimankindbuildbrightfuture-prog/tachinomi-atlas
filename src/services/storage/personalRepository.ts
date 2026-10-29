/**
 * 個人記録（訪問記録・お気に入り等）を IndexedDB に保存する Repository。
 */
import { isMarkEmpty, type ShopMark, type Visit } from '../../domain/visit';
import { STORES, getAll, openDatabase, runOrAbort, transactionDone, type StoreName } from './database';

async function write(store: StoreName, work: (s: IDBObjectStore) => void): Promise<void> {
  const db = await openDatabase();
  const tx = db.transaction(store, 'readwrite');
  const done = transactionDone(tx);
  done.catch(() => undefined);
  runOrAbort(tx, () => work(tx.objectStore(store)));
  await done;
}

export const personalRepository = {
  async loadAll(): Promise<{ visits: Visit[]; marks: ShopMark[] }> {
    const [visits, marks] = await Promise.all([getAll<Visit>(STORES.visits), getAll<ShopMark>(STORES.shopMarks)]);
    return { visits, marks };
  },
  saveVisit(visit: Visit): Promise<void> {
    return write(STORES.visits, (s) => s.put(visit));
  },
  deleteVisit(id: string): Promise<void> {
    return write(STORES.visits, (s) => s.delete(id));
  },
  /** すべて外れた印は保存せず削除する */
  saveMark(mark: ShopMark): Promise<void> {
    return write(STORES.shopMarks, (s) => (isMarkEmpty(mark) ? s.delete(mark.shopId) : s.put(mark)));
  },
};

export type PersonalRepository = typeof personalRepository;
