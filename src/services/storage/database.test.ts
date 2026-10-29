import 'fake-indexeddb/auto';
import { IDBFactory } from 'fake-indexeddb';
import { makeShop } from '../../tests/fixtures';
import { DB_NAME, DB_VERSION, STORES, openDatabase, resetDatabaseConnection } from './database';
import { shopRepository } from './shopRepository';
import { surveyAreaRepository } from './surveyAreaRepository';

beforeEach(() => {
  globalThis.indexedDB = new IDBFactory();
  resetDatabaseConnection();
});

/** バージョン1のデータベースを、当時の構造のまま作る */
function createVersion1Database(): Promise<void> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, 1);
    req.onupgradeneeded = () => {
      const db = req.result;
      db.createObjectStore('shops', { keyPath: 'id' });
      db.createObjectStore('shopTombstones', { keyPath: 'id' });
      db.createObjectStore('sources', { keyPath: 'id' });
      req.transaction!.objectStore('shops').put(makeShop({ id: 'v1-shop' }));
    };
    req.onsuccess = () => {
      req.result.close();
      resolve();
    };
    req.onerror = () => reject(req.error);
  });
}

describe('データベースの移行', () => {
  it('バージョン1のデータを保持したまま、調査済みエリアのストアを追加する', async () => {
    await createVersion1Database();
    const db = await openDatabase();
    expect(db.version).toBe(DB_VERSION);
    expect([...db.objectStoreNames]).toContain(STORES.surveyAreas);
    const { shops } = await shopRepository.loadUserData();
    expect(shops.map((s) => s.id)).toEqual(['v1-shop']);
    expect(await surveyAreaRepository.loadAll()).toEqual([]);
  });
});

describe('surveyAreaRepository', () => {
  it('保存・取得・削除', async () => {
    const area = {
      id: 'area-1',
      name: '架空駅周辺',
      centerLatitude: 35.7,
      centerLongitude: 139.7,
      radiusM: 400,
      surveyedAt: '2026-10-29',
      scope: '立ち呑み・角打ち',
      notes: '',
      createdAt: '2026-10-29T00:00:00.000Z',
      updatedAt: '2026-10-29T00:00:00.000Z',
    };
    await surveyAreaRepository.save(area);
    resetDatabaseConnection();
    expect(await surveyAreaRepository.loadAll()).toEqual([area]);
    await surveyAreaRepository.delete('area-1');
    expect(await surveyAreaRepository.loadAll()).toEqual([]);
  });
});
