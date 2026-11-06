import { expect, test } from '@playwright/test';
import { blockTileHost, readPitch, readZoom, serveFixtureStyle, serveFixtureStyleWithBuildings } from './fixtures';

test.describe('地図の基礎（外部通信なし）', () => {
  test('地図が表示され、拡大・視点切り替え・地域移動ができる', async ({ page }) => {
    const pageErrors: string[] = [];
    page.on('pageerror', (e) => pageErrors.push(e.message));
    page.on('console', (msg) => {
      if (msg.type() === 'error') pageErrors.push(msg.text());
    });

    await serveFixtureStyle(page);
    await page.goto('/');

    await expect(page.getByRole('heading', { name: '立ち呑み地形図' })).toBeVisible();
    await expect(page.locator('canvas.maplibregl-canvas')).toBeVisible();
    await expect(page.getByText('地図表示中')).toBeVisible({ timeout: 20_000 });
    await expect(page.getByRole('alert')).toHaveCount(0);

    // 初期表示は斜め（3D）視点
    await page.getByRole('button', { name: '初期表示に戻る' }).click();
    await expect.poll(() => readPitch(page), { timeout: 10_000 }).toBeGreaterThan(30);

    // 拡大ボタン
    const zoomBefore = await readZoom(page);
    await page.getByRole('button', { name: '拡大' }).click();
    await expect.poll(() => readZoom(page), { timeout: 10_000 }).toBeGreaterThan(zoomBefore);

    // 2D表示（真上から）
    await page.getByRole('button', { name: '2D表示（真上から）' }).click();
    await expect.poll(() => readPitch(page), { timeout: 10_000 }).toBe(0);

    // 3D表示
    await page.getByRole('button', { name: '3D表示（傾ける）' }).click();
    await expect.poll(() => readPitch(page), { timeout: 10_000 }).toBeGreaterThan(40);

    // 地域切り替え（全域は初期表示より広い＝ズームが小さい）
    await page.getByLabel('地域').selectOption('all');
    await expect.poll(() => readZoom(page), { timeout: 10_000 }).toBeLessThan(10);

    // ドラッグで中心座標が変わる
    const centerBefore = await page.getByText(/^中心 /).textContent();
    const box = await page.getByTestId('map-container').boundingBox();
    if (!box) throw new Error('地図の領域が取得できません');
    await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
    await page.mouse.down();
    await page.mouse.move(box.x + box.width / 2 + 150, box.y + box.height / 2 + 80, { steps: 10 });
    await page.mouse.up();
    await expect.poll(() => page.getByText(/^中心 /).textContent(), { timeout: 10_000 }).not.toBe(centerBefore);

    // 帰属表示
    await expect(page.locator('.maplibregl-ctrl-attrib')).toContainText('E2E fixture');

    expect(pageErrors).toEqual([]);
  });

  test('建物データを持つスタイルでは3D建物レイヤーを追加し、表示を切り替えられる', async ({ page }) => {
    const pageErrors: string[] = [];
    page.on('pageerror', (e) => pageErrors.push(e.message));
    page.on('console', (msg) => {
      if (msg.type() === 'error') pageErrors.push(msg.text());
    });
    await serveFixtureStyleWithBuildings(page);
    await page.goto('/');
    await expect(page.getByText('地図表示中')).toBeVisible({ timeout: 20_000 });

    const checkbox = page.getByRole('checkbox', { name: '3D建物' });
    await expect(checkbox).toBeEnabled();
    await expect(checkbox).toBeChecked();
    await expect(page.getByText(/建物はズーム 13 以上で立体表示されます/)).toBeVisible();

    await page.getByRole('button', { name: '3D表示（傾ける）' }).click();
    await expect.poll(() => readZoom(page), { timeout: 10_000 }).toBeGreaterThanOrEqual(14.4);
    await checkbox.uncheck();
    await checkbox.check();
    await expect(page.getByRole('alert')).toHaveCount(0);
    expect(pageErrors).toEqual([]);
  });

  test('建物データのないスタイルでは3D建物を無効化して理由を表示する', async ({ page }) => {
    await serveFixtureStyle(page);
    await page.goto('/');
    await expect(page.getByText('地図表示中')).toBeVisible({ timeout: 20_000 });
    await expect(page.getByRole('checkbox', { name: '3D建物' })).toBeDisabled();
    await expect(page.getByText('この地図スタイルには建物データがないため')).toBeVisible();
  });

  test('サイドパネルを閉じて地図を広く表示できる', async ({ page }) => {
    await serveFixtureStyle(page);
    await page.goto('/');
    const mapBox = () => page.getByTestId('map-container').boundingBox();
    const before = await mapBox();
    await page.getByRole('button', { name: '◀ 閉じる' }).click();
    await expect.poll(async () => (await mapBox())?.width ?? 0).toBeGreaterThan((before?.width ?? 0) + 100);
    await page.getByRole('button', { name: '▶' }).click();
    await expect(page.getByRole('heading', { name: '表示レイヤー' })).toBeVisible();
  });

  test('地図サービスに接続できない場合、原因と対処を表示し、地図操作は続けられる', async ({ page }) => {
    await blockTileHost(page);
    await page.goto('/');

    const alert = page.getByRole('alert');
    await expect(alert).toBeVisible({ timeout: 20_000 });
    await expect(alert).toContainText('地図サービス（OpenFreeMap）に接続できず');
    await expect(alert).toContainText('インターネット接続を確認');
    await expect(page.getByText('簡易表示（外部地図なし）')).toBeVisible();

    // 簡易表示のままでも地図操作は可能
    const zoomBefore = await readZoom(page);
    await page.getByRole('button', { name: '拡大' }).click();
    await expect.poll(() => readZoom(page), { timeout: 10_000 }).toBeGreaterThan(zoomBefore);

    // 再読み込みしても失敗が続けば再度エラーを表示する（無限再試行はしない）
    await alert.getByRole('button', { name: '再読み込み' }).click();
    await expect(page.getByRole('alert')).toContainText('接続できず', { timeout: 20_000 });

    // 回線が復旧したら再読み込みで通常表示に戻る
    await page.unrouteAll({ behavior: 'ignoreErrors' });
    await serveFixtureStyle(page);
    await page.getByRole('alert').getByRole('button', { name: '再読み込み' }).click();
    await expect(page.getByText('地図表示中')).toBeVisible({ timeout: 20_000 });
    await expect(page.getByRole('alert')).toHaveCount(0);
  });
});
