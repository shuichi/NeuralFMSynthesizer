const CELL_W = 30;
const CELL_H = 22;
const STEP_BEATS = 0.25; // 16th note grid in 4/4
const NOTE_MIN = 48; // C3
const NOTE_MAX = 83; // B5
const DEFAULT_SCHEDULE_AHEAD = 0.12;
const DEFAULT_LOOKAHEAD_MS = 25;

const KEYBOARD_MAP = {
  a: 0,
  w: 1,
  s: 2,
  e: 3,
  d: 4,
  f: 5,
  t: 6,
  g: 7,
  y: 8,
  h: 9,
  u: 10,
  j: 11,
  k: 12,
};

function deepClone(value) {
  return JSON.parse(JSON.stringify(value));
}

function clamp(value, min, max) {
  return Math.min(max, Math.max(min, value));
}

function midiToFrequency(midiNote) {
  return 440 * Math.pow(2, (midiNote - 69) / 12);
}

function noteName(midiNote) {
  const names = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'];
  const pc = ((midiNote % 12) + 12) % 12;
  const octave = Math.floor(midiNote / 12) - 1;
  return `${names[pc]}${octave}`;
}

function isBlackKey(midiNote) {
  return [1, 3, 6, 8, 10].includes(((midiNote % 12) + 12) % 12);
}

function secondsToBeats(seconds, bpm) {
  return seconds * bpm / 60;
}

function beatsToSeconds(beats, bpm) {
  return beats * 60 / bpm;
}

function noteToRow(midiNote) {
  return NOTE_MAX - midiNote;
}

function rowToNote(row) {
  return NOTE_MAX - row;
}

function createEmptyMatrix() {
  return Array.from({ length: 6 }, () => Array(6).fill(0));
}

function matrixWithRoutes(routes) {
  const matrix = createEmptyMatrix();
  for (const [target, source, amount] of routes) {
    matrix[target][source] = amount;
  }
  return matrix;
}

const ALGORITHM_PRESETS = [
  {
    id: 'stack6',
    name: 'Stack 6',
    description: '6→5→4→3→2→1 の深いカスケード。ベル、パッド、リード向き。',
    matrix: matrixWithRoutes([
      [4, 5, 0.9],
      [3, 4, 1.1],
      [2, 3, 1.5],
      [1, 2, 2.1],
      [0, 1, 3.0],
    ]),
  },
  {
    id: 'threePairs',
    name: 'Three Pairs',
    description: '(2→1) + (4→3) + (6→5) の3ペア。EP、オルガン、パッド向き。',
    matrix: matrixWithRoutes([
      [0, 1, 2.8],
      [2, 3, 2.2],
      [4, 5, 1.6],
    ]),
  },
  {
    id: 'twinCascade',
    name: 'Twin Cascade',
    description: '複数モジュレータが1キャリアへ収束する複合配線。硬質な倍音に強い。',
    matrix: matrixWithRoutes([
      [2, 5, 0.7],
      [1, 4, 1.0],
      [0, 3, 1.3],
      [0, 2, 1.9],
      [0, 1, 2.2],
    ]),
  },
  {
    id: 'parallelCloud',
    name: 'Parallel Cloud',
    description: 'モジュレーションを浅くし、複数キャリアを並列で鳴らす厚み重視。',
    matrix: matrixWithRoutes([
      [0, 5, 0.8],
      [2, 4, 0.6],
      [4, 3, 0.4],
    ]),
  },
  {
    id: 'crossMetal',
    name: 'Cross Metal',
    description: '複数ソースを交差投入してメタリックな側帯波を作る。',
    matrix: matrixWithRoutes([
      [1, 5, 1.7],
      [1, 4, 2.0],
      [0, 3, 1.8],
      [0, 2, 1.8],
      [0, 1, 2.7],
    ]),
  },
  {
    id: 'bassFold',
    name: 'Bass Fold',
    description: '低域の芯を残しつつ、上段のモジュレーションで唸りを足す。',
    matrix: matrixWithRoutes([
      [4, 5, 1.4],
      [0, 4, 3.2],
      [2, 3, 2.2],
      [1, 2, 1.4],
      [0, 1, 1.2],
    ]),
  },
];

function makeInitOperators() {
  return [
    { ratio: 1, detune: 0, level: 0.95, output: 1.0, feedback: 0.0, attack: 0.01, decay: 0.18, sustain: 0.75, release: 0.25 },
    { ratio: 2, detune: 0, level: 0.55, output: 0.0, feedback: 0.0, attack: 0.01, decay: 0.25, sustain: 0.25, release: 0.18 },
    { ratio: 3, detune: 0, level: 0.25, output: 0.0, feedback: 0.0, attack: 0.01, decay: 0.22, sustain: 0.10, release: 0.16 },
    { ratio: 4, detune: 0, level: 0.18, output: 0.0, feedback: 0.0, attack: 0.01, decay: 0.20, sustain: 0.00, release: 0.14 },
    { ratio: 5, detune: 0, level: 0.12, output: 0.0, feedback: 0.0, attack: 0.01, decay: 0.15, sustain: 0.00, release: 0.12 },
    { ratio: 6, detune: 0, level: 0.10, output: 0.0, feedback: 0.0, attack: 0.01, decay: 0.12, sustain: 0.00, release: 0.10 },
  ];
}

const SOUND_PRESETS = [
  {
    id: 'epiano',
    name: 'Electric Piano',
    algorithmId: 'threePairs',
    outputGain: 0.34,
    operators: [
      { ratio: 1, detune: 0, level: 0.92, output: 0.95, feedback: 0.0, attack: 0.003, decay: 1.2, sustain: 0.08, release: 1.0 },
      { ratio: 3, detune: 0, level: 0.70, output: 0.0, feedback: 0.35, attack: 0.001, decay: 1.8, sustain: 0.0, release: 1.1 },
      { ratio: 1, detune: 5, level: 0.62, output: 0.38, feedback: 0.0, attack: 0.004, decay: 0.8, sustain: 0.22, release: 0.8 },
      { ratio: 14, detune: 0, level: 0.22, output: 0.0, feedback: 0.0, attack: 0.001, decay: 0.55, sustain: 0.0, release: 0.7 },
      { ratio: 1.01, detune: -4, level: 0.48, output: 0.22, feedback: 0.0, attack: 0.004, decay: 0.7, sustain: 0.24, release: 0.7 },
      { ratio: 8, detune: 0, level: 0.18, output: 0.0, feedback: 0.0, attack: 0.001, decay: 0.45, sustain: 0.0, release: 0.55 },
    ],
  },
  {
    id: 'glassbell',
    name: 'Glass Bell',
    algorithmId: 'crossMetal',
    outputGain: 0.28,
    operators: [
      { ratio: 1, detune: 0, level: 0.88, output: 1.0, feedback: 0.0, attack: 0.002, decay: 2.8, sustain: 0.0, release: 3.2 },
      { ratio: 2.414, detune: 0, level: 0.72, output: 0.0, feedback: 0.20, attack: 0.002, decay: 2.2, sustain: 0.0, release: 3.5 },
      { ratio: 3.0, detune: 0, level: 0.35, output: 0.0, feedback: 0.0, attack: 0.002, decay: 1.9, sustain: 0.0, release: 2.7 },
      { ratio: 1.5, detune: 0, level: 0.30, output: 0.0, feedback: 0.0, attack: 0.001, decay: 1.4, sustain: 0.0, release: 2.5 },
      { ratio: 6.8, detune: 0, level: 0.22, output: 0.0, feedback: 0.0, attack: 0.001, decay: 1.7, sustain: 0.0, release: 1.8 },
      { ratio: 9.2, detune: 0, level: 0.18, output: 0.0, feedback: 0.15, attack: 0.001, decay: 1.4, sustain: 0.0, release: 1.6 },
    ],
  },
  {
    id: 'deepbass',
    name: 'Deep Bass',
    algorithmId: 'bassFold',
    outputGain: 0.42,
    operators: [
      { ratio: 1, detune: 0, level: 1.00, output: 1.0, feedback: 0.0, attack: 0.001, decay: 0.12, sustain: 0.78, release: 0.18 },
      { ratio: 1, detune: -3, level: 0.78, output: 0.0, feedback: 0.55, attack: 0.001, decay: 0.16, sustain: 0.35, release: 0.15 },
      { ratio: 2, detune: 0, level: 0.42, output: 0.10, feedback: 0.0, attack: 0.001, decay: 0.22, sustain: 0.15, release: 0.12 },
      { ratio: 1.01, detune: 0, level: 0.34, output: 0.0, feedback: 0.20, attack: 0.001, decay: 0.16, sustain: 0.0, release: 0.10 },
      { ratio: 0.5, detune: 0, level: 0.28, output: 0.0, feedback: 0.25, attack: 0.001, decay: 0.10, sustain: 0.0, release: 0.08 },
      { ratio: 3, detune: 7, level: 0.14, output: 0.0, feedback: 0.0, attack: 0.001, decay: 0.18, sustain: 0.0, release: 0.08 },
    ],
  },
  {
    id: 'softpad',
    name: 'Soft Pad',
    algorithmId: 'stack6',
    outputGain: 0.25,
    operators: [
      { ratio: 1, detune: 0, level: 0.82, output: 0.85, feedback: 0.0, attack: 0.35, decay: 1.6, sustain: 0.72, release: 2.4 },
      { ratio: 2, detune: 4, level: 0.42, output: 0.0, feedback: 0.18, attack: 0.25, decay: 1.8, sustain: 0.30, release: 2.1 },
      { ratio: 3, detune: -5, level: 0.28, output: 0.0, feedback: 0.12, attack: 0.30, decay: 1.9, sustain: 0.22, release: 2.0 },
      { ratio: 0.5, detune: 0, level: 0.20, output: 0.15, feedback: 0.0, attack: 0.40, decay: 2.2, sustain: 0.65, release: 2.4 },
      { ratio: 5, detune: 0, level: 0.16, output: 0.0, feedback: 0.0, attack: 0.28, decay: 1.6, sustain: 0.0, release: 1.8 },
      { ratio: 7, detune: 0, level: 0.12, output: 0.0, feedback: 0.0, attack: 0.22, decay: 1.3, sustain: 0.0, release: 1.5 },
    ],
  },
  {
    id: 'organ',
    name: 'Warm Organ',
    algorithmId: 'parallelCloud',
    outputGain: 0.30,
    operators: [
      { ratio: 1, detune: 0, level: 0.70, output: 0.55, feedback: 0.0, attack: 0.005, decay: 0.25, sustain: 0.95, release: 0.25 },
      { ratio: 2, detune: 0, level: 0.40, output: 0.30, feedback: 0.10, attack: 0.005, decay: 0.25, sustain: 0.92, release: 0.25 },
      { ratio: 3, detune: 0, level: 0.32, output: 0.22, feedback: 0.10, attack: 0.005, decay: 0.25, sustain: 0.88, release: 0.25 },
      { ratio: 4, detune: 0, level: 0.18, output: 0.10, feedback: 0.0, attack: 0.005, decay: 0.22, sustain: 0.84, release: 0.24 },
      { ratio: 5, detune: 0, level: 0.10, output: 0.08, feedback: 0.0, attack: 0.005, decay: 0.20, sustain: 0.80, release: 0.22 },
      { ratio: 6, detune: 0, level: 0.10, output: 0.0, feedback: 0.08, attack: 0.005, decay: 0.18, sustain: 0.50, release: 0.20 },
    ],
  },
];

function buildDefaultNotes() {
  const notes = [];
  const addChord = (step, pitches, length, velocity = 0.82) => {
    for (const pitch of pitches) {
      notes.push({ id: crypto.randomUUID(), step, length, note: pitch, velocity });
    }
  };
  addChord(0, [48, 60, 64, 67], 7);
  addChord(8, [57, 60, 64, 69], 7);
  addChord(16, [53, 60, 65, 69], 7);
  addChord(24, [55, 62, 67, 71], 7);
  notes.push({ id: crypto.randomUUID(), step: 4, length: 2, note: 72, velocity: 0.88 });
  notes.push({ id: crypto.randomUUID(), step: 12, length: 2, note: 71, velocity: 0.84 });
  notes.push({ id: crypto.randomUUID(), step: 20, length: 2, note: 69, velocity: 0.82 });
  notes.push({ id: crypto.randomUUID(), step: 28, length: 2, note: 74, velocity: 0.90 });
  return notes;
}

const state = {
  bpm: 120,
  bars: 2,
  swing: 0,
  master: 0.75,
  cutoff: 14000,
  resonance: 0.8,
  delayMix: 0.18,
  delayTime: 0.28,
  currentAlgorithmId: 'threePairs',
  patch: {
    operators: deepClone(SOUND_PRESETS[0].operators),
    outputGain: SOUND_PRESETS[0].outputGain,
  },
  notes: buildDefaultNotes(),
  selectedNoteId: null,
  audioContext: null,
  synthNode: null,
  filterNode: null,
  compressorNode: null,
  masterGainNode: null,
  delayNode: null,
  delayFeedbackNode: null,
  delayWetGainNode: null,
  delayDryGainNode: null,
  schedulerWorker: null,
  playing: false,
  transportStartTime: 0,
  scheduleAheadTime: DEFAULT_SCHEDULE_AHEAD,
  scheduledEvents: new Map(),
  liveNotes: new Map(),
  midiAccess: null,
  keyboardHeld: new Set(),
  animationFrame: 0,
  labelsInner: null,
  drag: null,
};

const dom = {
  startAudioBtn: document.getElementById('startAudioBtn'),
  playBtn: document.getElementById('playBtn'),
  stopBtn: document.getElementById('stopBtn'),
  panicBtn: document.getElementById('panicBtn'),
  initPatchBtn: document.getElementById('initPatchBtn'),
  saveProjectBtn: document.getElementById('saveProjectBtn'),
  loadProjectBtn: document.getElementById('loadProjectBtn'),
  midiBtn: document.getElementById('midiBtn'),
  projectFileInput: document.getElementById('projectFileInput'),
  bpmInput: document.getElementById('bpmInput'),
  barsInput: document.getElementById('barsInput'),
  swingInput: document.getElementById('swingInput'),
  swingValue: document.getElementById('swingValue'),
  masterInput: document.getElementById('masterInput'),
  masterValue: document.getElementById('masterValue'),
  cutoffInput: document.getElementById('cutoffInput'),
  cutoffValue: document.getElementById('cutoffValue'),
  resoInput: document.getElementById('resoInput'),
  resoValue: document.getElementById('resoValue'),
  delayMixInput: document.getElementById('delayMixInput'),
  delayMixValue: document.getElementById('delayMixValue'),
  delayTimeInput: document.getElementById('delayTimeInput'),
  delayTimeValue: document.getElementById('delayTimeValue'),
  statusText: document.getElementById('statusText'),
  latencyText: document.getElementById('latencyText'),
  transportText: document.getElementById('transportText'),
  clearPatternBtn: document.getElementById('clearPatternBtn'),
  demoPatternBtn: document.getElementById('demoPatternBtn'),
  soundPresetSelect: document.getElementById('soundPresetSelect'),
  algorithmSelect: document.getElementById('algorithmSelect'),
  octaveSelect: document.getElementById('octaveSelect'),
  noteLabels: document.getElementById('noteLabels'),
  rollViewport: document.getElementById('rollViewport'),
  stepHeader: document.getElementById('stepHeader'),
  rollContent: document.getElementById('rollContent'),
  gridLayer: document.getElementById('gridLayer'),
  barLayer: document.getElementById('barLayer'),
  noteLayer: document.getElementById('noteLayer'),
  playhead: document.getElementById('playhead'),
  noteStepInput: document.getElementById('noteStepInput'),
  noteLengthInput: document.getElementById('noteLengthInput'),
  noteVelocityInput: document.getElementById('noteVelocityInput'),
  noteVelocityValue: document.getElementById('noteVelocityValue'),
  notePitchInput: document.getElementById('notePitchInput'),
  deleteNoteBtn: document.getElementById('deleteNoteBtn'),
  algorithmSummary: document.getElementById('algorithmSummary'),
  operatorsContainer: document.getElementById('operatorsContainer'),
};

function getTotalSteps() {
  return state.bars * 16;
}

function getLoopLengthBeats() {
  return state.bars * 4;
}

function getCurrentAlgorithm() {
  return ALGORITHM_PRESETS.find((preset) => preset.id === state.currentAlgorithmId) || ALGORITHM_PRESETS[0];
}

function buildPatchForAudio() {
  const preset = getCurrentAlgorithm();
  const matrix = deepClone(preset.matrix);
  const operators = state.patch.operators.map((op, index) => {
    matrix[index][index] = op.feedback;
    return {
      ratio: Number(op.ratio),
      detune: Number(op.detune),
      level: Number(op.level),
      output: Number(op.output),
      feedback: Number(op.feedback),
      attack: Number(op.attack),
      decay: Number(op.decay),
      sustain: Number(op.sustain),
      release: Number(op.release),
    };
  });
  return {
    operators,
    matrix,
    outputGain: Number(state.patch.outputGain),
  };
}

function setStatus(text) {
  dom.statusText.textContent = text;
}

function updateLatencyText() {
  if (!state.audioContext) {
    dom.latencyText.textContent = '-';
    return;
  }
  const base = typeof state.audioContext.baseLatency === 'number'
    ? `${(state.audioContext.baseLatency * 1000).toFixed(1)} ms base`
    : 'base n/a';
  const out = typeof state.audioContext.outputLatency === 'number'
    ? `${(state.audioContext.outputLatency * 1000).toFixed(1)} ms out`
    : 'out n/a';
  dom.latencyText.textContent = `${base}, ${out}`;
}

function updateTransportText() {
  if (!state.playing || !state.audioContext) {
    dom.transportText.textContent = 'Stopped';
    return;
  }
  const elapsed = Math.max(0, state.audioContext.currentTime - state.transportStartTime);
  const beat = secondsToBeats(elapsed, state.bpm);
  const loopBeat = ((beat % getLoopLengthBeats()) + getLoopLengthBeats()) % getLoopLengthBeats();
  dom.transportText.textContent = `Playing · beat ${loopBeat.toFixed(2)} / ${getLoopLengthBeats().toFixed(2)}`;
}

function populateSelects() {
  for (const preset of SOUND_PRESETS) {
    const option = document.createElement('option');
    option.value = preset.id;
    option.textContent = preset.name;
    dom.soundPresetSelect.append(option);
  }
  dom.soundPresetSelect.value = 'epiano';

  for (const preset of ALGORITHM_PRESETS) {
    const option = document.createElement('option');
    option.value = preset.id;
    option.textContent = preset.name;
    dom.algorithmSelect.append(option);
  }
  dom.algorithmSelect.value = state.currentAlgorithmId;
}

function loadSoundPreset(presetId) {
  const preset = SOUND_PRESETS.find((item) => item.id === presetId);
  if (!preset) return;
  state.currentAlgorithmId = preset.algorithmId;
  state.patch = {
    operators: deepClone(preset.operators),
    outputGain: preset.outputGain,
  };
  dom.algorithmSelect.value = preset.algorithmId;
  refreshPatchForm();
  renderAlgorithmSummary();
  sendPatchToAudio();
  persistProject();
  setStatus(`Sound preset: ${preset.name}`);
}

function initPatch() {
  state.currentAlgorithmId = 'stack6';
  state.patch = {
    operators: makeInitOperators(),
    outputGain: 0.32,
  };
  dom.algorithmSelect.value = state.currentAlgorithmId;
  refreshPatchForm();
  renderAlgorithmSummary();
  sendPatchToAudio();
  persistProject();
  setStatus('Patch initialized');
}

function buildOperatorCards() {
  dom.operatorsContainer.innerHTML = '';
  state.patch.operators.forEach((op, index) => {
    const card = document.createElement('div');
    card.className = 'operator-card';
    card.innerHTML = `
      <h3><span>Operator ${index + 1}</span><small>${index === 0 ? 'Primary' : 'FM'}</small></h3>
      <div class="operator-grid">
        <label>Ratio
          <input data-op="${index}" data-key="ratio" type="number" min="0.125" max="32" step="0.001" value="${op.ratio}" />
        </label>
        <label>Detune cents
          <input data-op="${index}" data-key="detune" type="number" min="-1200" max="1200" step="1" value="${op.detune}" />
        </label>
        <label>Level
          <input data-op="${index}" data-key="level" type="number" min="0" max="1.5" step="0.01" value="${op.level}" />
        </label>
        <label>Output
          <input data-op="${index}" data-key="output" type="number" min="0" max="1.5" step="0.01" value="${op.output}" />
        </label>
        <label>Feedback
          <input data-op="${index}" data-key="feedback" type="number" min="0" max="12" step="0.01" value="${op.feedback}" />
        </label>
        <label>Attack s
          <input data-op="${index}" data-key="attack" type="number" min="0.0001" max="8" step="0.001" value="${op.attack}" />
        </label>
        <label>Decay s
          <input data-op="${index}" data-key="decay" type="number" min="0.0001" max="8" step="0.001" value="${op.decay}" />
        </label>
        <label>Sustain
          <input data-op="${index}" data-key="sustain" type="number" min="0" max="1" step="0.01" value="${op.sustain}" />
        </label>
        <label>Release s
          <input data-op="${index}" data-key="release" type="number" min="0.0001" max="12" step="0.001" value="${op.release}" />
        </label>
      </div>
    `;
    dom.operatorsContainer.append(card);
  });

  dom.operatorsContainer.querySelectorAll('input[data-op]').forEach((input) => {
    input.addEventListener('input', onOperatorInput);
    input.addEventListener('change', onOperatorInput);
  });
}

function refreshPatchForm() {
  buildOperatorCards();
}

function onOperatorInput(event) {
  const input = event.currentTarget;
  const opIndex = Number(input.dataset.op);
  const key = input.dataset.key;
  if (!state.patch.operators[opIndex] || !key) return;
  state.patch.operators[opIndex][key] = Number(input.value);
  sendPatchToAudio();
  persistProject();
}

function renderAlgorithmSummary() {
  const preset = getCurrentAlgorithm();
  const routes = [];
  preset.matrix.forEach((row, target) => {
    row.forEach((amount, source) => {
      if (Math.abs(amount) > 0.0001) {
        routes.push(`Op${source + 1} → Op${target + 1} (${amount.toFixed(2)})`);
      }
    });
  });
  const outputs = state.patch.operators
    .map((op, index) => (op.output > 0.001 ? `Op${index + 1}:${op.output.toFixed(2)}` : null))
    .filter(Boolean);
  const feedback = state.patch.operators
    .map((op, index) => (op.feedback > 0.001 ? `Op${index + 1}:${op.feedback.toFixed(2)}` : null))
    .filter(Boolean);

  dom.algorithmSummary.innerHTML = `
    <div><strong>${preset.name}</strong> — ${preset.description}</div>
    <div><strong>Carriers:</strong> ${outputs.length ? outputs.join(', ') : 'none'}</div>
    <div><strong>Feedback:</strong> ${feedback.length ? feedback.join(', ') : 'none'}</div>
    <ul class="route-list">
      ${routes.map((route) => `<li>${route}</li>`).join('')}
    </ul>
  `;
}

function renderStepHeader() {
  const totalSteps = getTotalSteps();
  const headerInner = document.createElement('div');
  headerInner.className = 'step-header-inner';
  headerInner.style.gridTemplateColumns = `repeat(${totalSteps}, ${CELL_W}px)`;
  for (let step = 0; step < totalSteps; step += 1) {
    const cell = document.createElement('div');
    cell.className = `step-cell ${(step % 16 === 0) ? 'bar' : ''}`;
    const barNumber = Math.floor(step / 16) + 1;
    const beatNumber = Math.floor((step % 16) / 4) + 1;
    cell.textContent = step % 4 === 0 ? `${barNumber}.${beatNumber}` : '·';
    headerInner.append(cell);
  }
  dom.stepHeader.innerHTML = '';
  dom.stepHeader.append(headerInner);
}

function renderNoteLabels() {
  dom.noteLabels.innerHTML = '<div style="height: var(--header-height)"></div>';
  const inner = document.createElement('div');
  inner.style.position = 'absolute';
  inner.style.left = '0';
  inner.style.right = '0';
  inner.style.top = 'var(--header-height)';

  for (let note = NOTE_MAX; note >= NOTE_MIN; note -= 1) {
    const row = document.createElement('div');
    row.className = `note-label-row ${isBlackKey(note) ? 'black' : ''}`;
    row.textContent = noteName(note);
    inner.append(row);
  }
  dom.noteLabels.append(inner);
  state.labelsInner = inner;
}

function renderGridGeometry() {
  const width = getTotalSteps() * CELL_W;
  const height = (NOTE_MAX - NOTE_MIN + 1) * CELL_H;
  dom.rollContent.style.width = `${width}px`;
  dom.rollContent.style.height = `${height}px`;
  dom.gridLayer.style.width = `${width}px`;
  dom.gridLayer.style.height = `${height}px`;
  dom.barLayer.style.width = `${width}px`;
  dom.barLayer.style.height = `${height}px`;
  dom.noteLayer.style.width = `${width}px`;
  dom.noteLayer.style.height = `${height}px`;
  dom.playhead.style.height = `${height}px`;

  dom.barLayer.innerHTML = '';
  for (let bar = 0; bar <= state.bars; bar += 1) {
    const line = document.createElement('div');
    line.className = 'bar-accent';
    line.style.left = `${bar * 16 * CELL_W}px`;
    dom.barLayer.append(line);
  }
}

function sortNotes() {
  state.notes.sort((a, b) => a.step - b.step || a.note - b.note || a.id.localeCompare(b.id));
}

function renderNotes() {
  const totalSteps = getTotalSteps();
  dom.noteLayer.innerHTML = '';
  sortNotes();

  for (const note of state.notes) {
    if (note.step >= totalSteps) continue;
    const block = document.createElement('div');
    block.className = `note-block ${note.id === state.selectedNoteId ? 'selected' : ''}`;
    block.dataset.noteId = note.id;
    block.style.left = `${note.step * CELL_W + 1}px`;
    block.style.top = `${noteToRow(note.note) * CELL_H + 1}px`;
    block.style.width = `${Math.max(8, note.length * CELL_W - 2)}px`;
    block.style.height = `${CELL_H - 2}px`;
    const label = note.length >= 2 ? noteName(note.note) : '';
    block.innerHTML = `<span>${label}</span><span class="resize-handle"></span>`;

    block.addEventListener('pointerdown', onNoteBlockPointerDown);
    block.addEventListener('contextmenu', (event) => {
      event.preventDefault();
      deleteNote(note.id);
    });
    dom.noteLayer.append(block);
  }
}

function renderSequencer() {
  renderStepHeader();
  renderNoteLabels();
  renderGridGeometry();
  renderNotes();
}

function pointToGrid(event) {
  const rect = dom.noteLayer.getBoundingClientRect();
  const x = clamp(event.clientX - rect.left, 0, rect.width - 1);
  const y = clamp(event.clientY - rect.top, 0, rect.height - 1);
  return {
    x,
    y,
    step: clamp(Math.floor(x / CELL_W), 0, getTotalSteps() - 1),
    note: clamp(rowToNote(Math.floor(y / CELL_H)), NOTE_MIN, NOTE_MAX),
  };
}

function selectNote(noteId) {
  state.selectedNoteId = noteId;
  renderNotes();
  refreshNoteInspector();
}

function findSelectedNote() {
  return state.notes.find((note) => note.id === state.selectedNoteId) || null;
}

function refreshNoteInspector() {
  const note = findSelectedNote();
  const disabled = !note;
  dom.noteStepInput.disabled = disabled;
  dom.noteLengthInput.disabled = disabled;
  dom.noteVelocityInput.disabled = disabled;
  dom.notePitchInput.disabled = disabled;
  dom.deleteNoteBtn.disabled = disabled;

  if (!note) {
    dom.noteStepInput.value = '';
    dom.noteLengthInput.value = '';
    dom.noteVelocityInput.value = '0.8';
    dom.noteVelocityValue.textContent = '-';
    dom.notePitchInput.value = '';
    return;
  }

  dom.noteStepInput.max = String(getTotalSteps() - 1);
  dom.noteStepInput.value = String(note.step);
  dom.noteLengthInput.value = String(note.length);
  dom.noteVelocityInput.value = String(note.velocity);
  dom.noteVelocityValue.textContent = note.velocity.toFixed(2);
  dom.notePitchInput.value = String(note.note);
}

function deleteNote(noteId) {
  const index = state.notes.findIndex((note) => note.id === noteId);
  if (index === -1) return;
  state.notes.splice(index, 1);
  if (state.selectedNoteId === noteId) state.selectedNoteId = null;
  renderNotes();
  refreshNoteInspector();
  persistProject();
}

function clampNotesToGrid() {
  const maxStep = getTotalSteps() - 1;
  state.notes = state.notes
    .filter((note) => note.note >= NOTE_MIN && note.note <= NOTE_MAX)
    .map((note) => ({
      ...note,
      step: clamp(note.step, 0, maxStep),
      length: clamp(note.length, 1, getTotalSteps() - clamp(note.step, 0, maxStep)),
      velocity: clamp(note.velocity, 0.05, 1),
    }));
  if (findSelectedNote() == null) {
    state.selectedNoteId = null;
  }
}

function onEmptyGridPointerDown(event) {
  if (event.button !== 0) return;
  const grid = pointToGrid(event);
  const newNote = {
    id: crypto.randomUUID(),
    step: grid.step,
    length: 1,
    note: grid.note,
    velocity: 0.85,
  };
  state.notes.push(newNote);
  state.drag = {
    mode: 'create',
    pointerId: event.pointerId,
    noteId: newNote.id,
    startStep: grid.step,
  };
  selectNote(newNote.id);
  renderNotes();
  window.addEventListener('pointermove', onGlobalPointerMove);
  window.addEventListener('pointerup', onGlobalPointerUp, { once: false });
  persistProject();
}

function onNoteBlockPointerDown(event) {
  if (event.button !== 0) return;
  event.stopPropagation();
  const noteId = event.currentTarget.dataset.noteId;
  const note = state.notes.find((item) => item.id === noteId);
  if (!note) return;

  const handle = event.target.closest('.resize-handle');
  state.drag = {
    mode: handle ? 'resize' : 'move',
    pointerId: event.pointerId,
    noteId,
    startX: event.clientX,
    startY: event.clientY,
    startStep: note.step,
    startLength: note.length,
    startNote: note.note,
  };
  selectNote(noteId);
  window.addEventListener('pointermove', onGlobalPointerMove);
  window.addEventListener('pointerup', onGlobalPointerUp, { once: false });
}

function onGlobalPointerMove(event) {
  if (!state.drag) return;
  const note = state.notes.find((item) => item.id === state.drag.noteId);
  if (!note) return;

  if (state.drag.mode === 'create') {
    const grid = pointToGrid(event);
    note.length = clamp(grid.step - state.drag.startStep + 1, 1, getTotalSteps() - state.drag.startStep);
  } else if (state.drag.mode === 'move') {
    const stepDelta = Math.round((event.clientX - state.drag.startX) / CELL_W);
    const noteDelta = -Math.round((event.clientY - state.drag.startY) / CELL_H);
    note.step = clamp(state.drag.startStep + stepDelta, 0, getTotalSteps() - note.length);
    note.note = clamp(state.drag.startNote + noteDelta, NOTE_MIN, NOTE_MAX);
  } else if (state.drag.mode === 'resize') {
    const stepDelta = Math.round((event.clientX - state.drag.startX) / CELL_W);
    note.length = clamp(state.drag.startLength + stepDelta, 1, getTotalSteps() - state.drag.startStep);
  }

  renderNotes();
  refreshNoteInspector();
}

function onGlobalPointerUp() {
  if (!state.drag) return;
  state.drag = null;
  window.removeEventListener('pointermove', onGlobalPointerMove);
  window.removeEventListener('pointerup', onGlobalPointerUp);
  clampNotesToGrid();
  renderNotes();
  refreshNoteInspector();
  persistProject();
}

function bindSequencerEvents() {
  dom.noteLayer.addEventListener('pointerdown', onEmptyGridPointerDown);
  dom.noteLayer.addEventListener('contextmenu', (event) => event.preventDefault());

  dom.rollViewport.addEventListener('scroll', () => {
    if (state.labelsInner) {
      state.labelsInner.style.transform = `translateY(${-dom.rollViewport.scrollTop}px)`;
    }
  });

  dom.noteStepInput.addEventListener('input', () => {
    const note = findSelectedNote();
    if (!note) return;
    note.step = clamp(Number(dom.noteStepInput.value), 0, getTotalSteps() - note.length);
    renderNotes();
    persistProject();
  });
  dom.noteLengthInput.addEventListener('input', () => {
    const note = findSelectedNote();
    if (!note) return;
    note.length = clamp(Number(dom.noteLengthInput.value), 1, getTotalSteps() - note.step);
    renderNotes();
    persistProject();
  });
  dom.noteVelocityInput.addEventListener('input', () => {
    const note = findSelectedNote();
    if (!note) return;
    note.velocity = clamp(Number(dom.noteVelocityInput.value), 0.05, 1);
    dom.noteVelocityValue.textContent = note.velocity.toFixed(2);
    persistProject();
  });
  dom.notePitchInput.addEventListener('input', () => {
    const note = findSelectedNote();
    if (!note) return;
    note.note = clamp(Number(dom.notePitchInput.value), NOTE_MIN, NOTE_MAX);
    renderNotes();
    persistProject();
  });
  dom.deleteNoteBtn.addEventListener('click', () => {
    if (state.selectedNoteId) deleteNote(state.selectedNoteId);
  });
}

function applyGlobalUIToState() {
  state.bpm = Number(dom.bpmInput.value);
  state.bars = Number(dom.barsInput.value);
  state.swing = Number(dom.swingInput.value) / 100;
  state.master = Number(dom.masterInput.value);
  state.cutoff = Number(dom.cutoffInput.value);
  state.resonance = Number(dom.resoInput.value);
  state.delayMix = Number(dom.delayMixInput.value);
  state.delayTime = Number(dom.delayTimeInput.value);
}

function refreshGlobalLabels() {
  dom.swingValue.textContent = `${Math.round(state.swing * 100)}%`;
  dom.masterValue.textContent = state.master.toFixed(2);
  dom.cutoffValue.textContent = `${Math.round(state.cutoff)} Hz`;
  dom.resoValue.textContent = state.resonance.toFixed(1);
  dom.delayMixValue.textContent = state.delayMix.toFixed(2);
  dom.delayTimeValue.textContent = `${state.delayTime.toFixed(2)} s`;
}

function bindGlobalControls() {
  const listeners = [
    dom.bpmInput,
    dom.barsInput,
    dom.swingInput,
    dom.masterInput,
    dom.cutoffInput,
    dom.resoInput,
    dom.delayMixInput,
    dom.delayTimeInput,
  ];

  listeners.forEach((input) => {
    input.addEventListener('input', () => {
      applyGlobalUIToState();
      refreshGlobalLabels();
      clampNotesToGrid();
      renderSequencer();
      refreshNoteInspector();
      applyFxState();
      persistProject();
    });
  });

  dom.soundPresetSelect.addEventListener('change', () => loadSoundPreset(dom.soundPresetSelect.value));
  dom.algorithmSelect.addEventListener('change', () => {
    state.currentAlgorithmId = dom.algorithmSelect.value;
    renderAlgorithmSummary();
    sendPatchToAudio();
    persistProject();
  });

  dom.clearPatternBtn.addEventListener('click', () => {
    state.notes = [];
    state.selectedNoteId = null;
    renderNotes();
    refreshNoteInspector();
    persistProject();
  });

  dom.demoPatternBtn.addEventListener('click', () => {
    state.notes = buildDefaultNotes();
    state.selectedNoteId = null;
    renderNotes();
    refreshNoteInspector();
    persistProject();
  });

  dom.initPatchBtn.addEventListener('click', initPatch);
  dom.saveProjectBtn.addEventListener('click', saveProjectToFile);
  dom.loadProjectBtn.addEventListener('click', () => dom.projectFileInput.click());
  dom.projectFileInput.addEventListener('change', onLoadProjectFile);

  dom.startAudioBtn.addEventListener('click', async () => {
    await ensureAudio();
    if (state.audioContext?.state === 'suspended') await state.audioContext.resume();
    updateLatencyText();
    setStatus('Audio ready');
  });

  dom.playBtn.addEventListener('click', play);
  dom.stopBtn.addEventListener('click', stop);
  dom.panicBtn.addEventListener('click', panic);
  dom.midiBtn.addEventListener('click', connectMIDI);
}

function applyFxState() {
  if (!state.audioContext) return;
  const now = state.audioContext.currentTime;
  if (state.filterNode) {
    state.filterNode.frequency.setTargetAtTime(state.cutoff, now, 0.01);
    state.filterNode.Q.setTargetAtTime(state.resonance, now, 0.01);
  }
  if (state.masterGainNode) {
    state.masterGainNode.gain.setTargetAtTime(state.master, now, 0.01);
  }
  if (state.delayNode) {
    state.delayNode.delayTime.setTargetAtTime(state.delayTime, now, 0.01);
  }
  if (state.delayWetGainNode && state.delayDryGainNode) {
    state.delayWetGainNode.gain.setTargetAtTime(state.delayMix, now, 0.01);
    state.delayDryGainNode.gain.setTargetAtTime(1 - state.delayMix * 0.7, now, 0.01);
  }
}

async function ensureAudio() {
  if (state.audioContext) {
    if (state.audioContext.state === 'suspended') await state.audioContext.resume();
    updateLatencyText();
    return;
  }

  const ctx = new AudioContext({ latencyHint: 'interactive' });
  await ctx.audioWorklet.addModule('fm-synth-worklet.js');

  const synth = new AudioWorkletNode(ctx, 'fm-synth-processor', {
    numberOfInputs: 0,
    numberOfOutputs: 1,
    outputChannelCount: [2],
    processorOptions: {
      polyphony: 16,
      patch: buildPatchForAudio(),
    },
  });

  const filter = new BiquadFilterNode(ctx, { type: 'lowpass', frequency: state.cutoff, Q: state.resonance });
  const compressor = new DynamicsCompressorNode(ctx, {
    threshold: -18,
    knee: 20,
    ratio: 3,
    attack: 0.003,
    release: 0.25,
  });
  const delay = new DelayNode(ctx, { maxDelayTime: 1.2, delayTime: state.delayTime });
  const delayFeedback = new GainNode(ctx, { gain: 0.32 });
  const wetGain = new GainNode(ctx, { gain: state.delayMix });
  const dryGain = new GainNode(ctx, { gain: 1 - state.delayMix * 0.7 });
  const masterGain = new GainNode(ctx, { gain: state.master });

  synth.connect(filter);
  filter.connect(compressor);
  compressor.connect(dryGain);
  dryGain.connect(masterGain);
  compressor.connect(delay);
  delay.connect(delayFeedback);
  delayFeedback.connect(delay);
  delay.connect(wetGain);
  wetGain.connect(masterGain);
  masterGain.connect(ctx.destination);

  const worker = new Worker('scheduler-worker.js');
  worker.onmessage = (event) => {
    const msg = event.data || {};
    if (msg.type === 'tick' && state.playing) scheduleWindow();
  };

  state.audioContext = ctx;
  state.synthNode = synth;
  state.filterNode = filter;
  state.compressorNode = compressor;
  state.delayNode = delay;
  state.delayFeedbackNode = delayFeedback;
  state.delayWetGainNode = wetGain;
  state.delayDryGainNode = dryGain;
  state.masterGainNode = masterGain;
  state.schedulerWorker = worker;

  applyFxState();
  updateLatencyText();
  setStatus('Audio initialized');
}

function sendPatchToAudio() {
  if (!state.synthNode) return;
  state.synthNode.port.postMessage({ type: 'setPatch', patch: buildPatchForAudio() });
}

function swingOffsetBeats(step) {
  return step % 2 === 1 ? STEP_BEATS * state.swing : 0;
}

function scheduleNoteEvent(note, loopIndex) {
  if (!state.audioContext || !state.synthNode) return;
  const baseBeat = note.step * STEP_BEATS + swingOffsetBeats(note.step);
  const startBeat = baseBeat + loopIndex * getLoopLengthBeats();
  const durationBeats = note.length * STEP_BEATS;
  const startTime = state.transportStartTime + beatsToSeconds(startBeat, state.bpm);
  const endTime = startTime + beatsToSeconds(durationBeats, state.bpm);
  const noteId = `${note.id}@${loopIndex}`;
  const key = `${note.id}:${loopIndex}`;
  state.scheduledEvents.set(key, endTime);
  state.synthNode.port.postMessage({
    type: 'noteOn',
    time: startTime,
    noteId,
    midiNote: note.note,
    velocity: note.velocity,
    frequency: midiToFrequency(note.note),
  });
  state.synthNode.port.postMessage({
    type: 'noteOff',
    time: endTime,
    noteId,
    midiNote: note.note,
  });
}

function scheduleWindow() {
  if (!state.audioContext || !state.playing) return;
  const now = state.audioContext.currentTime;
  const loopBeats = getLoopLengthBeats();
  const windowStartBeat = secondsToBeats(Math.max(0, now - state.transportStartTime), state.bpm);
  const windowEndBeat = secondsToBeats(Math.max(0, now + state.scheduleAheadTime - state.transportStartTime), state.bpm);

  for (const [key, endTime] of state.scheduledEvents) {
    if (endTime < now - 0.5) state.scheduledEvents.delete(key);
  }

  for (const note of state.notes) {
    const baseBeat = note.step * STEP_BEATS + swingOffsetBeats(note.step);
    let loopIndex = Math.floor((windowStartBeat - baseBeat) / loopBeats);
    if (Number.isNaN(loopIndex) || !Number.isFinite(loopIndex)) loopIndex = 0;

    while (true) {
      const occurrenceBeat = baseBeat + loopIndex * loopBeats;
      if (occurrenceBeat >= windowEndBeat) break;
      if (occurrenceBeat >= windowStartBeat - 1e-9) {
        const key = `${note.id}:${loopIndex}`;
        if (!state.scheduledEvents.has(key)) {
          scheduleNoteEvent(note, loopIndex);
        }
      }
      loopIndex += 1;
    }
  }
}

async function play() {
  await ensureAudio();
  if (state.audioContext.state === 'suspended') await state.audioContext.resume();
  state.scheduledEvents.clear();
  state.playing = true;
  state.transportStartTime = state.audioContext.currentTime + 0.08;
  state.schedulerWorker.postMessage({ type: 'start', intervalMs: DEFAULT_LOOKAHEAD_MS });
  scheduleWindow();
  updateTransportText();
  setStatus('Transport playing');
}

function stop() {
  if (!state.playing) return;
  state.playing = false;
  state.scheduledEvents.clear();
  if (state.schedulerWorker) state.schedulerWorker.postMessage({ type: 'stop' });
  if (state.synthNode) state.synthNode.port.postMessage({ type: 'allNotesOff' });
  updateTransportText();
  setStatus('Transport stopped');
}

function panic() {
  state.playing = false;
  state.scheduledEvents.clear();
  if (state.schedulerWorker) state.schedulerWorker.postMessage({ type: 'stop' });
  if (state.synthNode) state.synthNode.port.postMessage({ type: 'panic' });
  for (const entry of state.liveNotes.values()) {
    entry.active = false;
  }
  state.liveNotes.clear();
  setStatus('Panic sent');
  updateTransportText();
}

function updatePlayhead() {
  if (state.playing && state.audioContext) {
    const elapsed = Math.max(0, state.audioContext.currentTime - state.transportStartTime);
    const beat = secondsToBeats(elapsed, state.bpm);
    const loopBeat = ((beat % getLoopLengthBeats()) + getLoopLengthBeats()) % getLoopLengthBeats();
    const x = loopBeat / STEP_BEATS * CELL_W;
    dom.playhead.style.transform = `translateX(${x}px)`;
  } else {
    dom.playhead.style.transform = 'translateX(0px)';
  }
  updateTransportText();
  state.animationFrame = requestAnimationFrame(updatePlayhead);
}

function makeLiveNoteId(prefix, midiNote) {
  return `${prefix}-${midiNote}-${performance.now().toFixed(3)}-${crypto.randomUUID()}`;
}

async function triggerLiveNoteOn(midiNote, velocity = 0.9, source = 'live') {
  await ensureAudio();
  if (state.audioContext.state === 'suspended') await state.audioContext.resume();
  const noteId = makeLiveNoteId(source, midiNote);
  const when = state.audioContext.currentTime + 0.002;
  state.liveNotes.set(`${source}:${midiNote}`, { noteId, midiNote });
  state.synthNode.port.postMessage({
    type: 'noteOn',
    time: when,
    noteId,
    midiNote,
    velocity,
    frequency: midiToFrequency(midiNote),
  });
}

function triggerLiveNoteOff(midiNote, source = 'live') {
  if (!state.synthNode || !state.audioContext) return;
  const key = `${source}:${midiNote}`;
  const entry = state.liveNotes.get(key);
  if (!entry) return;
  state.synthNode.port.postMessage({
    type: 'noteOff',
    time: state.audioContext.currentTime + 0.002,
    noteId: entry.noteId,
    midiNote,
  });
  state.liveNotes.delete(key);
}

async function connectMIDI() {
  if (!('requestMIDIAccess' in navigator)) {
    setStatus('Web MIDI not supported in this browser');
    return;
  }
  try {
    const midiAccess = await navigator.requestMIDIAccess();
    state.midiAccess = midiAccess;
    const attach = () => {
      for (const input of midiAccess.inputs.values()) {
        input.onmidimessage = onMIDIMessage;
      }
    };
    attach();
    midiAccess.onstatechange = attach;
    setStatus(`MIDI connected (${midiAccess.inputs.size} input)`);
  } catch (error) {
    console.error(error);
    setStatus('MIDI permission denied or unavailable');
  }
}

function onMIDIMessage(event) {
  const [status, data1, data2] = event.data;
  const type = status & 0xf0;
  if (type === 0x90 && data2 > 0) {
    triggerLiveNoteOn(data1, data2 / 127, 'midi');
  } else if (type === 0x80 || (type === 0x90 && data2 === 0)) {
    triggerLiveNoteOff(data1, 'midi');
  }
}

function handleKeyboardDown(event) {
  if (event.repeat) return;
  if (event.target instanceof HTMLInputElement || event.target instanceof HTMLSelectElement || event.target instanceof HTMLTextAreaElement) {
    return;
  }
  const semitone = KEYBOARD_MAP[event.key.toLowerCase()];
  if (semitone == null) return;
  event.preventDefault();
  if (state.keyboardHeld.has(event.key.toLowerCase())) return;
  state.keyboardHeld.add(event.key.toLowerCase());
  const octave = Number(dom.octaveSelect.value);
  const midiNote = (octave + 1) * 12 + semitone;
  triggerLiveNoteOn(midiNote, 0.85, 'kbd');
}

function handleKeyboardUp(event) {
  const semitone = KEYBOARD_MAP[event.key.toLowerCase()];
  if (semitone == null) return;
  const octave = Number(dom.octaveSelect.value);
  const midiNote = (octave + 1) * 12 + semitone;
  state.keyboardHeld.delete(event.key.toLowerCase());
  triggerLiveNoteOff(midiNote, 'kbd');
}

function serializeProject() {
  return {
    version: 1,
    bpm: state.bpm,
    bars: state.bars,
    swing: state.swing,
    master: state.master,
    cutoff: state.cutoff,
    resonance: state.resonance,
    delayMix: state.delayMix,
    delayTime: state.delayTime,
    currentAlgorithmId: state.currentAlgorithmId,
    patch: deepClone(state.patch),
    notes: deepClone(state.notes),
    soundPresetId: dom.soundPresetSelect.value,
  };
}

function persistProject() {
  try {
    localStorage.setItem('fm-workstation-project', JSON.stringify(serializeProject()));
  } catch (_error) {
    // ignore storage issues
  }
}

function restoreProjectFromStorage() {
  try {
    const raw = localStorage.getItem('fm-workstation-project');
    if (!raw) return false;
    const data = JSON.parse(raw);
    applyProjectData(data, false);
    return true;
  } catch (_error) {
    return false;
  }
}

function applyProjectData(data, persist = true) {
  state.bpm = clamp(Number(data.bpm) || 120, 40, 240);
  state.bars = clamp(Number(data.bars) || 2, 1, 8);
  state.swing = clamp(Number(data.swing) || 0, 0, 0.5);
  state.master = clamp(Number(data.master) || 0.75, 0, 1);
  state.cutoff = clamp(Number(data.cutoff) || 14000, 120, 18000);
  state.resonance = clamp(Number(data.resonance) || 0.8, 0.2, 20);
  state.delayMix = clamp(Number(data.delayMix) || 0.18, 0, 0.8);
  state.delayTime = clamp(Number(data.delayTime) || 0.28, 0.05, 0.8);
  state.currentAlgorithmId = ALGORITHM_PRESETS.some((preset) => preset.id === data.currentAlgorithmId)
    ? data.currentAlgorithmId
    : 'threePairs';
  state.patch = {
    operators: Array.isArray(data.patch?.operators) && data.patch.operators.length === 6
      ? data.patch.operators.map((op) => ({
          ratio: Number(op.ratio),
          detune: Number(op.detune),
          level: Number(op.level),
          output: Number(op.output),
          feedback: Number(op.feedback),
          attack: Number(op.attack),
          decay: Number(op.decay),
          sustain: Number(op.sustain),
          release: Number(op.release),
        }))
      : makeInitOperators(),
    outputGain: Number(data.patch?.outputGain) || 0.32,
  };
  state.notes = Array.isArray(data.notes)
    ? data.notes.map((note) => ({
        id: note.id || crypto.randomUUID(),
        step: Number(note.step),
        length: Number(note.length),
        note: Number(note.note),
        velocity: Number(note.velocity),
      }))
    : [];
  state.selectedNoteId = null;
  clampNotesToGrid();

  dom.bpmInput.value = String(state.bpm);
  dom.barsInput.value = String(state.bars);
  dom.swingInput.value = String(Math.round(state.swing * 100));
  dom.masterInput.value = String(state.master);
  dom.cutoffInput.value = String(state.cutoff);
  dom.resoInput.value = String(state.resonance);
  dom.delayMixInput.value = String(state.delayMix);
  dom.delayTimeInput.value = String(state.delayTime);
  dom.algorithmSelect.value = state.currentAlgorithmId;
  if (data.soundPresetId && SOUND_PRESETS.some((preset) => preset.id === data.soundPresetId)) {
    dom.soundPresetSelect.value = data.soundPresetId;
  }

  refreshGlobalLabels();
  refreshPatchForm();
  renderAlgorithmSummary();
  renderSequencer();
  refreshNoteInspector();
  applyFxState();
  sendPatchToAudio();
  if (persist) persistProject();
}

function saveProjectToFile() {
  const data = JSON.stringify(serializeProject(), null, 2);
  const blob = new Blob([data], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = 'fm-workstation-project.json';
  link.click();
  URL.revokeObjectURL(url);
}

async function onLoadProjectFile(event) {
  const file = event.target.files?.[0];
  if (!file) return;
  try {
    const text = await file.text();
    const data = JSON.parse(text);
    applyProjectData(data, true);
    setStatus(`Project loaded: ${file.name}`);
  } catch (error) {
    console.error(error);
    setStatus('Invalid project file');
  } finally {
    dom.projectFileInput.value = '';
  }
}

function centerRoll() {
  const middleNoteRow = noteToRow(64);
  dom.rollViewport.scrollTop = Math.max(0, middleNoteRow * CELL_H - 8 * CELL_H);
  if (state.labelsInner) {
    state.labelsInner.style.transform = `translateY(${-dom.rollViewport.scrollTop}px)`;
  }
}

function boot() {
  populateSelects();
  bindGlobalControls();
  bindSequencerEvents();
  refreshGlobalLabels();

  const restored = restoreProjectFromStorage();
  if (!restored) {
    dom.soundPresetSelect.value = 'epiano';
    refreshPatchForm();
    renderAlgorithmSummary();
    renderSequencer();
    refreshNoteInspector();
  }
  centerRoll();
  updatePlayhead();

  window.addEventListener('keydown', handleKeyboardDown);
  window.addEventListener('keyup', handleKeyboardUp);

  setStatus('Ready — Start Audio で初期化');
}

boot();
