# FM Workstation Prototype

ブラウザーで動く Web Audio / AudioWorklet ベースの 6 オペ FM シンセ + ピアノロール試作です。

## 同梱機能

- 6 オペ FM シンセ
- アルゴリズム切替
- パッチプリセット
- ピアノロール編集
- ループ再生
- Swing
- Web MIDI 入力
- JSON 保存 / 読み込み

## 使い方

1. ローカルサーバーで配信する
2. `Start Audio` を押す
3. `Play` で再生
4. グリッドをドラッグしてノートを作る
5. 右側でオペレータを調整する

## ローカル起動例

```bash
cd fm-workstation
python3 -m http.server 8000
```

その後、ブラウザーで `http://localhost:8000/` を開いてください。

## ファイル構成

- `index.html` UI
- `styles.css` スタイル
- `app.js` UI / transport / scheduler / MIDI
- `scheduler-worker.js` 先読み tick
- `fm-synth-worklet.js` FM 音源本体
- `FM_WORKSTATION_DESIGN.md` 設計メモ

## 注意

- ブラウザーや権限設定によって Web MIDI が使えないことがあります。
- AudioWorklet を使うので、`file://` 直開きではなくローカルサーバー配信を推奨します。

