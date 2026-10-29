import { expect, test, type Page } from '@playwright/test';
import { readZoom, serveFixtureStyle } from './fixtures';

/** 地図の中央の画面座標（店舗へ移動した直後は、その店舗が中央にある） */
async function mapCenter(page: Page) {
  const box = await page.getByTestId('map-container').boundingBox();
  if (!box) throw new Error('地図の領域が取得できません');
  return { x: box.x + box.width / 2, y: box.y + box.height / 2 };
}

async function clickMapCenter(page: Page) {
  const c = await mapCenter(page);
  await page.mouse.click(c.x, c.y);
}

async function waitMapIdle(page: Page) {
  // flyTo の終了（moveend）を待つ
  await page.waitForTimeout(1500);
}

test.describe('店舗の登録・表示・編集・削除（外部通信なし）', () => {
  test('店舗を追加して地図から選び、再読み込み後も残り、編集・削除できる', async ({ page }) => {
    const pageErrors: string[] = [];
    page.on('pageerror', (e) => pageErrors.push(e.message));
    page.on('console', (msg) => {
      if (msg.type() === 'error') pageErrors.push(msg.text());
    });

    await serveFixtureStyle(page);
    await page.goto('/');
    await expect(page.getByText('地図表示中')).toBeVisible({ timeout: 20_000 });
    await expect(page.getByText('店舗データがまだ登録されていません。')).toBeVisible();

    // ---- 追加（地図クリックで位置を選択）----
    await page.getByRole('button', { name: '＋ 店舗を追加' }).click();
    const editor = page.getByRole('complementary', { name: '店舗の編集' });
    await editor.getByLabel(/^店名/).fill('E2Eテスト用の架空店');
    await editor.getByRole('button', { name: '地図をクリックして位置を選択' }).click();
    await expect(page.getByText('地図上で店舗の位置をクリックしてください')).toBeVisible();
    await clickMapCenter(page);
    await expect(editor.getByLabel(/^緯度/)).not.toHaveValue('');
    await expect(page.locator('.draft-marker')).toBeVisible();
    // 以降の地図クリック確認のため、初期表示の中心と同じ座標に置き直す
    await editor.getByLabel(/^緯度/).fill('35.77');
    await editor.getByLabel(/^経度/).fill('139.72');
    await editor.getByRole('checkbox', { name: '焼きとん・焼き鳥' }).check();
    await editor.getByLabel('月曜日の営業').selectOption('open');
    await editor.getByLabel('月曜日の開店時刻').fill('16:00');
    await editor.getByLabel('月曜日の閉店時刻').fill('23:00');
    await editor.getByRole('button', { name: '保存' }).click();

    const detail = page.getByRole('complementary', { name: '店舗の詳細' });
    await expect(detail.getByRole('heading', { name: 'E2Eテスト用の架空店' })).toBeVisible();
    await expect(detail.getByText('16:00〜23:00')).toBeVisible();
    await expect(detail.getByText('未確認').first()).toBeVisible();
    await expect(page.getByTestId('result-count')).toHaveText('1');
    await expect(page.locator('.draft-marker')).toHaveCount(0);

    // ---- 一覧から選ぶと店舗へ移動する ----
    await detail.getByRole('button', { name: '詳細パネルを閉じる' }).click();
    await page.getByRole('button', { name: /E2Eテスト用の架空店/ }).click();
    await expect.poll(() => readZoom(page), { timeout: 10_000 }).toBeGreaterThanOrEqual(15.9);
    await expect(page.getByText('中心 35.7700, 139.7200')).toBeVisible({ timeout: 10_000 });

    // ---- 地図のマーカーをクリックして選択 ----
    await detail.getByRole('button', { name: '詳細パネルを閉じる' }).click();
    await expect(detail).toHaveCount(0);
    await page.getByRole('tab', { name: '地図の表示' }).click();
    await page.getByRole('button', { name: '初期表示に戻る' }).click(); // 店舗の座標が地図の中央に来る
    await waitMapIdle(page);
    await clickMapCenter(page);
    await expect(detail.getByRole('heading', { name: 'E2Eテスト用の架空店' })).toBeVisible();
    await page.getByRole('tab', { name: '店舗を探す' }).click();

    // ---- 再読み込みしても残る（IndexedDB）----
    await page.reload();
    await expect(page.getByRole('button', { name: /E2Eテスト用の架空店/ })).toBeVisible({ timeout: 20_000 });
    await expect(page.getByText('地図表示中')).toBeVisible({ timeout: 20_000 });

    // ---- 編集 ----
    await page.getByRole('button', { name: /E2Eテスト用の架空店/ }).click();
    await detail.getByRole('button', { name: '編集' }).click();
    await editor.getByLabel(/^店名/).fill('E2Eテスト用の架空店（改）');
    await editor.getByRole('button', { name: '保存' }).click();
    await expect(detail.getByRole('heading', { name: 'E2Eテスト用の架空店（改）' })).toBeVisible();

    // ---- 検索 ----
    await page.getByRole('searchbox', { name: '店名・住所で検索' }).fill('存在しない名前');
    await expect(page.getByText('条件に合う店舗がありません。')).toBeVisible();
    await page.getByRole('button', { name: '条件をすべて解除' }).click();
    await expect(page.getByTestId('result-count')).toHaveText('1');

    // ---- 削除 ----
    await detail.getByRole('button', { name: '削除' }).click();
    await page.getByRole('dialog').getByRole('button', { name: '削除する' }).click();
    await expect(page.getByText('店舗データがまだ登録されていません。')).toBeVisible();
    await page.reload();
    await expect(page.getByText('店舗データがまだ登録されていません。')).toBeVisible({ timeout: 20_000 });

    expect(pageErrors).toEqual([]);
  });

  test('近くの店舗は広域表示でまとめて表示され、クリックすると拡大する', async ({ page }) => {
    await serveFixtureStyle(page);
    await page.goto('/');
    await expect(page.getByText('地図表示中')).toBeVisible({ timeout: 20_000 });
    for (const [name, lat, lng] of [
      ['架空クラスタ1', '35.7700', '139.7200'],
      ['架空クラスタ2', '35.7710', '139.7210'],
    ]) {
      await page.getByRole('button', { name: '＋ 店舗を追加' }).click();
      const editor = page.getByRole('complementary', { name: '店舗の編集' });
      await editor.getByLabel(/^店名/).fill(name!);
      await editor.getByLabel(/^緯度/).fill(lat!);
      await editor.getByLabel(/^経度/).fill(lng!);
      await editor.getByRole('button', { name: '保存' }).click();
      await expect(page.getByRole('complementary', { name: '店舗の詳細' })).toBeVisible();
    }
    await page.getByRole('button', { name: '詳細パネルを閉じる' }).click();
    await page.getByRole('tab', { name: '地図の表示' }).click();
    await page.getByRole('button', { name: '初期表示に戻る' }).click();
    await waitMapIdle(page);
    const zoomBefore = await readZoom(page);
    await clickMapCenter(page); // まとめ表示（クラスタ）をクリック
    await expect.poll(() => readZoom(page), { timeout: 10_000 }).toBeGreaterThan(zoomBefore + 2);
    // クラスタのクリックでは店舗詳細は開かない
    await expect(page.getByRole('complementary', { name: '店舗の詳細' })).toHaveCount(0);
  });

  test('座標の入力ミス（緯度と経度の入れ違い）を検出する', async ({ page }) => {
    await serveFixtureStyle(page);
    await page.goto('/');
    await page.getByRole('button', { name: '＋ 店舗を追加' }).click();
    const editor = page.getByRole('complementary', { name: '店舗の編集' });
    await editor.getByLabel(/^店名/).fill('架空');
    await editor.getByLabel(/^緯度/).fill('139.7');
    await editor.getByLabel(/^経度/).fill('35.7');
    await editor.getByRole('button', { name: '保存' }).click();
    await expect(editor.getByRole('alert')).toContainText('緯度と経度が逆');
  });
});
