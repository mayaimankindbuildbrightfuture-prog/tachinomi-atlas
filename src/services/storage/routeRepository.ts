/**
 * はしご酒のルートを IndexedDB に保存する Repository。
 */
import type { PlannedRoute } from '../../domain/route';
import { STORES, getAll, openDatabase, runOrAbort, transactionDone } from './database';

async function write(work: (store: IDBObjectStore) => void): Promise<void> {
  const db = await openDatabase();
  const tx = db.transaction(STORES.routes, 'readwrite');
  const done = transactionDone(tx);
  done.catch(() => undefined);
  runOrAbort(tx, () => work(tx.objectStore(STORES.routes)));
  await done;
}

export const routeRepository = {
  loadAll(): Promise<PlannedRoute[]> {
    return getAll<PlannedRoute>(STORES.routes);
  },
  save(route: PlannedRoute): Promise<void> {
    return write((s) => s.put(route));
  },
  delete(id: string): Promise<void> {
    return write((s) => s.delete(id));
  },
};

export type RouteRepository = typeof routeRepository;
