# 開発計画・進捗

仕様書：[SPEC.md](SPEC.md)

## 技術構成（Phase 1 時点）

| 区分 | 採用 | バージョン | 理由 |
|---|---|---|---|
| 言語 | TypeScript | 7.0 | 仕様指定。型でデータモデルの整合性を保つ |
| UI | React | 19.3 | 仕様指定 |
| ビルド | Vite | 8.3 | 仕様指定。高速な開発サーバー |
| 3D地図 | MapLibre GL JS | 6.16 | 仕様指定。OSS・APIキー不要、fill-extrusion による3D建物 |
| 地図タイル | OpenFreeMap | — | APIキー・登録不要、OSMベース、建物の高さ属性（render_height）を含む |
| テスト | Vitest / React Testing Library / Playwright | 5.0 / 16.3 / 1.64 | 仕様指定 |
| 実行環境 | Node.js | 22.12 以上 | Vite 8・Vitest 5 の要件 |

> 依存関係は 2026-10-29 時点の npm 最新安定版。

### 実装上の注意

- **MapLibre v6 のワーカー**：v6 はワーカーをモジュールの相対パスから読み込むため、Vite の依存最適化やビルド後にパスが壊れる。
  `maplibre-gl/dist/maplibre-gl-worker.mjs?url` をアセットとして読み込み、`setWorkerUrl()` で明示している（`src/services/map/mapAdapter.ts`）。
- **既定エクスポートなし**：v6 は `import maplibregl from 'maplibre-gl'` が使えないため、名前付きインポートを使う。

## アーキテクチャ

```
src/
  app/App.tsx                      画面全体のレイアウトと状態
  components/
    MapView/                       地図の描画（MapLibre 生成はアダプターに委譲）
    MapStatusBanner/               読み込み中・エラーの表示
    Sidebar/                       表示レイヤーと地図操作
    StatusBar/                     視点情報と出典
  services/map/
    mapConfig.ts                   スタイル・初期視点・地域プリセット（純粋なデータ）
    layers.ts                      スタイル加工（3D建物・日本語ラベル・簡易スタイル）の純粋関数
    mapErrors.ts                   エラーの分類と日本語メッセージ
    mapAdapter.ts                  MapLibre を包む MapController
  styles/global.css
  tests/setup.ts
e2e/                               Playwright（外部通信なしのテストと、外部接続テストを分離）
```

- UI は `MapController` インターフェースだけを使い、MapLibre の API を直接呼ばない。
- 地図インスタンスはマウント時に一度だけ生成し、スタイル変更・建物表示切り替えはコントローラー経由で反映（地図を再生成しない）。
- カメラ情報は `moveend` のときだけ React に通知し、ドラッグ中の再描画を避ける。
- 仕様の推奨構成（`domain/`、`services/storage/` など）は該当フェーズで追加する。

## フェーズ計画と進捗

### Phase 1：地図の基礎 — ✅ 完了

- [x] リポジトリの構造確認（空のリポジトリから開始）
- [x] 依存関係と開発環境の確認
- [x] MapLibre GL JS の導入
- [x] 地図の表示（OpenFreeMap、ダーク／標準／淡色）
- [x] 3D建物表示（ズーム13以上、高さに応じた配色、表示切り替え）
- [x] 地名の日本語表記優先
- [x] 基本的な地図操作（ズーム・移動・回転・傾き・全画面・縮尺）
- [x] 初期表示への復帰、東京・埼玉全域や地域への移動、2D／3D切り替え
- [x] エラー表示（WebGL 非対応、スタイル取得失敗→簡易表示、タイル取得失敗、オフライン）
- [x] 単体・コンポーネントテスト、E2E テスト

### Phase 2：店舗表示 — 未着手

- [ ] `src/domain/shop.ts`：Shop / Station / DataSource 型と検証関数
- [ ] `src/data/shops.json`・`stations.json`：初期データ（実在店舗は出典確認済みのもののみ。無ければ明示的なデモデータ）
- [ ] 店舗レイヤー（GeoJSON ソース＋クラスタリング）を `services/map/layers.ts` に追加
- [ ] マーカー選択 → 右側の店舗詳細パネル（閉じられる）
- [ ] 店舗追加・編集フォーム（地図クリックで座標入力、緯度経度の範囲チェック、重複防止）
- [ ] 検索・フィルター（`domain/search.ts` の純粋関数として実装・テスト）
- [ ] 店舗の追加・編集の保存先：IndexedDB（Repository 層）。Phase 4 の個人記録と同じ DB 基盤を先に用意する

### Phase 3：密度・比較 — 未着手
### Phase 4：個人記録 — 未着手
### Phase 5：はしご酒・仕上げ — 未着手

## テスト

| 種別 | コマンド | 外部通信 |
|---|---|---|
| 型チェック | `npm run typecheck` | なし |
| 単体・コンポーネント | `npm test` | なし（地図アダプターはモック） |
| E2E | `npm run test:e2e` | なし（地図スタイルを固定データに差し替え） |
| E2E（本番ビルド） | `E2E_USE_PREVIEW=1 npm run test:e2e` | なし |
| E2E（実地図） | `E2E_EXTERNAL=1 npm run test:e2e` | あり（OpenFreeMap） |

Playwright のブラウザを別の場所から使う場合は `PW_CHROMIUM_PATH` に実行ファイルのパスを指定する。
