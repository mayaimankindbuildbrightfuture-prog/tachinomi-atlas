# 開発計画・進捗

仕様書：[SPEC.md](SPEC.md)

## 技術構成（Phase 1 時点）

| 区分       | 採用                                              | バージョン        | 理由                                                                |
| ---------- | ------------------------------------------------- | ----------------- | ------------------------------------------------------------------- |
| 言語       | TypeScript                                        | 7.0               | 仕様指定。型でデータモデルの整合性を保つ                            |
| UI         | React                                             | 19.3              | 仕様指定                                                            |
| ビルド     | Vite                                              | 8.3               | 仕様指定。高速な開発サーバー                                        |
| 3D地図     | MapLibre GL JS                                    | 6.16              | 仕様指定。OSS・APIキー不要、fill-extrusion による3D建物             |
| 地図タイル | OpenFreeMap                                       | —                 | APIキー・登録不要、OSMベース、建物の高さ属性（render_height）を含む |
| テスト     | Vitest / React Testing Library / Playwright       | 5.0 / 16.3 / 1.64 | 仕様指定                                                            |
| テスト補助 | fake-indexeddb / @maplibre/maplibre-gl-style-spec | 6.x / 26.5        | IndexedDB の単体テスト、レイヤー定義の仕様検証                      |
| 整形       | Prettier                                          | 3.x               | `npm run format`                                                    |
| 実行環境   | Node.js                                           | 22.12 以上        | Vite 8・Vitest 5 の要件                                             |

> 依存関係は 2026-10-29 時点の npm 最新安定版。

### 実装上の注意

- **MapLibre v6 のワーカー**：v6 はワーカーをモジュールの相対パスから読み込むため、Vite の依存最適化やビルド後にパスが壊れる。
  `maplibre-gl/dist/maplibre-gl-worker.mjs?url` をアセットとして読み込み、`setWorkerUrl()` で明示している（`src/services/map/mapAdapter.ts`）。
- **既定エクスポートなし**：v6 は `import maplibregl from 'maplibre-gl'` が使えないため、名前付きインポートを使う。

## アーキテクチャ

```
src/
  app/App.tsx                      画面全体のレイアウトと状態（検索条件・選択・パネル）
  components/
    MapView/                       地図の描画（MapLibre 生成はアダプターに委譲）
    MapStatusBanner/               地図の読み込み中・エラーの表示
    Sidebar/                       「店舗を探す」「地図の表示」タブ
    FilterPanel/                   検索条件・適用中の条件・結果一覧
    ShopDetail/                    店舗詳細パネル
    ShopEditor/                    店舗の追加・編集フォーム（shopForm.ts で入力値と Shop を相互変換）
    ConfirmDialog/                 削除確認
    StatusBar/                     視点情報と出典
  domain/                          React・MapLibre・IndexedDB に依存しない純粋なロジック
    shop.ts                        Shop / Station / DataSource 型、表示ラベル、検証、重複判定
    hours.ts                       営業時間の判定（日本時間、深夜営業、判定不能は unknown）
    search.ts                      検索・絞り込み、適用中条件の表示
    dataset.ts                     初期データ JSON の検証、参照切れ検出、初期データとユーザーデータの統合
    geo.ts / format.ts             距離計算、表示書式（円・日本時間）
  data/                            初期データ JSON（shops / sources / stations）
  hooks/useShopStore.ts            初期データ＋IndexedDB を統合した店舗ストア
  services/
    map/
      mapConfig.ts                 スタイル・初期視点・地域プリセット
      layers.ts                    スタイル加工（3D建物・日本語ラベル・簡易スタイル）
      shopLayers.ts                店舗レイヤー（GeoJSON・クラスタ・ジャンルアイコン・クリック判定用レイヤー）
      mapErrors.ts                 エラーの分類と日本語メッセージ
      mapAdapter.ts                MapLibre を包む MapController
    storage/
      database.ts                  IndexedDB 接続（バージョン管理・移行の入口）
      shopRepository.ts            店舗・出典の保存／削除（トランザクションで原子的に更新）
  styles/global.css
  tests/                           テスト設定と架空の店舗データ
e2e/                               Playwright（外部通信なしのテストと、外部接続テストを分離）
```

### データの流れ

1. 起動時に `src/data/*.json` を検証して読み込み（不正なものは除外し画面に報告）。
2. IndexedDB から、ユーザーが保存した店舗・出典・削除記録を読み込む。
3. `mergeById` で統合（同じIDはユーザー版を優先、削除記録のある初期データは除外）。
4. `filterShops` で検索条件を適用し、結果を一覧と地図（GeoJSON ソース）に渡す。
   検索条件・店舗データが変わったときだけ再計算し、地図の移動では再計算しない。地図は `setData` で更新し再生成しない。

### IndexedDB（DB名 `tachinomi-atlas`、バージョン 1）

| ストア           | キー | 内容                                        |
| ---------------- | ---- | ------------------------------------------- |
| `shops`          | `id` | ユーザーが追加・編集した店舗（完全な Shop） |
| `shopTombstones` | `id` | 削除した初期データ店舗のID と削除日時       |
| `sources`        | `id` | ユーザーが追加した出典                      |

スキーマ変更時は `DB_VERSION` を上げ、`onupgradeneeded` に `oldVersion` ごとの移行処理を追加する。
訪問記録・お気に入り・ルート（Phase 4・5）は別ストアとして追加し、店舗データ本体には混在させない。

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

### Phase 2：店舗表示 — ✅ 実装完了（初期データは未登録）

- [x] `src/domain/shop.ts`：Shop / Station / DataSource 型と検証関数
- [x] 初期データ JSON の読み込み・検証・参照切れ検出（`src/data/*.json`、`src/domain/dataset.ts`）
- [ ] **実在店舗の初期データ登録** — 出典サイトに開発環境から接続できず未実施（docs/DATA_SOURCES.md）
- [ ] 駅データの登録 — 同上
- [x] 店舗レイヤー（GeoJSON ソース＋クラスタリング、ジャンル別アイコン、閉店店舗の半透明表示、選択中の強調、店名ラベル）
- [x] マーカー・一覧から選択 → 右側の店舗詳細パネル（閉じられる、不明は「未確認」）
- [x] 店舗追加・編集フォーム（地図クリックで座標入力、仮ピン表示、緯度経度の入れ違い・範囲外検出、重複警告）
- [x] 出典の追加と店舗への紐づけ、「確認済み」には出典と確認日を必須化
- [x] 店舗の削除（確認ダイアログ、初期データは削除記録を保存）
- [x] 検索・絞り込み（店名・住所、都道府県、市区町村、駅、ジャンル、酒、予算帯、立ち呑み形式、曜日・時刻、確認状況）、適用中条件の表示と個別・一括解除、件数表示
- [x] IndexedDB への保存（Repository 層、トランザクション）
- [ ] 訪問済み・お気に入り・予算内の注文モデルでの絞り込み → Phase 4・F-18 で追加

#### Phase 2 で見つけて直した不具合

- MapLibre の symbol レイヤー（重なり無視の設定）はクリック判定で拾えないため、透明な円レイヤーで判定するようにした。
- 一覧から店舗を選ぶと、詳細パネルが開いて地図の幅が変わる前に移動が始まり、店舗が中央からずれていた。レイアウト確定後に地図サイズを反映してから移動するようにした。
- IndexedDB への書き込みで同期的な例外が起きた場合、それまでに積んだ書き込みが確定していた。例外時はトランザクションを中断するようにした。

### Phase 3：密度・比較 — 未着手

### Phase 4：個人記録 — 未着手

### Phase 5：はしご酒・仕上げ — 未着手

## テスト

| 種別                 | コマンド                             | 外部通信                                                    |
| -------------------- | ------------------------------------ | ----------------------------------------------------------- |
| 型チェック           | `npm run typecheck`                  | なし                                                        |
| 単体・コンポーネント | `npm test`                           | なし（地図アダプターはモック、IndexedDB は fake-indexeddb） |
| E2E                  | `npm run test:e2e`                   | なし（地図スタイルを固定データに差し替え）                  |
| E2E（本番ビルド）    | `E2E_USE_PREVIEW=1 npm run test:e2e` | なし                                                        |
| E2E（実地図）        | `E2E_EXTERNAL=1 npm run test:e2e`    | あり（OpenFreeMap）                                         |

Playwright のブラウザを別の場所から使う場合は `PW_CHROMIUM_PATH` に実行ファイルのパスを指定する。
