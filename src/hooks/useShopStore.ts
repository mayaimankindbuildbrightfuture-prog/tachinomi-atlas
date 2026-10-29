/**
 * 店舗データの読み込み・保存・削除をまとめた React フック。
 * 初期データ（JSON）とユーザーデータ（IndexedDB）を統合して提供する。
 */
import { useCallback, useEffect, useMemo, useState } from 'react';
import seedShopsJson from '../data/shops.json';
import seedSourcesJson from '../data/sources.json';
import seedStationsJson from '../data/stations.json';
import {
  findDanglingReferences,
  mergeById,
  parseShopsJson,
  parseSourcesJson,
  parseStationsJson,
  type DatasetIssue,
} from '../domain/dataset';
import { validateShop, type DataSource, type Shop, type Station } from '../domain/shop';
import { shopRepository as defaultRepository, type ShopRepository } from '../services/storage/shopRepository';

export type SeedData = {
  shops: Shop[];
  sources: DataSource[];
  stations: Station[];
  issues: DatasetIssue[];
};

export function loadSeedData(): SeedData {
  const shops = parseShopsJson(seedShopsJson);
  const sources = parseSourcesJson(seedSourcesJson);
  const stations = parseStationsJson(seedStationsJson);
  return {
    shops: shops.items,
    sources: sources.items,
    stations: stations.items,
    issues: [...shops.issues, ...sources.issues, ...stations.issues],
  };
}

export type StoreStatus = 'loading' | 'ready' | 'error';

export type ShopStore = {
  status: StoreStatus;
  shops: Shop[];
  sources: DataSource[];
  stations: Station[];
  /** 初期データの不正・参照切れなど */
  dataIssues: DatasetIssue[];
  /** 読み込み・保存の失敗メッセージ */
  error: string | null;
  /** 初期データ由来の店舗ID（削除時の扱いに使う） */
  seedShopIds: ReadonlySet<string>;
  saveShop: (shop: Shop, newSources: DataSource[]) => Promise<void>;
  /** deleteVisits が true なら、その店舗の訪問記録も削除する */
  deleteShop: (id: string, options?: { deleteVisits?: boolean }) => Promise<void>;
  clearError: () => void;
  /** 保存済みデータを読み込み直す（バックアップの読み込み後など） */
  reload: () => void;
};

function describeError(e: unknown): string {
  return e instanceof Error ? e.message : String(e);
}

export function useShopStore(
  repository: ShopRepository = defaultRepository,
  seedLoader: () => SeedData = loadSeedData,
): ShopStore {
  const [seed] = useState(() => {
    try {
      return { data: seedLoader(), error: null as string | null };
    } catch (e) {
      return { data: { shops: [], sources: [], stations: [], issues: [] } as SeedData, error: describeError(e) };
    }
  });
  const [status, setStatus] = useState<StoreStatus>('loading');
  const [userShops, setUserShops] = useState<Shop[]>([]);
  const [deletedIds, setDeletedIds] = useState<string[]>([]);
  const [userSources, setUserSources] = useState<DataSource[]>([]);
  const [error, setError] = useState<string | null>(
    seed.error ? `初期データを読み込めませんでした：${seed.error}` : null,
  );
  const [reloadKey, setReloadKey] = useState(0);

  useEffect(() => {
    let cancelled = false;
    repository
      .loadUserData()
      .then((data) => {
        if (cancelled) return;
        setUserShops(data.shops);
        setDeletedIds(data.deletedShopIds);
        setUserSources(data.sources);
        setStatus('ready');
      })
      .catch((e: unknown) => {
        if (cancelled) return;
        // 保存済みデータを読めなくても、初期データの閲覧はできるようにする
        setError(
          `保存済みデータを読み込めませんでした：${describeError(e)}。ブラウザのプライベートモードでは保存できない場合があります。`,
        );
        setStatus('error');
      });
    return () => {
      cancelled = true;
    };
  }, [repository, reloadKey]);

  const shops = useMemo(() => mergeById(seed.data.shops, userShops, deletedIds), [seed, userShops, deletedIds]);
  const sources = useMemo(() => mergeById(seed.data.sources, userSources), [seed, userSources]);
  const stations = seed.data.stations;
  const seedShopIds = useMemo(() => new Set(seed.data.shops.map((s) => s.id)), [seed]);
  const dataIssues = useMemo(
    () => [...seed.data.issues, ...findDanglingReferences(shops, sources, stations)],
    [seed, shops, sources, stations],
  );

  const saveShop = useCallback(
    async (shop: Shop, newSources: DataSource[]) => {
      const { errors } = validateShop(shop);
      if (errors.length > 0) throw new Error(errors.join(' '));
      try {
        await repository.saveShop(shop, newSources);
      } catch (e) {
        const message = `店舗データを保存できませんでした：${describeError(e)}`;
        setError(message);
        throw new Error(message, { cause: e });
      }
      setUserShops((prev) => [...prev.filter((s) => s.id !== shop.id), shop]);
      setDeletedIds((prev) => prev.filter((id) => id !== shop.id));
      if (newSources.length) {
        setUserSources((prev) => mergeById(prev, newSources));
      }
    },
    [repository],
  );

  const deleteShop = useCallback(
    async (id: string, options: { deleteVisits?: boolean } = {}) => {
      try {
        await repository.deleteShop(id, seedShopIds.has(id), new Date().toISOString(), options);
      } catch (e) {
        const message = `店舗を削除できませんでした：${describeError(e)}`;
        setError(message);
        throw new Error(message, { cause: e });
      }
      setUserShops((prev) => prev.filter((s) => s.id !== id));
      if (seedShopIds.has(id)) setDeletedIds((prev) => [...prev, id]);
    },
    [repository, seedShopIds],
  );

  return {
    status,
    shops,
    sources,
    stations,
    dataIssues,
    error,
    seedShopIds,
    saveShop,
    deleteShop,
    clearError: useCallback(() => setError(null), []),
    reload: useCallback(() => setReloadKey((k) => k + 1), []),
  };
}
