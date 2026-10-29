import 'fake-indexeddb/auto';
import { IDBFactory } from 'fake-indexeddb';
import { EMPTY_USER_DATA } from '../../domain/backup';
import { makeShop, makeVisit, testSource } from '../../tests/fixtures';
import { DB_NAME, STORES, openDatabase, resetDatabaseConnection } from './database';
import { backupRepository } from './backupRepository';
import { personalRepository } from './personalRepository';
import { shopRepository } from './shopRepository';
import { surveyAreaRepository } from './surveyAreaRepository';

beforeEach(() => {
  globalThis.indexedDB = new IDBFactory();
  resetDatabaseConnection();
});

const mark = (shopId: string, favorite = true) => ({
  shopId,
  favorite,
  wantToGo: false,
  revisit: false,
  updatedAt: '2026-10-29T00:00:00.000Z',
});

const area = {
  id: 'area-1',
  name: '架空',
  centerLatitude: 35.7,
  centerLongitude: 139.7,
  radiusM: 300,
  surveyedAt: '2026-10-29',
  scope: '',
  notes: '',
  createdAt: '2026-10-29T00:00:00.000Z',
  updatedAt: '2026-10-29T00:00:00.000Z',
};

describe('バージョン2 → 3 の移行', () => {
  it('既存の店舗・調査済みエリアを保持して、訪問記録などのストアを追加する', async () => {
    await new Promise<void>((resolve, reject) => {
      const req = indexedDB.open(DB_NAME, 2);
      req.onupgradeneeded = () => {
        const db = req.result;
        for (const s of ['shops', 'shopTombstones', 'sources', 'surveyAreas'])
          db.createObjectStore(s, { keyPath: 'id' });
        req.transaction!.objectStore('shops').put(makeShop({ id: 'v2-shop' }));
        req.transaction!.objectStore('surveyAreas').put(area);
      };
      req.onsuccess = () => {
        req.result.close();
        resolve();
      };
      req.onerror = () => reject(req.error);
    });
    const db = await openDatabase();
    expect([...db.objectStoreNames]).toEqual(expect.arrayContaining([STORES.visits, STORES.shopMarks, STORES.meta]));
    expect((await shopRepository.loadUserData()).shops.map((s) => s.id)).toEqual(['v2-shop']);
    expect(await surveyAreaRepository.loadAll()).toHaveLength(1);
    expect(await personalRepository.loadAll()).toEqual({ visits: [], marks: [] });
  });
});

describe('personalRepository', () => {
  it('訪問記録とお気に入り等を保存・削除でき、全部外した印は消える', async () => {
    await personalRepository.saveVisit(makeVisit());
    await personalRepository.saveMark(mark('s1'));
    resetDatabaseConnection();
    let data = await personalRepository.loadAll();
    expect(data.visits).toHaveLength(1);
    expect(data.marks).toEqual([mark('s1')]);
    await personalRepository.saveMark(mark('s1', false));
    await personalRepository.deleteVisit('visit-1');
    data = await personalRepository.loadAll();
    expect(data).toEqual({ visits: [], marks: [] });
  });
});

describe('店舗の削除と個人記録', () => {
  beforeEach(async () => {
    await shopRepository.saveShop(makeShop({ id: 's1' }));
    await personalRepository.saveVisit(makeVisit({ id: 'v1', shopId: 's1' }));
    await personalRepository.saveVisit(makeVisit({ id: 'v2', shopId: 'other' }));
    await personalRepository.saveMark(mark('s1'));
  });

  it('訪問記録を残す場合：お気に入り等のみ削除する', async () => {
    await shopRepository.deleteShop('s1', false, '2026-10-29T00:00:00.000Z');
    const data = await personalRepository.loadAll();
    expect(data.visits.map((v) => v.id).sort()).toEqual(['v1', 'v2']);
    expect(data.marks).toEqual([]);
  });

  it('訪問記録も削除する場合：その店舗の記録だけ削除する', async () => {
    await shopRepository.deleteShop('s1', false, '2026-10-29T00:00:00.000Z', { deleteVisits: true });
    expect((await personalRepository.loadAll()).visits.map((v) => v.id)).toEqual(['v2']);
  });
});

describe('backupRepository', () => {
  const data = {
    ...EMPTY_USER_DATA,
    shops: [makeShop({ id: 'u1' })],
    sources: [testSource],
    visits: [makeVisit({ id: 'v-import', shopId: 'u1' })],
    marks: [mark('u1')],
    surveyAreas: [area],
    deletedShopIds: ['seed-gone'],
  };

  it('書き出し → 置き換えで読み込み → 同じ内容に戻る', async () => {
    await backupRepository.importUserData(data, 'replace', '2026-10-29T00:00:00.000Z');
    const exported = await backupRepository.exportUserData();
    expect(exported).toEqual(data);
  });

  it('統合：同じIDは上書きし、それ以外は残す', async () => {
    await personalRepository.saveVisit(makeVisit({ id: 'v-existing' }));
    await personalRepository.saveVisit(makeVisit({ id: 'v-import', memo: '古い' }));
    await backupRepository.importUserData(data, 'merge', '2026-10-29T00:00:00.000Z');
    const { visits } = await personalRepository.loadAll();
    expect(visits.map((v) => v.id).sort()).toEqual(['v-existing', 'v-import']);
    expect(visits.find((v) => v.id === 'v-import')!.memo).toBe('架空の感想');
  });

  it('置き換え：既存のデータを消す', async () => {
    await personalRepository.saveVisit(makeVisit({ id: 'v-existing' }));
    await backupRepository.importUserData(data, 'replace', '2026-10-29T00:00:00.000Z');
    expect((await personalRepository.loadAll()).visits.map((v) => v.id)).toEqual(['v-import']);
  });

  it('途中で失敗した場合は何も変更しない（置き換えでも既存データが残る）', async () => {
    await personalRepository.saveVisit(makeVisit({ id: 'v-existing' }));
    const broken = { ...data, marks: [{ ...mark('u1'), shopId: undefined as unknown as string }] };
    await expect(backupRepository.importUserData(broken, 'replace', '2026-10-29T00:00:00.000Z')).rejects.toBeTruthy();
    expect((await personalRepository.loadAll()).visits.map((v) => v.id)).toEqual(['v-existing']);
    expect((await shopRepository.loadUserData()).shops).toEqual([]);
  });

  it('最終バックアップ日時を記録する', async () => {
    expect(await backupRepository.getLastBackupAt()).toBeNull();
    await backupRepository.setLastBackupAt('2026-10-29T00:00:00.000Z');
    expect(await backupRepository.getLastBackupAt()).toBe('2026-10-29T00:00:00.000Z');
  });
});
