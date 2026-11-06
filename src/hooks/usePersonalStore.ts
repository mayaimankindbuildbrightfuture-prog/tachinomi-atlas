/**
 * 個人記録（訪問記録・お気に入り等）のストア。店舗データとは別に管理する（仕様書 7章）。
 */
import { useCallback, useEffect, useMemo, useState } from 'react';
import { toggleMark, validateMark, validateVisit, type MarkKind, type ShopMark, type Visit } from '../domain/visit';
import {
  personalRepository as defaultRepository,
  type PersonalRepository,
} from '../services/storage/personalRepository';

export type PersonalStore = {
  status: 'loading' | 'ready' | 'error';
  visits: Visit[];
  marks: ReadonlyMap<string, ShopMark>;
  visitsByShop: ReadonlyMap<string, Visit[]>;
  error: string | null;
  saveVisit: (visit: Visit) => Promise<void>;
  deleteVisit: (id: string) => Promise<void>;
  toggle: (shopId: string, kind: MarkKind) => Promise<void>;
  /** 店舗の削除に合わせて、メモリ上の記録を更新する */
  forgetShop: (shopId: string, visitsDeleted: boolean) => void;
  reload: () => void;
};

const describe = (e: unknown) => (e instanceof Error ? e.message : String(e));

export function usePersonalStore(repository: PersonalRepository = defaultRepository): PersonalStore {
  const [status, setStatus] = useState<PersonalStore['status']>('loading');
  const [visits, setVisits] = useState<Visit[]>([]);
  const [markList, setMarkList] = useState<ShopMark[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [reloadKey, setReloadKey] = useState(0);

  useEffect(() => {
    let cancelled = false;
    repository
      .loadAll()
      .then((data) => {
        if (cancelled) return;
        // 壊れたデータが混ざっていても、正しい記録は表示する
        setVisits(data.visits.filter((v) => validateVisit(v).errors.length === 0));
        setMarkList(data.marks.filter((m) => validateMark(m).errors.length === 0));
        setStatus('ready');
      })
      .catch((e: unknown) => {
        if (cancelled) return;
        setError(`個人記録を読み込めませんでした：${describe(e)}`);
        setStatus('error');
      });
    return () => {
      cancelled = true;
    };
  }, [repository, reloadKey]);

  const marks = useMemo(() => new Map(markList.map((m) => [m.shopId, m])), [markList]);
  const visitsByShop = useMemo(() => {
    const map = new Map<string, Visit[]>();
    for (const v of visits) map.set(v.shopId, [...(map.get(v.shopId) ?? []), v]);
    return map;
  }, [visits]);

  const saveVisit = useCallback(
    async (visit: Visit) => {
      const { errors } = validateVisit(visit);
      if (errors.length) throw new Error(errors.join(' '));
      try {
        await repository.saveVisit(visit);
      } catch (e) {
        throw new Error(`訪問記録を保存できませんでした：${describe(e)}`, { cause: e });
      }
      setVisits((prev) => [...prev.filter((v) => v.id !== visit.id), visit]);
    },
    [repository],
  );

  const deleteVisit = useCallback(
    async (id: string) => {
      try {
        await repository.deleteVisit(id);
      } catch (e) {
        const message = `訪問記録を削除できませんでした：${describe(e)}`;
        setError(message);
        throw new Error(message, { cause: e });
      }
      setVisits((prev) => prev.filter((v) => v.id !== id));
    },
    [repository],
  );

  const toggle = useCallback(
    async (shopId: string, kind: MarkKind) => {
      const next = toggleMark(marks.get(shopId), shopId, kind, new Date().toISOString());
      try {
        await repository.saveMark(next);
      } catch (e) {
        setError(`お気に入り等を保存できませんでした：${describe(e)}`);
        return;
      }
      setMarkList((prev) => [...prev.filter((m) => m.shopId !== shopId), next]);
    },
    [repository, marks],
  );

  const forgetShop = useCallback((shopId: string, visitsDeleted: boolean) => {
    setMarkList((prev) => prev.filter((m) => m.shopId !== shopId));
    if (visitsDeleted) setVisits((prev) => prev.filter((v) => v.shopId !== shopId));
  }, []);

  return {
    status,
    visits,
    marks,
    visitsByShop,
    error,
    saveVisit,
    deleteVisit,
    toggle,
    forgetShop,
    reload: useCallback(() => setReloadKey((k) => k + 1), []),
  };
}
