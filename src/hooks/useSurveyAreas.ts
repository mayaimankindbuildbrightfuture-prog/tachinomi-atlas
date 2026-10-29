/**
 * 調査済みエリアの読み込み・保存・削除。
 */
import { useCallback, useEffect, useState } from 'react';
import { validateSurveyArea, type SurveyArea } from '../domain/survey';
import {
  surveyAreaRepository as defaultRepository,
  type SurveyAreaRepository,
} from '../services/storage/surveyAreaRepository';

export type SurveyAreaStore = {
  areas: SurveyArea[];
  error: string | null;
  save: (area: SurveyArea) => Promise<void>;
  remove: (id: string) => Promise<void>;
  reload: () => void;
};

const describe = (e: unknown) => (e instanceof Error ? e.message : String(e));

export function useSurveyAreas(repository: SurveyAreaRepository = defaultRepository): SurveyAreaStore {
  const [areas, setAreas] = useState<SurveyArea[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [reloadKey, setReloadKey] = useState(0);

  useEffect(() => {
    let cancelled = false;
    repository
      .loadAll()
      .then((list) => {
        if (!cancelled) setAreas(list.filter((a) => validateSurveyArea(a).errors.length === 0));
      })
      .catch((e: unknown) => {
        if (!cancelled) setError(`調査済みエリアを読み込めませんでした：${describe(e)}`);
      });
    return () => {
      cancelled = true;
    };
  }, [repository, reloadKey]);

  const save = useCallback(
    async (area: SurveyArea) => {
      const { errors } = validateSurveyArea(area);
      if (errors.length) throw new Error(errors.join(' '));
      try {
        await repository.save(area);
      } catch (e) {
        throw new Error(`調査済みエリアを保存できませんでした：${describe(e)}`, { cause: e });
      }
      setAreas((prev) => [...prev.filter((a) => a.id !== area.id), area]);
    },
    [repository],
  );

  const remove = useCallback(
    async (id: string) => {
      try {
        await repository.delete(id);
      } catch (e) {
        throw new Error(`調査済みエリアを削除できませんでした：${describe(e)}`, { cause: e });
      }
      setAreas((prev) => prev.filter((a) => a.id !== id));
    },
    [repository],
  );

  const reload = useCallback(() => setReloadKey((k) => k + 1), []);

  return { areas, error, save, remove, reload };
}
