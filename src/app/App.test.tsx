import { act, fireEvent, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { MapController, MapEventHandlers } from '../services/map/mapAdapter';
import { styleLoadFailedIssue, webglUnavailableIssue } from '../services/map/mapErrors';
import type { ShopRepository } from '../services/storage/shopRepository';
import { useShopStore, type SeedData } from '../hooks/useShopStore';
import { makeShop, testSource, testStation } from '../tests/fixtures';
import { useSurveyAreas } from '../hooks/useSurveyAreas';
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

function App() {
  return <AppImpl useStore={useTestStore} useSurveyStore={useTestSurveyStore} />;
}

beforeEach(() => {
  vi.clearAllMocks();
  handlers = {};
  seedData = seed;
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
    expect(repo.deleteShop).toHaveBeenCalledWith('seed-1', true, expect.any(String));
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
    expect(screen.getByRole('radio', { name: /訪問済み店舗の分布/ })).toBeDisabled();
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
