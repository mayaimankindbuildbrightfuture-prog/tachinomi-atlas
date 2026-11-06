import { act, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { MapController, MapEventHandlers } from '../services/map/mapAdapter';
import { styleLoadFailedIssue, webglUnavailableIssue } from '../services/map/mapErrors';

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

const { App } = await import('./App');

beforeEach(() => {
  vi.clearAllMocks();
  handlers = {};
});

describe('App', () => {
  it('タイトル・地域切り替え・地図スタイル・操作ボタンを表示する', () => {
    render(<App />);
    expect(screen.getByRole('heading', { name: '立ち呑み地形図' })).toBeInTheDocument();
    expect(screen.getByLabelText('地域')).toBeInTheDocument();
    expect(screen.getByLabelText('地図スタイル')).toHaveValue('dark');
    expect(screen.getByRole('button', { name: '初期表示に戻る' })).toBeInTheDocument();
  });

  it('操作ボタンと選択肢がコントローラーに伝わる', async () => {
    const user = userEvent.setup();
    render(<App />);
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
    await user.selectOptions(screen.getByLabelText('地図スタイル'), 'liberty');
    expect(controller.setStyle).toHaveBeenLastCalledWith('liberty');
    await user.click(screen.getByRole('checkbox', { name: '3D建物' }));
    expect(controller.setBuildingsVisible).toHaveBeenLastCalledWith(false);
    expect(createMapController).toHaveBeenCalledTimes(1);
  });

  it('読み込み中の表示を出す', () => {
    render(<App />);
    act(() => handlers.onStatusChange?.('loading'));
    expect(screen.getByRole('status')).toHaveTextContent('地図を読み込み中');
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

  it('WebGL 非対応で地図を作れない場合は致命的エラーを表示し、操作を無効にする', () => {
    createMapController.mockImplementationOnce((_el, _o, h) => {
      h.onStatusChange?.('failed');
      h.onIssue?.(webglUnavailableIssue(new Error('Failed to initialize WebGL')));
      return null;
    });
    render(<App />);
    expect(screen.getByRole('alert')).toHaveTextContent('WebGL');
    expect(screen.queryByRole('button', { name: '再読み込み' })).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: '初期表示に戻る' })).toBeDisabled();
    expect(screen.getByText('地図を表示できません')).toBeInTheDocument();
  });

  it('サイドパネルを開閉できる', async () => {
    const user = userEvent.setup();
    render(<App />);
    await user.click(screen.getByRole('button', { name: '◀ 閉じる' }));
    expect(screen.queryByRole('heading', { name: '表示レイヤー' })).not.toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: '▶' }));
    expect(screen.getByRole('heading', { name: '表示レイヤー' })).toBeInTheDocument();
  });
});
