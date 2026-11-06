/**
 * 店舗と情報ソースのユーザーデータを IndexedDB に保存する Repository。
 */
import type { DataSource, Shop } from '../../domain/shop';
import { STORES, getAll, openDatabase, runOrAbort, transactionDone } from './database';

type Tombstone = { id: string; deletedAt: string };

export type UserShopData = {
  shops: Shop[];
  deletedShopIds: string[];
  sources: DataSource[];
};

export const shopRepository = {
  async loadUserData(): Promise<UserShopData> {
    const [shops, tombstones, sources] = await Promise.all([
      getAll<Shop>(STORES.shops),
      getAll<Tombstone>(STORES.shopTombstones),
      getAll<DataSource>(STORES.sources),
    ]);
    return { shops, deletedShopIds: tombstones.map((t) => t.id), sources };
  },

  /** 店舗と、その店舗で新たに追加した出典を1つのトランザクションで保存する */
  async saveShop(shop: Shop, newSources: readonly DataSource[] = []): Promise<void> {
    const db = await openDatabase();
    const tx = db.transaction([STORES.shops, STORES.shopTombstones, STORES.sources], 'readwrite');
    const done = transactionDone(tx);
    // 同期例外で中断した場合、呼び出し元にはその例外を返すため、完了待ちの失敗は握りつぶす
    done.catch(() => undefined);
    runOrAbort(tx, () => {
      for (const s of newSources) tx.objectStore(STORES.sources).put(s);
      tx.objectStore(STORES.shops).put(shop);
      tx.objectStore(STORES.shopTombstones).delete(shop.id);
    });
    await done;
  },

  /** 店舗を削除する。初期データの店舗は再表示されないよう削除記録（tombstone）を残す */
  async deleteShop(id: string, isSeedShop: boolean, deletedAt: string): Promise<void> {
    const db = await openDatabase();
    const tx = db.transaction([STORES.shops, STORES.shopTombstones], 'readwrite');
    const done = transactionDone(tx);
    // 同期例外で中断した場合、呼び出し元にはその例外を返すため、完了待ちの失敗は握りつぶす
    done.catch(() => undefined);
    runOrAbort(tx, () => {
      tx.objectStore(STORES.shops).delete(id);
      if (isSeedShop) tx.objectStore(STORES.shopTombstones).put({ id, deletedAt } satisfies Tombstone);
    });
    await done;
  },
};

export type ShopRepository = typeof shopRepository;
