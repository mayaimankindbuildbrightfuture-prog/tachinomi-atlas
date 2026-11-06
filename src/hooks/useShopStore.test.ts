import { act, renderHook, waitFor } from '@testing-library/react';
import { makeShop, testSource } from '../tests/fixtures';
import type { ShopRepository, UserShopData } from '../services/storage/shopRepository';
import { useShopStore, type SeedData } from './useShopStore';

function fakeRepo(initial: Partial<UserShopData> = {}, fail?: 'load' | 'save'): ShopRepository {
  return {
    loadUserData: vi.fn(async () => {
      if (fail === 'load') throw new Error('IndexedDB が使えません');
      return { shops: [], deletedShopIds: [], sources: [], ...initial };
    }),
    saveShop: vi.fn(async () => {
      if (fail === 'save') throw new Error('容量不足');
    }),
    deleteShop: vi.fn(async () => undefined),
  };
}

const seed: SeedData = {
  shops: [makeShop({ id: 'seed-1', name: '初期1' }), makeShop({ id: 'seed-2', name: '初期2', latitude: 35.8 })],
  sources: [testSource],
  stations: [],
  issues: [],
};
const seedLoader = () => seed;

describe('useShopStore', () => {
  it('初期データとユーザーデータを統合する', async () => {
    const repo = fakeRepo({
      shops: [makeShop({ id: 'seed-1', name: '編集済み' }), makeShop({ id: 'u1', latitude: 35.9 })],
      deletedShopIds: ['seed-2'],
    });
    const { result } = renderHook(() => useShopStore(repo, seedLoader));
    expect(result.current.status).toBe('loading');
    await waitFor(() => expect(result.current.status).toBe('ready'));
    expect(result.current.shops.map((s) => [s.id, s.name])).toEqual([
      ['seed-1', '編集済み'],
      ['u1', '架空酒場テストA'],
    ]);
    expect(result.current.seedShopIds.has('seed-1')).toBe(true);
  });

  it('保存・削除が状態に反映される', async () => {
    const repo = fakeRepo();
    const { result } = renderHook(() => useShopStore(repo, seedLoader));
    await waitFor(() => expect(result.current.status).toBe('ready'));
    await act(() => result.current.saveShop(makeShop({ id: 'new', latitude: 35.75 }), []));
    expect(result.current.shops.map((s) => s.id)).toContain('new');
    await act(() => result.current.deleteShop('seed-1'));
    expect(repo.deleteShop).toHaveBeenCalledWith('seed-1', true, expect.any(String), {});
    expect(result.current.shops.map((s) => s.id)).not.toContain('seed-1');
  });

  it('不正な店舗は保存しない', async () => {
    const repo = fakeRepo();
    const { result } = renderHook(() => useShopStore(repo, seedLoader));
    await waitFor(() => expect(result.current.status).toBe('ready'));
    await expect(result.current.saveShop(makeShop({ name: '' }), [])).rejects.toThrow('店名');
    expect(repo.saveShop).not.toHaveBeenCalled();
  });

  it('保存失敗時はエラーを表示し、状態を変更しない', async () => {
    const repo = fakeRepo({}, 'save');
    const { result } = renderHook(() => useShopStore(repo, seedLoader));
    await waitFor(() => expect(result.current.status).toBe('ready'));
    await act(async () => {
      await expect(result.current.saveShop(makeShop({ id: 'x', latitude: 35.75 }), [])).rejects.toThrow(
        '保存できませんでした',
      );
    });
    expect(result.current.error).toContain('容量不足');
    expect(result.current.shops.map((s) => s.id)).not.toContain('x');
  });

  it('保存済みデータを読めなくても初期データは表示する', async () => {
    const { result } = renderHook(() => useShopStore(fakeRepo({}, 'load'), seedLoader));
    await waitFor(() => expect(result.current.status).toBe('error'));
    expect(result.current.error).toContain('IndexedDB');
    expect(result.current.shops).toHaveLength(2);
  });

  it('初期データの読み込みに失敗してもクラッシュしない', async () => {
    const { result } = renderHook(() =>
      useShopStore(fakeRepo(), () => {
        throw new Error('壊れたJSON');
      }),
    );
    expect(result.current.error).toContain('壊れたJSON');
    await waitFor(() => expect(result.current.status).toBe('ready'));
    expect(result.current.shops).toEqual([]);
  });
});
