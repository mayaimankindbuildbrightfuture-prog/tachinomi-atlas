import 'fake-indexeddb/auto';
import { IDBFactory } from 'fake-indexeddb';
import { makeShop, testSource } from '../../tests/fixtures';
import { resetDatabaseConnection } from './database';
import { shopRepository } from './shopRepository';

beforeEach(() => {
  // テストごとに空のデータベースから始める
  globalThis.indexedDB = new IDBFactory();
  resetDatabaseConnection();
});

describe('shopRepository', () => {
  it('初回は空', async () => {
    expect(await shopRepository.loadUserData()).toEqual({ shops: [], deletedShopIds: [], sources: [] });
  });

  it('店舗と新しい出典を保存し、再読み込みで取得できる', async () => {
    await shopRepository.saveShop(makeShop({ sourceIds: [testSource.id] }), [testSource]);
    resetDatabaseConnection(); // ページ再読み込みに相当
    const data = await shopRepository.loadUserData();
    expect(data.shops.map((s) => s.id)).toEqual(['test-shop-a']);
    expect(data.sources).toEqual([testSource]);
  });

  it('同じIDの保存は上書き（重複登録しない）', async () => {
    await shopRepository.saveShop(makeShop({ name: '旧' }));
    await shopRepository.saveShop(makeShop({ name: '新' }));
    const { shops } = await shopRepository.loadUserData();
    expect(shops).toHaveLength(1);
    expect(shops[0]!.name).toBe('新');
  });

  it('初期データの店舗を削除すると削除記録が残り、再保存で削除記録が消える', async () => {
    await shopRepository.deleteShop('seed-1', true, '2026-10-29T00:00:00.000Z');
    expect((await shopRepository.loadUserData()).deletedShopIds).toEqual(['seed-1']);
    await shopRepository.saveShop(makeShop({ id: 'seed-1' }));
    expect((await shopRepository.loadUserData()).deletedShopIds).toEqual([]);
  });

  it('ユーザーが追加した店舗の削除では削除記録を残さない', async () => {
    await shopRepository.saveShop(makeShop({ id: 'u1' }));
    await shopRepository.deleteShop('u1', false, '2026-10-29T00:00:00.000Z');
    expect(await shopRepository.loadUserData()).toEqual({ shops: [], deletedShopIds: [], sources: [] });
  });

  it('保存に失敗した場合は出典も含めて何も書き込まれない（トランザクション）', async () => {
    const bad = { ...makeShop(), id: undefined } as unknown as ReturnType<typeof makeShop>;
    await expect(shopRepository.saveShop(bad, [testSource])).rejects.toBeTruthy();
    expect((await shopRepository.loadUserData()).sources).toEqual([]);
  });
});
