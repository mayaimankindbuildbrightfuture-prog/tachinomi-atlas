import { act, fireEvent, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { MapController, MapEventHandlers } from '../services/map/mapAdapter';
import { styleLoadFailedIssue, webglUnavailableIssue } from '../services/map/mapErrors';
import type { ShopRepository } from '../services/storage/shopRepository';
import { useShopStore, type SeedData } from '../hooks/useShopStore';
import { makeShop, testSource } from '../tests/fixtures';

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
  stations: [],
  issues: [],
};

let repo: ShopRepository;
let seedData: SeedData = seed;
function useTestStore() {
  return useShopStore(repo, () => seedData);
}
function App() {
  return <AppImpl useStore={useTestStore} />;
}

beforeEach(() => {
  vi.clearAllMocks();
  handlers = {};
  seedData = seed;
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
    expect(controller.flyToPoint).toHaveBeenCalledWith(35.7, 139.7);
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
