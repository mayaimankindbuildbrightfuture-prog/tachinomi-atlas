import { act, fireEvent, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { MapController, MapEventHandlers } from '../services/map/mapAdapter';
import { styleLoadFailedIssue, webglUnavailableIssue } from '../services/map/mapErrors';
import type { ShopRepository } from '../services/storage/shopRepository';
import { useShopStore, type SeedData } from '../hooks/useShopStore';
import { makeShop, makeVisit, testSource, testStation } from '../tests/fixtures';
import { createRoute } from '../domain/route';
import { useSurveyAreas } from '../hooks/useSurveyAreas';
import { usePersonalStore } from '../hooks/usePersonalStore';
import type { PersonalRepository } from '../services/storage/personalRepository';
import type { BackupRepository } from '../services/storage/backupRepository';
import { BACKUP_FORMAT } from '../domain/backup';
import { useRoutes } from '../hooks/useRoutes';
import type { RouteRepository } from '../services/storage/routeRepository';
import type { SettingsRepository } from '../services/storage/settingsRepository';
import type { SurveyAreaRepository } from '../services/storage/surveyAreaRepository';
import type { SurveyArea } from '../domain/survey';

// 地図ライブラリ（WebGL）は jsdom で動かないため、アダプター層をモックする
const controller: MapController = {
  flyToRegion: vi.fn(),
  resetView: vi.fn(),
  setViewMode: vi.fn(),
  resetNorth: vi.fn(),
  setStyle: vi.fn(),
  setBuildingsVisible: vi.fn(),
  retry: vi.fn(),
  getCamera: vi.fn(),
  destroy: vi.fn(),
  setShops: vi.fn(),
  setSelectedShop: vi.fn(),
  flyToPoint: vi.fn(),
  setPickMode: vi.fn(),
  setDraftPosition: vi.fn(),
  resizeKeepingCenter: vi.fn(),
  setDisplayMode: vi.fn(),
  setDensityGrid: vi.fn(),
  setSurveyAreas: vi.fn(),
  setStations: vi.fn(),
  setStationsVisible: vi.fn(),
  setRoute: vi.fn(),
  fitPoints: vi.fn(),
};
let handlers: MapEventHandlers = {};
const createMapController = vi.fn((_el: HTMLElement, _opts: unknown, h: MapEventHandlers): MapController | null => {
  handlers = h;
  return controller;
});

vi.mock('../services/map/mapAdapter', () => ({
  createMapController: (el: HTMLElement, opts: unknown, h: MapEventHandlers) => createMapController(el, opts, h),
}));
vi.mock('maplibre-gl/dist/maplibre-gl.css', () => ({}));
const downloadJson = vi.fn();
vi.mock('../services/importExport/fileIO', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../services/importExport/fileIO')>()),
  downloadJson: (...args: unknown[]) => downloadJson(...args),
}));

const { App: AppImpl } = await import('./App');

const seed: SeedData = {
  shops: [
    makeShop({
      id: 'seed-1',
      name: '架空酒場ひとつめ',
      status: 'verified',
      sourceIds: [testSource.id],
      lastVerifiedAt: '2026-10-01',
      officialUrl: 'https://example.com/shop',
      priceExamples: [{ itemName: 'ホッピーセット', priceYen: 500, checkedAt: '2026-10-01', sourceId: testSource.id }],
    }),
    makeShop({
      id: 'seed-2',
      name: '架空角打ちふたつめ',
      categories: ['kakuuchi'],
      latitude: 35.8,
      prefecture: '埼玉県',
    }),
  ],
  sources: [testSource],
  stations: [testStation, { ...testStation, id: 'test-station-far', name: '遠方', latitude: 35.9, longitude: 139.6 }],
  issues: [],
};

let repo: ShopRepository;
let seedData: SeedData = seed;
function useTestStore() {
  return useShopStore(repo, () => seedData);
}
// 調査済みエリアはメモリ上の偽ストア
let surveyRepo: SurveyAreaRepository;
function useTestSurveyStore() {
  return useSurveyAreas(surveyRepo);
}

// 個人記録もメモリ上の偽ストア
let personalRepo: PersonalRepository;
function useTestPersonalStore() {
  return usePersonalStore(personalRepo);
}

let backupRepo: BackupRepository;
let routeRepo: RouteRepository;
let settingsRepo: SettingsRepository;
let fetchMock: ReturnType<typeof vi.fn>;
function useTestRouteStore() {
  return useRoutes(routeRepo, settingsRepo);
}

function App() {
  return (
    <AppImpl
      useStore={useTestStore}
      useSurveyStore={useTestSurveyStore}
      usePersonal={useTestPersonalStore}
      backupRepository={backupRepo}
      useRouteStore={useTestRouteStore}
      fetchImpl={fetchMock as unknown as typeof fetch}
    />
  );
}

beforeEach(() => {
  vi.clearAllMocks();
  handlers = {};
  seedData = seed;
  routeRepo = {
    loadAll: vi.fn(async () => []),
    save: vi.fn(async () => undefined),
    delete: vi.fn(async () => undefined),
  };
  let routing = { provider: 'none' as 'none' | 'openrouteservice', orsApiKey: '' };
  settingsRepo = {
    loadRouting: vi.fn(async () => routing),
    saveRouting: vi.fn(async (r) => {
      routing = r;
    }),
  };
  fetchMock = vi.fn();
  backupRepo = {
    exportUserData: vi.fn(async () => ({
      shops: [],
      deletedShopIds: [],
      sources: [],
      visits: [makeVisit({ shopId: 'seed-1' })],
      marks: [],
      surveyAreas: [],
      routes: [],
    })),
    importUserData: vi.fn(async () => undefined),
    getLastBackupAt: vi.fn(async () => null),
    setLastBackupAt: vi.fn(async () => undefined),
  };
  personalRepo = {
    loadAll: vi.fn(async () => ({ visits: [], marks: [] })),
    saveVisit: vi.fn(async () => undefined),
    deleteVisit: vi.fn(async () => undefined),
    saveMark: vi.fn(async () => undefined),
  };
  const saved: SurveyArea[] = [];
  surveyRepo = {
    loadAll: vi.fn(async () => [...saved]),
    save: vi.fn(async (a: SurveyArea) => {
      saved.push(a);
    }),
    delete: vi.fn(async () => undefined),
  };
  repo = {
    loadUserData: vi.fn(async () => ({ shops: [], deletedShopIds: [], sources: [] })),
    saveShop: vi.fn(async () => undefined),
    deleteShop: vi.fn(async () => undefined),
  };
});

describe('App', () => {
  it('タイトル・地域切り替え・地図スタイル・操作ボタンを表示する', () => {
    render(<App />);
    expect(screen.getByRole('heading', { name: '立ち呑み地形図' })).toBeInTheDocument();
    expect(screen.getByLabelText('地域')).toBeInTheDocument();
    expect(screen.getByLabelText('地図スタイル')).toHaveValue('dark');
    expect(screen.getByRole('button', { name: '＋ 店舗を追加' })).toBeInTheDocument();
  });

  it('操作ボタンと選択肢がコントローラーに伝わる', async () => {
    const user = userEvent.setup();
    render(<App />);
    await user.click(screen.getByRole('tab', { name: '地図の表示' }));
    await user.selectOptions(screen.getByLabelText('地域'), 'tokyo23');
    expect(controller.flyToRegion).toHaveBeenCalledWith('tokyo23');

    await user.click(screen.getByRole('button', { name: '東京・埼玉 全域' }));
    expect(controller.flyToRegion).toHaveBeenCalledWith('all');

    await user.click(screen.getByRole('button', { name: '2D表示（真上から）' }));
    expect(controller.setViewMode).toHaveBeenCalledWith('2d');

    await user.click(screen.getByRole('button', { name: '初期表示に戻る' }));
    expect(controller.resetView).toHaveBeenCalled();
    expect(screen.getByLabelText('地域')).toHaveValue('');

    await user.click(screen.getByRole('button', { name: '北を上にする' }));
    expect(controller.resetNorth).toHaveBeenCalled();
  });

  it('スタイルや建物表示を変えても地図を再生成しない', async () => {
    const user = userEvent.setup();
    render(<App />);
    act(() => handlers.onBuildingsAvailability?.('available'));
    await user.click(screen.getByRole('tab', { name: '地図の表示' }));
    await user.selectOptions(screen.getByLabelText('地図スタイル'), 'liberty');
    expect(controller.setStyle).toHaveBeenLastCalledWith('liberty');
    await user.click(screen.getByRole('checkbox', { name: '3D建物' }));
    expect(controller.setBuildingsVisible).toHaveBeenLastCalledWith(false);
    expect(createMapController).toHaveBeenCalledTimes(1);
  });

  it('読み込み中の表示を出す', () => {
    render(<App />);
    act(() => handlers.onStatusChange?.('loading'));
    expect(screen.getByText('地図を読み込み中…')).toHaveAttribute('role', 'status');
  });

  it('接続エラー時に原因と対処を表示し、再読み込み・閉じるが使える', async () => {
    const user = userEvent.setup();
    render(<App />);
    act(() => {
      handlers.onIssue?.(styleLoadFailedIssue(new Error('Failed to fetch'), true));
      handlers.onStatusChange?.('fallback');
    });
    const alert = screen.getByRole('alert');
    expect(alert).toHaveTextContent('地図サービス（OpenFreeMap）に接続できず');
    expect(alert).toHaveTextContent('簡易表示');
    await user.click(screen.getByRole('button', { name: '再読み込み' }));
    expect(controller.retry).toHaveBeenCalled();
    await user.click(screen.getByRole('button', { name: '閉じる' }));
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
  });

  it('WebGL 非対応で地図を作れない場合は致命的エラーを表示し、操作を無効にする', async () => {
    createMapController.mockImplementationOnce((_el, _o, h) => {
      h.onStatusChange?.('failed');
      h.onIssue?.(webglUnavailableIssue(new Error('Failed to initialize WebGL')));
      return null;
    });
    render(<App />);
    expect(screen.getByRole('alert')).toHaveTextContent('WebGL');
    expect(screen.queryByRole('button', { name: '再読み込み' })).not.toBeInTheDocument();
    await userEvent.setup().click(screen.getByRole('tab', { name: '地図の表示' }));
    expect(screen.getByRole('button', { name: '初期表示に戻る' })).toBeDisabled();
    expect(screen.getByText('地図を表示できません')).toBeInTheDocument();
  });

  it('サイドパネルを開閉できる', async () => {
    const user = userEvent.setup();
    render(<App />);
    await user.click(screen.getByRole('button', { name: '◀ 閉じる' }));
    expect(screen.queryByRole('heading', { name: '表示レイヤー' })).not.toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: '▶' }));
    await user.click(screen.getByRole('tab', { name: '地図の表示' }));
    expect(screen.getByRole('heading', { name: '表示レイヤー' })).toBeInTheDocument();
  });
});

describe('店舗の表示・検索', () => {
  it('店舗一覧と件数を表示し、地図へ店舗データを渡す', async () => {
    render(<App />);
    expect(await screen.findByRole('button', { name: /架空酒場ひとつめ/ })).toBeInTheDocument();
    expect(screen.getByTestId('result-count')).toHaveTextContent('2');
    expect(controller.setShops).toHaveBeenLastCalledWith(expect.objectContaining({ features: expect.any(Array) }));
    const fc = vi.mocked(controller.setShops).mock.lastCall![0];
    expect(fc.features).toHaveLength(2);
  });

  it('検索欄と絞り込みが組み合わさり、条件の解除ができる', async () => {
    const user = userEvent.setup();
    render(<App />);
    await screen.findByRole('button', { name: /架空酒場ひとつめ/ });
    await user.type(screen.getByRole('searchbox', { name: '店名・住所で検索' }), '架空');
    expect(screen.getByTestId('result-count')).toHaveTextContent('2');
    await user.click(screen.getByText('絞り込み条件'));
    await user.click(screen.getByRole('checkbox', { name: '埼玉県' }));
    expect(screen.getByTestId('result-count')).toHaveTextContent('1');
    expect(screen.getByRole('button', { name: '埼玉県 ✕' })).toBeInTheDocument();
    await user.click(screen.getByRole('checkbox', { name: /焼きとん/ }));
    expect(screen.getByTestId('result-count')).toHaveTextContent('0');
    expect(screen.getByText('条件に合う店舗がありません。')).toBeInTheDocument();
    expect(vi.mocked(controller.setShops).mock.lastCall![0].features).toHaveLength(0);
    await user.click(screen.getByRole('button', { name: '条件をすべて解除' }));
    expect(screen.getByTestId('result-count')).toHaveTextContent('2');
    expect(screen.getByRole('searchbox', { name: '店名・住所で検索' })).toHaveValue('');
  });

  it('店舗がない場合は登録を案内する', async () => {
    seedData = { ...seed, shops: [] };
    render(<App />);
    expect(await screen.findByText('店舗データがまだ登録されていません。')).toBeInTheDocument();
  });

  it('一覧・地図から店舗を選ぶと詳細を表示し、不明な情報は「未確認」と表示する', async () => {
    const user = userEvent.setup();
    render(<App />);
    await user.click(await screen.findByRole('button', { name: /架空酒場ひとつめ/ }));
    let detail = screen.getByRole('complementary', { name: '店舗の詳細' });
    expect(within(detail).getByRole('heading', { name: '架空酒場ひとつめ' })).toBeInTheDocument();
    expect(within(detail).getByText('確認済み')).toBeInTheDocument();
    expect(within(detail).getByText('￥500')).toBeInTheDocument();
    expect(within(detail).getAllByText('未確認').length).toBeGreaterThan(0);
    expect(within(detail).getByRole('link', { name: /^開く（example\.com）/ })).toHaveAttribute(
      'rel',
      'noopener noreferrer',
    );
    expect(controller.flyToPoint).toHaveBeenCalledWith(35.7, 139.7, undefined);
    expect(controller.setSelectedShop).toHaveBeenLastCalledWith('seed-1');

    act(() => handlers.onShopClick?.('seed-2'));
    detail = screen.getByRole('complementary', { name: '店舗の詳細' });
    expect(within(detail).getByRole('heading', { name: '架空角打ちふたつめ' })).toBeInTheDocument();
    expect(within(detail).getByText(/この店舗の情報は確認されていません/)).toBeInTheDocument();

    await user.click(within(detail).getByRole('button', { name: '詳細パネルを閉じる' }));
    expect(screen.queryByRole('complementary', { name: '店舗の詳細' })).not.toBeInTheDocument();
  });
});

describe('店舗の追加・編集・削除', () => {
  it('地図クリックで位置を選び、店舗を追加できる', async () => {
    const user = userEvent.setup();
    render(<App />);
    await screen.findByRole('button', { name: /架空酒場ひとつめ/ });
    await user.click(screen.getByRole('button', { name: '＋ 店舗を追加' }));
    const editor = screen.getByRole('complementary', { name: '店舗の編集' });

    // 必須項目が無いと保存できない
    await user.click(within(editor).getByRole('button', { name: '保存' }));
    expect(within(editor).getByRole('alert')).toHaveTextContent('店名は必須');
    expect(repo.saveShop).not.toHaveBeenCalled();

    await user.type(within(editor).getByLabelText(/^店名/), '架空の新店');
    await user.click(within(editor).getByRole('button', { name: '地図をクリックして位置を選択' }));
    expect(controller.setPickMode).toHaveBeenLastCalledWith(true);
    act(() => handlers.onMapPick?.({ latitude: 35.71234567, longitude: 139.81234567 }));
    expect(controller.setPickMode).toHaveBeenLastCalledWith(false);
    expect(within(editor).getByLabelText(/^緯度/)).toHaveValue('35.712346');
    expect(controller.setDraftPosition).toHaveBeenLastCalledWith({ latitude: 35.712346, longitude: 139.812346 });

    await user.click(within(editor).getByRole('button', { name: '保存' }));
    expect(repo.saveShop).toHaveBeenCalledTimes(1);
    const [saved] = vi.mocked(repo.saveShop).mock.lastCall!;
    expect(saved).toMatchObject({
      name: '架空の新店',
      latitude: 35.712346,
      status: 'unverified',
      priceLevel: 'unknown',
    });
    expect(await screen.findByRole('heading', { name: '架空の新店' })).toBeInTheDocument();
    expect(screen.getByTestId('result-count')).toHaveTextContent('3');
  });

  it('同名の店舗が近くにある場合は確認しないと保存できない', async () => {
    const user = userEvent.setup();
    render(<App />);
    await screen.findByRole('button', { name: /架空酒場ひとつめ/ });
    await user.click(screen.getByRole('button', { name: '＋ 店舗を追加' }));
    const editor = screen.getByRole('complementary', { name: '店舗の編集' });
    await user.type(within(editor).getByLabelText(/^店名/), '架空酒場ひとつめ');
    await user.type(within(editor).getByLabelText(/^緯度/), '35.7001');
    await user.type(within(editor).getByLabelText(/^経度/), '139.7');
    expect(within(editor).getByText(/同じ名前の店舗が近く/)).toBeInTheDocument();
    await user.click(within(editor).getByRole('button', { name: '保存' }));
    expect(repo.saveShop).not.toHaveBeenCalled();
    await user.click(within(editor).getByRole('checkbox', { name: '別の店舗として登録する' }));
    await user.click(within(editor).getByRole('button', { name: '保存' }));
    expect(repo.saveShop).toHaveBeenCalledTimes(1);
  });

  it('出典を追加して確認済みとして編集できる', async () => {
    const user = userEvent.setup();
    render(<App />);
    await user.click(await screen.findByRole('button', { name: /架空角打ちふたつめ/ }));
    await user.click(screen.getByRole('button', { name: '編集' }));
    const editor = screen.getByRole('complementary', { name: '店舗の編集' });
    await user.selectOptions(within(editor).getByLabelText(/^確認状況/), 'verified');
    await user.click(within(editor).getByRole('button', { name: '保存' }));
    expect(within(editor).getByRole('alert')).toHaveTextContent('出典を1件以上');

    await user.click(within(editor).getByText('新しい出典を追加'));
    await user.type(within(editor).getByLabelText(/^出典名/), '架空の公式サイト');
    await user.type(within(editor).getByLabelText(/^出典URL/), 'https://example.com/kakuuchi');
    await user.click(within(editor).getByRole('button', { name: '出典を追加' }));
    expect(within(editor).getByRole('checkbox', { name: /架空の公式サイト/ })).toBeChecked();
    fireEvent.change(within(editor).getByLabelText(/^最終確認日/), { target: { value: '2026-10-29' } });
    await user.click(within(editor).getByRole('button', { name: '保存' }));

    expect(repo.saveShop).toHaveBeenCalledTimes(1);
    const [saved, newSources] = vi.mocked(repo.saveShop).mock.lastCall!;
    expect(saved).toMatchObject({ id: 'seed-2', status: 'verified', lastVerifiedAt: '2026-10-29' });
    expect(newSources).toEqual([
      expect.objectContaining({ name: '架空の公式サイト', url: 'https://example.com/kakuuchi' }),
    ]);
    const detail = await screen.findByRole('complementary', { name: '店舗の詳細' });
    expect(within(detail).getByText('架空の公式サイト')).toBeInTheDocument();
  });

  it('確認のうえ店舗を削除でき、キャンセルもできる', async () => {
    const user = userEvent.setup();
    render(<App />);
    await user.click(await screen.findByRole('button', { name: /架空酒場ひとつめ/ }));
    await user.click(screen.getByRole('button', { name: '削除' }));
    const dialog = screen.getByRole('dialog', { name: '店舗を削除しますか？' });
    expect(dialog).toHaveTextContent('初期データの店舗のため');
    await user.click(within(dialog).getByRole('button', { name: 'キャンセル' }));
    expect(repo.deleteShop).not.toHaveBeenCalled();

    await user.click(screen.getByRole('button', { name: '削除' }));
    await user.click(within(screen.getByRole('dialog')).getByRole('button', { name: '削除する' }));
    expect(repo.deleteShop).toHaveBeenCalledWith('seed-1', true, expect.any(String), { deleteVisits: false });
    expect(screen.queryByRole('button', { name: /架空酒場ひとつめ/ })).not.toBeInTheDocument();
    expect(screen.getByTestId('result-count')).toHaveTextContent('1');
  });

  it('保存に失敗した場合はエラーを表示する', async () => {
    vi.mocked(repo.saveShop).mockRejectedValueOnce(new Error('QuotaExceededError'));
    const user = userEvent.setup();
    render(<App />);
    await user.click(await screen.findByRole('button', { name: /架空角打ちふたつめ/ }));
    await user.click(screen.getByRole('button', { name: '編集' }));
    const editor = screen.getByRole('complementary', { name: '店舗の編集' });
    await user.click(within(editor).getByRole('button', { name: '保存' }));
    expect(await within(editor).findByText(/店舗データを保存できませんでした：QuotaExceededError/)).toBeInTheDocument();
  });
});

describe('密度・比較（Phase 3）', () => {
  it('表示モードを切り替えると地図と凡例に反映され、3D柱では格子を渡す', async () => {
    const user = userEvent.setup();
    render(<App />);
    await screen.findByRole('button', { name: /架空酒場ひとつめ/ });
    expect(screen.getByRole('region', { name: '凡例' })).toHaveTextContent('凡例：店舗マーカー');

    await user.click(screen.getByRole('tab', { name: '地図の表示' }));
    await user.click(screen.getByRole('radio', { name: '密度（ヒートマップ）' }));
    expect(controller.setDisplayMode).toHaveBeenLastCalledWith('heatmap');
    const legend = screen.getByRole('region', { name: '凡例' });
    expect(legend).toHaveTextContent('凡例：密度（ヒートマップ）');
    expect(legend).toHaveTextContent('調査済みエリアは未登録です');
    expect(legend).toHaveTextContent('対象：検索条件に合う 2 件');

    await user.click(screen.getByRole('radio', { name: '密度（3D柱）' }));
    expect(controller.setDisplayMode).toHaveBeenLastCalledWith('grid');
    const [grid, size] = vi.mocked(controller.setDensityGrid).mock.lastCall!;
    expect(size).toBe(500);
    expect(grid.features.reduce((n, f) => n + f.properties.count, 0)).toBe(2);
    expect(screen.getByRole('region', { name: '凡例' })).toHaveTextContent('色なし：データなし（未調査）');

    await user.selectOptions(screen.getByLabelText('マスの大きさ'), '1000');
    expect(vi.mocked(controller.setDensityGrid).mock.lastCall![1]).toBe(1000);

    await user.click(screen.getByRole('radio', { name: 'ジャンル別の分布' }));
    expect(screen.getByRole('region', { name: '凡例' })).toHaveTextContent('焼きとん・焼き鳥（1）');
    await user.click(screen.getByRole('radio', { name: '訪問済み店舗の分布' }));
    expect(controller.setDisplayMode).toHaveBeenLastCalledWith('visited');
    expect(screen.getByRole('region', { name: '凡例' })).toHaveTextContent('訪問済み（0）');
  });

  it('密度の集計に検索条件が反映される', async () => {
    const user = userEvent.setup();
    render(<App />);
    await screen.findByRole('button', { name: /架空酒場ひとつめ/ });
    await user.click(screen.getByRole('tab', { name: '地図の表示' }));
    await user.click(screen.getByRole('radio', { name: '密度（3D柱）' }));
    await user.type(screen.getByRole('searchbox', { name: '店名・住所で検索' }), '角打ち');
    const [grid] = vi.mocked(controller.setDensityGrid).mock.lastCall!;
    expect(grid.features.reduce((n, f) => n + f.properties.count, 0)).toBe(1);
  });

  it('駅の表示を切り替えられ、駅データを地図に渡す', async () => {
    const user = userEvent.setup();
    render(<App />);
    expect(vi.mocked(controller.setStations).mock.lastCall![0].features).toHaveLength(2);
    await user.click(screen.getByRole('tab', { name: '地図の表示' }));
    await user.click(screen.getByRole('checkbox', { name: '駅（2駅）' }));
    expect(controller.setStationsVisible).toHaveBeenLastCalledWith(true);
  });

  it('比較タブで市区町村別・駅周辺の件数を表示し、駅から店舗を探せる', async () => {
    const user = userEvent.setup();
    render(<App />);
    await screen.findByRole('button', { name: /架空酒場ひとつめ/ });
    await user.click(screen.getByRole('tab', { name: '比較・集計' }));
    expect(screen.getByText(/登録済みの店舗の件数/)).toBeInTheDocument();
    // 同名の市区町村でも都道府県ごとに分けて集計する
    expect(screen.getAllByRole('cell', { name: /架空区/ })).toHaveLength(2);

    const ranking = screen.getByRole('list', { name: '駅周辺の店舗数' });
    expect(within(ranking).getByRole('button', { name: /架空.*1件/ })).toBeInTheDocument();
    await user.click(within(ranking).getByRole('button', { name: /架空.*1件/ }));

    // 店舗タブに戻り、駅を起点とした条件が適用される
    expect(screen.getByRole('tab', { name: '店舗を探す' })).toHaveAttribute('aria-selected', 'true');
    expect(screen.getByRole('button', { name: '架空駅から500m以内 ✕' })).toBeInTheDocument();
    expect(screen.getByTestId('result-count')).toHaveTextContent('1');
    expect(controller.flyToPoint).toHaveBeenLastCalledWith(testStation.latitude, testStation.longitude, 15);
  });

  it('調査済みエリアを駅から追加・削除でき、地図に渡す', async () => {
    const user = userEvent.setup();
    render(<App />);
    await screen.findByRole('button', { name: /架空酒場ひとつめ/ });
    await user.click(screen.getByRole('tab', { name: '比較・集計' }));
    await user.click(screen.getByRole('button', { name: '＋ 調査済みエリアを追加' }));
    const form = screen.getByRole('group', { name: '調査済みエリアの追加' });
    await user.click(within(form).getByRole('button', { name: 'エリアを保存' }));
    expect(within(form).getByRole('alert')).toHaveTextContent('エリア名は必須');

    await user.selectOptions(within(form).getByLabelText('中心にする駅'), testStation.id);
    expect(within(form).getByLabelText(/エリア名/)).toHaveValue('架空駅周辺');
    await user.click(within(form).getByRole('button', { name: 'エリアを保存' }));
    expect(surveyRepo.save).toHaveBeenCalledWith(
      expect.objectContaining({ name: '架空駅周辺', centerLatitude: testStation.latitude, radiusM: 500 }),
    );
    expect(await screen.findByRole('button', { name: '架空駅周辺' })).toBeInTheDocument();
    expect(vi.mocked(controller.setSurveyAreas).mock.lastCall![0].features).toHaveLength(1);

    // 地図クリックで中心を選ぶモードは、店舗の位置選択と区別される
    await user.click(screen.getByRole('button', { name: '＋ 調査済みエリアを追加' }));
    await user.click(screen.getByRole('button', { name: '地図をクリックして中心を選択' }));
    expect(screen.getByText(/調査済みエリアの中心をクリック/)).toBeInTheDocument();
    act(() => handlers.onMapPick?.({ latitude: 35.8, longitude: 139.65 }));
    expect(screen.getByLabelText('中心の緯度')).toHaveValue('35.800000');
    await user.click(screen.getByRole('button', { name: 'キャンセル' }));

    await user.click(screen.getByRole('button', { name: '削除' }));
    await user.click(within(screen.getByRole('dialog')).getByRole('button', { name: '削除する' }));
    expect(surveyRepo.delete).toHaveBeenCalled();
    expect(screen.queryByRole('button', { name: '架空駅周辺' })).not.toBeInTheDocument();
  });

  it('店舗詳細に近くの駅（直線距離）を表示する', async () => {
    const user = userEvent.setup();
    render(<App />);
    await user.click(await screen.findByRole('button', { name: /架空酒場ひとつめ/ }));
    const detail = screen.getByRole('complementary', { name: '店舗の詳細' });
    expect(within(detail).getByText(/架空（約140m）/)).toBeInTheDocument();
    expect(within(detail).getByText('（直線距離・参考）')).toBeInTheDocument();
  });
});

describe('個人記録（Phase 4）', () => {
  async function openShop(user: ReturnType<typeof userEvent.setup>, name: RegExp) {
    await user.click(await screen.findByRole('button', { name }));
    return screen.getByRole('complementary', { name: '店舗の詳細' });
  }

  it('お気に入り・行きたい店・再訪したいを登録・解除でき、店舗データ本体には混ぜない', async () => {
    const user = userEvent.setup();
    render(<App />);
    const detail = await openShop(user, /架空酒場ひとつめ/);
    const fav = within(detail).getByRole('button', { name: /お気に入り/ });
    expect(fav).toHaveAttribute('aria-pressed', 'false');
    await user.click(fav);
    expect(fav).toHaveAttribute('aria-pressed', 'true');
    expect(personalRepo.saveMark).toHaveBeenLastCalledWith(
      expect.objectContaining({ shopId: 'seed-1', favorite: true }),
    );
    await user.click(within(detail).getByRole('button', { name: /行きたい店/ }));
    await user.click(fav);
    expect(personalRepo.saveMark).toHaveBeenLastCalledWith(
      expect.objectContaining({ shopId: 'seed-1', favorite: false, wantToGo: true }),
    );
    expect(repo.saveShop).not.toHaveBeenCalled();
  });

  it('訪問記録を追加・編集・削除でき、記録タブの履歴に表示される', async () => {
    const user = userEvent.setup();
    render(<App />);
    const detail = await openShop(user, /架空酒場ひとつめ/);
    await user.click(within(detail).getByRole('button', { name: '＋ 訪問記録を追加' }));
    const dialog = screen.getByRole('dialog', { name: '訪問記録を追加' });
    fireEvent.change(within(dialog).getByLabelText(/訪問日時/), { target: { value: '2026-10-28T19:30' } });
    await user.type(within(dialog).getByLabelText(/支払った金額/), '1,800円');
    await user.click(within(dialog).getByRole('radio', { name: /★★★★4/ }));
    await user.type(within(dialog).getByLabelText(/注文した品/), 'ホッピーセット{enter}もつ煮込み');
    await user.click(within(dialog).getByRole('checkbox', { name: '一人飲み向き' }));
    await user.type(within(dialog).getByLabelText(/感想・メモ/), '架空の感想');
    await user.click(within(dialog).getByRole('button', { name: '保存' }));

    expect(personalRepo.saveVisit).toHaveBeenCalledWith(
      expect.objectContaining({
        shopId: 'seed-1',
        visitedAt: '2026-10-28T19:30:00+09:00',
        amountYen: 1800,
        rating: 4,
        orderedItems: ['ホッピーセット', 'もつ煮込み'],
        atmosphereTags: ['一人飲み向き'],
        memo: '架空の感想',
        shopNameAtVisit: '架空酒場ひとつめ',
      }),
    );
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    expect(within(detail).getByText('訪問記録（1件）')).toBeInTheDocument();
    expect(within(detail).getByText('注文：ホッピーセット、もつ煮込み')).toBeInTheDocument();

    // 編集
    // 1つ目は店舗の「編集」、2つ目が訪問記録の「編集」
    await user.click(within(detail).getAllByRole('button', { name: '編集' })[1]!);
    const edit = screen.getByRole('dialog', { name: '訪問記録を編集' });
    await user.clear(within(edit).getByLabelText(/感想・メモ/));
    await user.type(within(edit).getByLabelText(/感想・メモ/), '書き直した');
    await user.click(within(edit).getByRole('button', { name: '保存' }));
    expect(within(detail).getByText('書き直した')).toBeInTheDocument();
    expect(within(detail).getByText('訪問記録（1件）')).toBeInTheDocument();

    // 記録タブ
    await user.click(screen.getByRole('tab', { name: '記録' }));
    const history = screen.getByRole('list', { name: '訪問履歴' });
    expect(within(history).getByText('2026年10月')).toBeInTheDocument();
    expect(within(history).getByRole('button', { name: '架空酒場ひとつめ' })).toBeInTheDocument();
    expect(screen.getByText('訪問').nextSibling).toHaveTextContent('1回');

    // 削除
    await user.click(within(detail).getAllByRole('button', { name: '削除' })[1]!);
    await user.click(
      within(screen.getByRole('dialog', { name: '訪問記録を削除しますか？' })).getByRole('button', {
        name: '削除する',
      }),
    );
    expect(personalRepo.deleteVisit).toHaveBeenCalled();
    expect(within(detail).getByText('訪問記録（0件）')).toBeInTheDocument();
  });

  it('評価や日時の不正は保存しない', async () => {
    const user = userEvent.setup();
    render(<App />);
    const detail = await openShop(user, /架空酒場ひとつめ/);
    await user.click(within(detail).getByRole('button', { name: '＋ 訪問記録を追加' }));
    const dialog = screen.getByRole('dialog', { name: '訪問記録を追加' });
    fireEvent.change(within(dialog).getByLabelText(/訪問日時/), { target: { value: '' } });
    await user.type(within(dialog).getByLabelText(/支払った金額/), 'たくさん');
    await user.click(within(dialog).getByRole('button', { name: '保存' }));
    expect(within(dialog).getByRole('alert')).toHaveTextContent('訪問日時を入力してください');
    expect(within(dialog).getByRole('alert')).toHaveTextContent('金額は0以上の整数');
    expect(personalRepo.saveVisit).not.toHaveBeenCalled();
  });

  it('訪問済み・お気に入りで絞り込め、訪問済みの分布に反映される', async () => {
    vi.mocked(personalRepo.loadAll).mockResolvedValue({
      visits: [makeVisit({ shopId: 'seed-2' })],
      marks: [
        { shopId: 'seed-1', favorite: true, wantToGo: false, revisit: false, updatedAt: '2026-10-29T00:00:00.000Z' },
      ],
    });
    const user = userEvent.setup();
    render(<App />);
    await screen.findByRole('button', { name: /架空酒場ひとつめ/ });
    await user.click(screen.getByText('絞り込み条件'));
    const records = screen.getByRole('group', { name: '自分の記録' });
    await user.click(within(records).getByRole('radio', { name: '訪問済み' }));
    expect(screen.getByTestId('result-count')).toHaveTextContent('1');
    expect(screen.getByRole('button', { name: /架空角打ちふたつめ/ })).toBeInTheDocument();
    await user.click(within(records).getByRole('radio', { name: '未訪問' }));
    expect(screen.getByRole('button', { name: /架空酒場ひとつめ/ })).toBeInTheDocument();
    await user.click(within(records).getByRole('radio', { name: '指定なし' }));
    await user.click(within(records).getByRole('checkbox', { name: 'お気に入り' }));
    expect(screen.getByTestId('result-count')).toHaveTextContent('1');
    expect(screen.getByRole('button', { name: 'お気に入り ✕' })).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: '条件をすべて解除' }));

    const fc = vi.mocked(controller.setShops).mock.lastCall![0];
    expect(fc.features.find((f) => f.properties.id === 'seed-2')!.properties.visited).toBe(true);
    expect(fc.features.find((f) => f.properties.id === 'seed-1')!.properties.visited).toBe(false);
  });

  it('訪問記録のある店舗を削除するとき、記録を残すか選べる', async () => {
    vi.mocked(personalRepo.loadAll).mockResolvedValue({ visits: [makeVisit({ shopId: 'seed-1' })], marks: [] });
    const user = userEvent.setup();
    render(<App />);
    await openShop(user, /架空酒場ひとつめ/);
    await user.click(screen.getAllByRole('button', { name: '削除' })[0]!);
    const dialog = screen.getByRole('dialog', { name: '店舗を削除しますか？' });
    expect(within(dialog).getByRole('radio', { name: /訪問記録を残す/ })).toBeChecked();
    await user.click(within(dialog).getByRole('radio', { name: '訪問記録も削除する' }));
    await user.click(within(dialog).getByRole('button', { name: '削除する' }));
    expect(repo.deleteShop).toHaveBeenCalledWith('seed-1', true, expect.any(String), { deleteVisits: true });
  });

  it('削除した店舗の訪問記録は、記録時の店名で履歴に残る', async () => {
    vi.mocked(personalRepo.loadAll).mockResolvedValue({
      visits: [makeVisit({ shopId: 'deleted-shop', shopNameAtVisit: '閉じた架空店' })],
      marks: [],
    });
    const user = userEvent.setup();
    render(<App />);
    await user.click(screen.getByRole('tab', { name: '記録' }));
    expect(await screen.findByText('閉じた架空店')).toBeInTheDocument();
    expect(screen.getByText('（削除された店舗）')).toBeInTheDocument();
  });
});

describe('データ管理（JSON の書き出し・読み込み）', () => {
  const backupText = (data: unknown) =>
    JSON.stringify({ format: BACKUP_FORMAT, version: 1, kind: 'full', exportedAt: '2026-10-01T00:00:00.000Z', data });

  async function openManager(user: ReturnType<typeof userEvent.setup>) {
    await screen.findByRole('button', { name: /架空酒場ひとつめ/ });
    await user.click(screen.getByRole('button', { name: 'データ管理' }));
    return screen.getByRole('dialog', { name: 'データ管理' });
  }

  it('全データを書き出し、最終バックアップ日時を記録する', async () => {
    const user = userEvent.setup();
    render(<App />);
    const dialog = await openManager(user);
    expect(await within(dialog).findByTestId('last-backup')).toHaveTextContent('まだありません');
    expect(within(dialog).getByText(/個人的なメモが含まれます/)).toBeInTheDocument();
    await user.click(within(dialog).getByRole('button', { name: '全データのバックアップを書き出す' }));
    expect(downloadJson).toHaveBeenCalledWith(
      expect.stringMatching(/^tachinomi-atlas-backup-\d{12}\.json$/),
      expect.objectContaining({ format: BACKUP_FORMAT, kind: 'full' }),
    );
    expect(backupRepo.setLastBackupAt).toHaveBeenCalled();
    expect(within(dialog).getByRole('status')).toHaveTextContent('訪問記録1件');
  });

  it('店舗データの書き出しには初期データを含む', async () => {
    const user = userEvent.setup();
    render(<App />);
    const dialog = await openManager(user);
    await user.click(within(dialog).getByRole('button', { name: '店舗データを書き出す' }));
    const [, file] = downloadJson.mock.lastCall!;
    expect((file as { data: { shops: unknown[] } }).data.shops).toHaveLength(2);
  });

  it('読み込みは検証結果を見せてから、確認後に実行する', async () => {
    const user = userEvent.setup();
    render(<App />);
    const dialog = await openManager(user);
    const file = new File(
      [backupText({ visits: [makeVisit({ shopId: 'seed-1' }), makeVisit({ id: 'v2', shopId: 'nowhere' })] })],
      'b.json',
      {
        type: 'application/json',
      },
    );
    await user.upload(within(dialog).getByLabelText('書き出した JSON ファイルを選ぶ'), file);
    const preview = await within(dialog).findByLabelText('読み込む内容');
    expect(preview).toHaveTextContent('訪問記録2件');
    expect(preview).toHaveTextContent('店舗が見つからない訪問記録が 1 件');
    expect(backupRepo.importUserData).not.toHaveBeenCalled();

    await user.click(within(preview).getByRole('checkbox', { name: '店舗が見つからない記録も読み込む' }));
    expect(preview).toHaveTextContent('訪問記録1件');
    await user.click(within(preview).getByRole('radio', { name: /置き換える/ }));
    await user.click(within(preview).getByRole('button', { name: '読み込む…' }));
    expect(within(preview).getByRole('alertdialog')).toHaveTextContent('すべて削除');
    await user.click(within(preview).getByRole('button', { name: '置き換えて読み込む' }));
    expect(backupRepo.importUserData).toHaveBeenCalledWith(
      expect.objectContaining({ visits: [expect.objectContaining({ id: 'visit-1' })] }),
      'replace',
      expect.any(String),
    );
    expect(await within(dialog).findByText('読み込みが完了しました。')).toBeInTheDocument();
    // 読み込み後に各データを読み込み直す
    expect(personalRepo.loadAll).toHaveBeenCalledTimes(2);
    expect(repo.loadUserData).toHaveBeenCalledTimes(2);
  });

  it('不正なファイルはエラーを表示し、読み込まない', async () => {
    const user = userEvent.setup();
    render(<App />);
    const dialog = await openManager(user);
    await user.upload(
      within(dialog).getByLabelText('書き出した JSON ファイルを選ぶ'),
      new File(['{"format":"other"}'], 'x.json', { type: 'application/json' }),
    );
    expect(
      await within(dialog).findByText('このファイルは読み込めません。データは変更していません。'),
    ).toBeInTheDocument();
    expect(within(dialog).queryByRole('button', { name: '読み込む…' })).not.toBeInTheDocument();
  });

  it('保存に失敗した場合は、データが変更されていないことを伝える', async () => {
    vi.mocked(backupRepo.importUserData).mockRejectedValueOnce(new Error('QuotaExceededError'));
    const user = userEvent.setup();
    render(<App />);
    const dialog = await openManager(user);
    await user.upload(
      within(dialog).getByLabelText('書き出した JSON ファイルを選ぶ'),
      new File([backupText({ visits: [makeVisit({ shopId: 'seed-1' })] })], 'b.json', { type: 'application/json' }),
    );
    await user.click(await within(dialog).findByRole('button', { name: '読み込む…' }));
    await user.click(within(dialog).getByRole('button', { name: '統合して読み込む' }));
    expect(await within(dialog).findByRole('alert')).toHaveTextContent('データは変更されていません');
  });
});

describe('はしご酒プランナー（Phase 5）', () => {
  async function addFromDetail(user: ReturnType<typeof userEvent.setup>, name: RegExp) {
    await user.click(screen.getByRole('tab', { name: '店舗を探す' }));
    await user.click(await screen.findByRole('button', { name }));
    const detail = screen.getByRole('complementary', { name: '店舗の詳細' });
    await user.click(within(detail).getByRole('button', { name: '＋ はしご酒に追加' }));
    return detail;
  }

  it('店舗詳細から追加すると新しいルートが作られ、順番・距離（概算）を表示し、並べ替え・削除できる', async () => {
    const user = userEvent.setup();
    render(<App />);
    const detail = await addFromDetail(user, /架空酒場ひとつめ/);
    expect(within(detail).getByText('「はしご酒 1」の1軒目')).toBeInTheDocument();
    expect(routeRepo.save).toHaveBeenLastCalledWith(
      expect.objectContaining({ name: 'はしご酒 1', shopIds: ['seed-1'] }),
    );
    await addFromDetail(user, /架空角打ちふたつめ/);

    await user.click(screen.getByRole('tab', { name: 'はしご酒' }));
    const itinerary = screen.getByRole('list', { name: '行程' });
    expect(
      within(itinerary)
        .getAllByRole('group', { name: /軒目/ })
        .map((g) => g.getAttribute('aria-label')),
    ).toEqual(['1軒目 架空酒場ひとつめ', '2軒目 架空角打ちふたつめ']);
    // 直線距離と概算であることを明示する
    expect(within(itinerary).getByText(/直線 11\.1km・徒歩の目安 約139分（概算）/)).toBeInTheDocument();
    expect(screen.getByText(/直線距離の合計。実際の道のりはこれより長くなります/)).toBeInTheDocument();
    // 地図に番号付きで表示（経路未取得なので直線）
    const [line, stops] = vi.mocked(controller.setRoute).mock.lastCall!;
    expect(stops.features.map((f) => f.properties.label)).toEqual(['1', '2']);
    expect(line.features[0]!.properties.kind).toBe('straight');

    await user.click(screen.getByRole('button', { name: '架空角打ちふたつめを前へ' }));
    expect(
      within(screen.getByRole('list', { name: '行程' })).getAllByRole('group', { name: /軒目/ })[0],
    ).toHaveAttribute('aria-label', '1軒目 架空角打ちふたつめ');
    await user.click(screen.getByRole('button', { name: '架空酒場ひとつめをルートから外す' }));
    expect(within(screen.getByRole('list', { name: '行程' })).getAllByRole('group', { name: /軒目/ })).toHaveLength(1);
    expect(routeRepo.save).toHaveBeenLastCalledWith(expect.objectContaining({ shopIds: ['seed-2'] }));

    await user.click(screen.getByRole('button', { name: '地図でルート全体を表示' }));
    expect(controller.fitPoints).toHaveBeenCalled();
  });

  it('予定日・開始時刻・滞在時間から到着時刻を計算し、営業時間・予算・所要時間と比べる', async () => {
    seedData = {
      ...seed,
      shops: seed.shops.map((s) =>
        s.id === 'seed-1'
          ? { ...s, openingHours: [{ dayOfWeek: 5, opensAt: '16:00', closesAt: '19:00', isClosed: false }] }
          : s,
      ),
    };
    const user = userEvent.setup();
    render(<App />);
    await addFromDetail(user, /架空酒場ひとつめ/);
    await user.click(screen.getByRole('tab', { name: 'はしご酒' }));
    fireEvent.change(screen.getByLabelText('予定日'), { target: { value: '2026-10-30' } });
    fireEvent.change(screen.getByLabelText('開始時刻'), { target: { value: '18:30' } });
    const stop = screen.getByRole('group', { name: '1軒目 架空酒場ひとつめ' });
    expect(within(stop).getByText('営業時間（金曜）：16:00〜19:00')).toBeInTheDocument();
    expect(within(stop).getByText(/18:30〜19:15/)).toBeInTheDocument();
    expect(within(stop).getByText('営業時間外を含む')).toBeInTheDocument();

    fireEvent.change(within(stop).getByLabelText('架空酒場ひとつめの滞在時間（分）'), { target: { value: '20' } });
    expect(within(stop).getByText('営業時間内（登録情報）')).toBeInTheDocument();

    // 頼む予定の品と予算
    fireEvent.change(screen.getByLabelText('予算（円）'), { target: { value: '400' } });
    await user.click(within(stop).getByText(/頼む予定の品/));
    await user.click(within(stop).getByRole('checkbox', { name: 'ホッピーセット（￥500）' }));
    const totals = screen.getByRole('region', { name: 'ルートの合計' });
    expect(totals).toHaveTextContent('予算 ￥400 に対して ￥100 超過');
    expect(totals).toHaveTextContent('お通し・チャージ・税・サービス料は含みません');

    fireEvent.change(screen.getByLabelText('想定所要時間（分）'), { target: { value: '15' } });
    expect(totals).toHaveTextContent('5分 超過');
  });

  it('外部サービスは設定するまで使わず、設定後は取得した徒歩ルートを表示する', async () => {
    fetchMock.mockResolvedValue(
      new Response(
        JSON.stringify({
          features: [
            {
              geometry: {
                type: 'LineString',
                coordinates: [
                  [139.7, 35.7],
                  [139.705, 35.75],
                  [139.7, 35.8],
                ],
              },
              properties: { segments: [{ distance: 13500, duration: 9600 }] },
            },
          ],
        }),
        { status: 200 },
      ),
    );
    const user = userEvent.setup();
    render(<App />);
    await addFromDetail(user, /架空酒場ひとつめ/);
    await addFromDetail(user, /架空角打ちふたつめ/);
    await user.click(screen.getByRole('tab', { name: 'はしご酒' }));
    expect(screen.getByRole('button', { name: '徒歩ルートを取得' })).toBeDisabled();

    await user.click(screen.getByText('徒歩ルートの設定'));
    await user.click(screen.getByRole('radio', { name: /openrouteservice で徒歩ルートを取得する/ }));
    expect(screen.getByText(/店舗・駅の座標を openrouteservice に送信します/)).toBeInTheDocument();
    await user.type(screen.getByLabelText('openrouteservice の API キー'), 'test-key');
    await user.click(screen.getByRole('button', { name: '設定を保存' }));
    expect(settingsRepo.saveRouting).toHaveBeenCalledWith({ provider: 'openrouteservice', orsApiKey: 'test-key' });

    await user.click(screen.getByRole('button', { name: '徒歩ルートを取得' }));
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(await screen.findByText(/徒歩 13\.5km・約160分（経路検索）/)).toBeInTheDocument();
    expect(screen.getByText(/^徒歩ルートを取得済み。経路：openrouteservice\.org by HeiGIT/)).toBeInTheDocument();
    expect(vi.mocked(controller.setRoute).mock.lastCall![0].features[0]!.properties.kind).toBe('routed');

    // 順番を変えると取得済みの経路は使わず、直線（概算）に戻る
    await user.click(screen.getByRole('button', { name: '架空角打ちふたつめを前へ' }));
    expect(screen.getByText(/徒歩の目安 約139分（概算）/)).toBeInTheDocument();
    expect(vi.mocked(controller.setRoute).mock.lastCall![0].features[0]!.properties.kind).toBe('straight');
  });

  it('経路の取得に失敗した場合は原因を表示し、概算のまま使える', async () => {
    fetchMock.mockResolvedValue(new Response('{}', { status: 401 }));
    vi.mocked(settingsRepo.loadRouting).mockResolvedValue({ provider: 'openrouteservice', orsApiKey: 'bad' });
    const user = userEvent.setup();
    render(<App />);
    await addFromDetail(user, /架空酒場ひとつめ/);
    await addFromDetail(user, /架空角打ちふたつめ/);
    await user.click(screen.getByRole('tab', { name: 'はしご酒' }));
    await user.click(screen.getByRole('button', { name: '徒歩ルートを取得' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('API キーが正しくない');
    expect(screen.getByText(/（概算）/)).toBeInTheDocument();
  });

  it('保存済みのルートを選び直し、削除できる', async () => {
    vi.mocked(routeRepo.loadAll).mockResolvedValue([
      { ...createRoute('saved', '2026-10-01T00:00:00.000Z', '保存済みルート'), shopIds: ['seed-2'] },
    ]);
    const user = userEvent.setup();
    render(<App />);
    await user.click(screen.getByRole('tab', { name: 'はしご酒' }));
    expect(screen.getByText('はしご酒のルートがありません。')).toBeInTheDocument();
    await user.selectOptions(await screen.findByLabelText('ルート'), 'saved');
    expect(screen.getByLabelText('ルート名')).toHaveValue('保存済みルート');
    await user.click(screen.getByRole('button', { name: 'このルートを削除' }));
    await user.click(within(screen.getByRole('dialog')).getByRole('button', { name: '削除する' }));
    expect(routeRepo.delete).toHaveBeenCalledWith('saved');
    expect(screen.getByText('はしご酒のルートがありません。')).toBeInTheDocument();
  });
});
