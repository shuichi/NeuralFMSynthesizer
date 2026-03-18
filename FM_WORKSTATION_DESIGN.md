# FM Workstation Design

## 1. 目的

ブラウザー上で動く、実用寄りの FM シンセ / シーケンサー基盤を JavaScript + Web Audio API で構築する。

狙いは次の3点です。

1. **DSP を UI から切り離し、タイミングを崩しにくくすること**
2. **DX 系の「アルゴリズム + オペレータ」思想を残しつつ、現代的な実装にすること**
3. **後で本格 DAW 方向へ拡張しやすいデータ構造にすること**

---

## 2. 採用アーキテクチャ

### 2.1 スレッド分離

- **Main Thread**
  - UI
  - ピアノロール編集
  - トランスポート制御
  - パッチ編集
  - Web MIDI 入力受付
- **Worker**
  - ルックアヘッド型スケジューラの tick 発行
- **AudioWorklet**
  - 6 オペ FM ボイス処理
  - ボイス割当
  - サンプル単位での noteOn / noteOff 実行

### 2.2 音声チェーン

`AudioWorkletNode -> BiquadFilterNode -> DynamicsCompressorNode -> (Dry/Wet Delay) -> Master Gain -> destination`

### 2.3 シンセ方式

- 6 オペレータ
- オフダイアゴナルは **アルゴリズム・プリセット由来のモジュレーション行列**
- ダイアゴナルは **各オペレータの feedback**
- 各オペレータは以下のパラメータを持つ
  - ratio
  - detune
  - level
  - output
  - feedback
  - ADSR

---

## 3. なぜこの設計か

### 3.1 DSP は AudioWorklet に置く

UI スレッドで音を合成すると描画や DOM 更新でドロップアウトしやすいので、DSP は AudioWorklet に寄せる。

### 3.2 シーケンサーは「先読み」で送る

ブラウザーの通常タイマーはオーディオクロックほど精密ではないので、現在時刻より少し先までのイベントをまとめて Worklet に送る。

### 3.3 FM コアは「固定アルゴリズム + フィードバック可変」

完全自由行列にすると UI が重くなるため、まずは:

- 代表的なアルゴリズムをプリセット化
- その上で per-operator feedback / output / ratio / envelope を可変

というバランスにした。

---

## 4. 現在実装した v1 の範囲

### 4.1 Synth

- 6 オペ FM エンジン
- 16 ボイス程度のポリフォニー
- オペレータ別 ADSR
- オペレータ別 feedback / output
- アルゴリズム切替
- パッチプリセット
- 低域フィルタ、コンプレッサ、ディレイ

### 4.2 Sequencer

- 16 分グリッドのピアノロール
- 2〜8 小節ループ
- ノート作成、移動、長さ変更、削除
- ベロシティ編集
- ループ再生
- スイング

### 4.3 Performance

- コンピューターキーボード試奏
- Web MIDI 入力
- Panic

### 4.4 Persistence

- JSON セーブ / ロード
- localStorage 保存

---

## 5. データモデル

### 5.1 Project

```json
{
  "bpm": 120,
  "bars": 2,
  "swing": 0.0,
  "patch": { ... },
  "notes": [ ... ]
}
```

### 5.2 Note

```json
{
  "id": "uuid",
  "step": 0,
  "length": 4,
  "note": 60,
  "velocity": 0.85
}
```

### 5.3 Patch

```json
{
  "operators": [
    {
      "ratio": 1,
      "detune": 0,
      "level": 0.9,
      "output": 1.0,
      "feedback": 0.0,
      "attack": 0.01,
      "decay": 0.2,
      "sustain": 0.7,
      "release": 0.3
    }
  ],
  "outputGain": 0.32
}
```

---

## 6. スケジューリング戦略

- UI 側でノートを即時再生しない
- `AudioContext.currentTime` 基準で
  - noteOn absolute time
  - noteOff absolute time
  を AudioWorklet に送る
- Worklet 側でイベントキューを時間順に並べ、処理ブロック内でサンプル時刻と比較して発火する

これにより、UI の瞬間的な負荷があっても note timing が崩れにくい。

---

## 7. v2 以降の拡張ポイント

### 7.1 シンセ側

- フル・モジュレーション・マトリクス UI
- オペレータごとの波形選択（sine 以外）
- key scaling / velocity scaling
- pitch envelope
- microtuning / Scala
- MPE / per-note expression
- オーバーサンプリング or WASM 実装

### 7.2 シーケンサー側

- 複数トラック
- クリップ / パターンチェイン
- オートメーションレーン
- Undo / Redo
- MIDI 録音
- Offline bounce / WAV export

### 7.3 エンジン側

- SharedArrayBuffer ベースの高速イベント受け渡し
- Worker 側での高度な transport 管理
- パッチ変更の時間指定オートメーション

---

## 8. 実運用での推奨改善

本当に「最強」方向へ伸ばすなら、次の順で強化すると効率が良いです。

1. **WASM 化した FM コア**
2. **オーバーサンプリング / 高域でのモジュレーション深さ制御**
3. **トラック / クリップ / オートメーションの本格化**
4. **OfflineAudioContext ベースの高品質書き出し**
5. **MPE / microtuning / patch morph**

