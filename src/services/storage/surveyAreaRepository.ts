/**
 * 調査済みエリアを IndexedDB に保存する Repository。
 */
import type { SurveyArea } from '../../domain/survey';
import { STORES, getAll, openDatabase, runOrAbort, transactionDone } from './database';

async function write(work: (store: IDBObjectStore) => void): Promise<void> {
  const db = await openDatabase();
  const tx = db.transaction(STORES.surveyAreas, 'readwrite');
  const done = transactionDone(tx);
  done.catch(() => undefined);
  runOrAbort(tx, () => work(tx.objectStore(STORES.surveyAreas)));
  await done;
}

export const surveyAreaRepository = {
  loadAll(): Promise<SurveyArea[]> {
    return getAll<SurveyArea>(STORES.surveyAreas);
  },
  save(area: SurveyArea): Promise<void> {
    return write((store) => store.put(area));
  },
  delete(id: string): Promise<void> {
    return write((store) => store.delete(id));
  },
};

export type SurveyAreaRepository = typeof surveyAreaRepository;
