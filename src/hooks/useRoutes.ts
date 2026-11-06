/**
 * はしご酒ルートのストア。変更はすぐに保存する（保存し忘れを防ぐ）。
 */
import { useCallback, useEffect, useState } from 'react';
import { validateRoute, type PlannedRoute } from '../domain/route';
import { routeRepository as defaultRepository, type RouteRepository } from '../services/storage/routeRepository';
import {
  DEFAULT_ROUTING_SETTINGS,
  settingsRepository as defaultSettingsRepository,
  type SettingsRepository,
} from '../services/storage/settingsRepository';
import type { RoutingSettings } from '../services/routing/routingService';

export type RouteStore = {
  routes: PlannedRoute[];
  error: string | null;
  save: (route: PlannedRoute) => Promise<void>;
  remove: (id: string) => Promise<void>;
  reload: () => void;
  routing: RoutingSettings;
  saveRouting: (settings: RoutingSettings) => Promise<void>;
};

const describe = (e: unknown) => (e instanceof Error ? e.message : String(e));

export function useRoutes(
  repository: RouteRepository = defaultRepository,
  settingsRepository: SettingsRepository = defaultSettingsRepository,
): RouteStore {
  const [routes, setRoutes] = useState<PlannedRoute[]>([]);
  const [routing, setRouting] = useState<RoutingSettings>(DEFAULT_ROUTING_SETTINGS);
  const [error, setError] = useState<string | null>(null);
  const [reloadKey, setReloadKey] = useState(0);

  useEffect(() => {
    let cancelled = false;
    Promise.all([repository.loadAll(), settingsRepository.loadRouting()])
      .then(([list, settings]) => {
        if (cancelled) return;
        setRoutes(list.filter((r) => validateRoute(r).errors.length === 0));
        setRouting(settings);
      })
      .catch((e: unknown) => {
        if (!cancelled) setError(`はしご酒ルートを読み込めませんでした：${describe(e)}`);
      });
    return () => {
      cancelled = true;
    };
  }, [repository, settingsRepository, reloadKey]);

  const save = useCallback(
    async (route: PlannedRoute) => {
      const { errors } = validateRoute(route);
      if (errors.length) throw new Error(errors.join(' '));
      // 画面の表示は先に更新し、保存に失敗した場合はエラーを表示する
      setRoutes((prev) => [...prev.filter((r) => r.id !== route.id), route]);
      try {
        await repository.save(route);
        setError(null);
      } catch (e) {
        const message = `はしご酒ルートを保存できませんでした：${describe(e)}`;
        setError(message);
        throw new Error(message, { cause: e });
      }
    },
    [repository],
  );

  const remove = useCallback(
    async (id: string) => {
      try {
        await repository.delete(id);
      } catch (e) {
        const message = `はしご酒ルートを削除できませんでした：${describe(e)}`;
        setError(message);
        throw new Error(message, { cause: e });
      }
      setRoutes((prev) => prev.filter((r) => r.id !== id));
    },
    [repository],
  );

  const saveRouting = useCallback(
    async (settings: RoutingSettings) => {
      setRouting(settings);
      try {
        await settingsRepository.saveRouting(settings);
      } catch (e) {
        setError(`設定を保存できませんでした：${describe(e)}`);
      }
    },
    [settingsRepository],
  );

  return {
    routes,
    error,
    save,
    remove,
    reload: useCallback(() => setReloadKey((k) => k + 1), []),
    routing,
    saveRouting,
  };
}
