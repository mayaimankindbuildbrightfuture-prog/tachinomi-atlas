/**
 * アプリの設定（徒歩経路のサービスなど）を IndexedDB の meta ストアに保存する。
 * 設定（API キーを含む）はバックアップに含めない。
 */
import { DEFAULT_ROUTING_SETTINGS, type RoutingSettings } from '../routing/routingService';
import { STORES, openDatabase, requestToPromise, transactionDone } from './database';

const ROUTING_KEY = 'routingSettings';

export const settingsRepository = {
  async loadRouting(): Promise<RoutingSettings> {
    const db = await openDatabase();
    const tx = db.transaction(STORES.meta, 'readonly');
    const row = await requestToPromise(
      tx.objectStore(STORES.meta).get(ROUTING_KEY) as IDBRequest<{ value: unknown } | undefined>,
    );
    const v = row?.value as Partial<RoutingSettings> | undefined;
    return {
      provider: v?.provider === 'openrouteservice' ? 'openrouteservice' : 'none',
      orsApiKey: typeof v?.orsApiKey === 'string' ? v.orsApiKey : '',
    };
  },
  async saveRouting(settings: RoutingSettings): Promise<void> {
    const db = await openDatabase();
    const tx = db.transaction(STORES.meta, 'readwrite');
    const done = transactionDone(tx);
    tx.objectStore(STORES.meta).put({ key: ROUTING_KEY, value: settings });
    await done;
  },
};

export type SettingsRepository = typeof settingsRepository;

export { DEFAULT_ROUTING_SETTINGS };
