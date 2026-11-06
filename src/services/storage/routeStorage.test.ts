import 'fake-indexeddb/auto';
import { IDBFactory } from 'fake-indexeddb';
import { EMPTY_USER_DATA } from '../../domain/backup';
import { createRoute } from '../../domain/route';
import { DB_NAME, STORES, openDatabase, resetDatabaseConnection } from './database';
import { backupRepository } from './backupRepository';
import { personalRepository } from './personalRepository';
import { routeRepository } from './routeRepository';
import { settingsRepository } from './settingsRepository';
import { makeVisit } from '../../tests/fixtures';

beforeEach(() => {
  globalThis.indexedDB = new IDBFactory();
  resetDatabaseConnection();
});

const route = { ...createRoute('r1', '2026-10-29T00:00:00.000Z', '赤羽はしご'), shopIds: ['a', 'b'] };

describe('バージョン3 → 4 の移行', () => {
  it('既存の訪問記録を保持して、ルートのストアを追加する', async () => {
    await new Promise<void>((resolve, reject) => {
      const req = indexedDB.open(DB_NAME, 3);
      req.onupgradeneeded = () => {
        const db = req.result;
        for (const s of ['shops', 'shopTombstones', 'sources', 'surveyAreas'])
          db.createObjectStore(s, { keyPath: 'id' });
        db.createObjectStore('visits', { keyPath: 'id' }).createIndex('shopId', 'shopId');
        db.createObjectStore('shopMarks', { keyPath: 'shopId' });
        db.createObjectStore('meta', { keyPath: 'key' });
        req.transaction!.objectStore('visits').put(makeVisit({ id: 'v3-visit' }));
      };
      req.onsuccess = () => {
        req.result.close();
        resolve();
      };
      req.onerror = () => reject(req.error);
    });
    const db = await openDatabase();
    expect([...db.objectStoreNames]).toContain(STORES.routes);
    expect((await personalRepository.loadAll()).visits.map((v) => v.id)).toEqual(['v3-visit']);
    expect(await routeRepository.loadAll()).toEqual([]);
  });
});

describe('routeRepository・設定', () => {
  it('ルートを保存・削除できる', async () => {
    await routeRepository.save(route);
    resetDatabaseConnection();
    expect(await routeRepository.loadAll()).toEqual([route]);
    await routeRepository.delete('r1');
    expect(await routeRepository.loadAll()).toEqual([]);
  });

  it('徒歩経路の設定を保存し、既定は外部通信なし', async () => {
    expect(await settingsRepository.loadRouting()).toEqual({ provider: 'none', orsApiKey: '' });
    await settingsRepository.saveRouting({ provider: 'openrouteservice', orsApiKey: 'secret-key' });
    expect(await settingsRepository.loadRouting()).toEqual({ provider: 'openrouteservice', orsApiKey: 'secret-key' });
  });

  it('ルートはバックアップに含まれ、API キーは含まれない', async () => {
    await routeRepository.save(route);
    await settingsRepository.saveRouting({ provider: 'openrouteservice', orsApiKey: 'secret-key' });
    const exported = await backupRepository.exportUserData();
    expect(exported.routes).toEqual([route]);
    expect(JSON.stringify(exported)).not.toContain('secret-key');

    await backupRepository.importUserData(
      { ...EMPTY_USER_DATA, routes: [{ ...route, name: '復元' }] },
      'replace',
      '2026-10-29T00:00:00.000Z',
    );
    expect((await routeRepository.loadAll())[0]!.name).toBe('復元');
    // 置き換えでも設定（API キー）は消えない
    expect((await settingsRepository.loadRouting()).orsApiKey).toBe('secret-key');
  });
});
