# 同梱データのライセンス

`shops.json` と `sources.json` に含まれる店舗の名称・位置・住所は、OpenStreetMap から取得したデータです（取得日 2026-10-29）。

- © OpenStreetMap contributors
- ライセンス：Open Data Commons Open Database License（ODbL）1.0
  https://opendatacommons.org/licenses/odbl/1-0/
- 著作権・帰属表示の詳細：https://www.openstreetmap.org/copyright

これらのファイル（OpenStreetMap 由来のデータベース部分）を再配布・公開する場合は、ODbL 1.0 に従い、
上記の帰属表示を行い、改変したデータベースも同じライセンスで提供してください。

アプリ画面では、地図右下の帰属表示と、各店舗の詳細パネルの「出典」に OpenStreetMap へのリンクを表示しています。

## 駅データ（stations.json）

`stations.json` は、国土数値情報の「鉄道データ（N02 令和6年度）」と「行政区域データ（N03 令和7年）」を加工して作成したものです。

- 出典：国土交通省 国土数値情報ダウンロードサイト（https://nlftp.mlit.go.jp/ksj/）
- ライセンス：クリエイティブ・コモンズ 表示 4.0 国際（CC BY 4.0）
- 加工内容：同じ駅グループの駅を1駅に統合し、座標をホームの中点の平均とし、行政区域から都道府県・市区町村を付与（`scripts/build-stations.mjs`）

再配布する場合は上記の出典と、加工している旨を表示してください。
