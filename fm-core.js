const TWO_PI = Math.PI * 2;
const MIN_TIME = 1e-5;

export function clamp(value, min, max) {
  return Math.min(max, Math.max(min, value));
}

export function midiToFreq(midi) {
  return 440 * Math.pow(2, (midi - 69) / 12);
}

export function makeDefaultPatch() {
  const operators = Array.from({ length: 6 }, (_, index) => ({
    ratio: index === 0 ? 1 : index + 1,
    detune: 0,
    level: index === 0 ? 0.9 : 0.35,
    output: index === 0 ? 1 : 0,
    feedback: 0,
    attack: 0.01,
    decay: 0.18,
    sustain: 0.7,
    release: 0.25,
  }));

  const matrix = Array.from({ length: 6 }, () => Array(6).fill(0));
  matrix[0][1] = 2.5;
  matrix[1][2] = 1.8;
  matrix[2][3] = 1.1;
  matrix[3][4] = 0.6;
  matrix[4][5] = 0.4;

  return { operators, matrix, outputGain: 0.32 };
}

export function normalizePatch(raw) {
  const fallback = makeDefaultPatch();
  const operators = Array.from({ length: 6 }, (_, opIndex) => {
    const src = raw?.operators?.[opIndex] || fallback.operators[opIndex];
    return {
      ratio: clamp(Number(src.ratio) || 0.001, 0.001, 32),
      detune: clamp(Number(src.detune) || 0, -1200, 1200),
      level: clamp(Number(src.level) || 0, 0, 1.5),
      output: clamp(Number(src.output) || 0, 0, 1.5),
      feedback: clamp(Number(src.feedback) || 0, 0, 12),
      attack: clamp(Number(src.attack) || 0.001, 0.0001, 8),
      decay: clamp(Number(src.decay) || 0.01, 0.0001, 8),
      sustain: clamp(Number(src.sustain) || 0, 0, 1),
      release: clamp(Number(src.release) || 0.01, 0.0001, 12),
    };
  });

  const matrix = Array.from({ length: 6 }, (_, row) => {
    return Array.from({ length: 6 }, (_, col) => {
      if (row === col) return operators[row].feedback;
      const rawValue = raw?.matrix?.[row]?.[col] ?? fallback.matrix[row][col] ?? 0;
      return clamp(Number(rawValue) || 0, -12, 12);
    });
  });

  return {
    operators,
    matrix,
    outputGain: clamp(Number(raw?.outputGain) || fallback.outputGain, 0.01, 1.5),
  };
}

export class ADSREnvelope {
  constructor(sampleRate) {
    this.sampleRate = sampleRate;
    this.reset();
  }

  reset() {
    this.state = 'idle';
    this.level = 0;
    this.attackStep = 0;
    this.decayStep = 0;
    this.releaseStep = 0;
    this.targetSustain = 0;
  }

  noteOn(op) {
    this.state = 'attack';
    this.targetSustain = op.sustain;
    this.attackStep = op.attack <= MIN_TIME ? 1 : 1 / (op.attack * this.sampleRate);
    this.decayStep = op.decay <= MIN_TIME ? 1 : (1 - op.sustain) / (op.decay * this.sampleRate);
    this.releaseStep = 0;
  }

  noteOff(op) {
    if (this.state === 'idle') return;
    this.state = 'release';
    this.releaseStep = op.release <= MIN_TIME ? 1 : Math.max(this.level, MIN_TIME) / (op.release * this.sampleRate);
  }

  next(op) {
    switch (this.state) {
      case 'attack':
        this.level += this.attackStep;
        if (this.level >= 1) {
          this.level = 1;
          this.state = 'decay';
        }
        break;
      case 'decay':
        this.level -= this.decayStep;
        if (this.level <= op.sustain) {
          this.level = op.sustain;
          this.state = 'sustain';
        }
        break;
      case 'sustain':
        this.level = op.sustain;
        break;
      case 'release':
        this.level -= this.releaseStep;
        if (this.level <= 0.00001) {
          this.level = 0;
          this.state = 'idle';
        }
        break;
      default:
        this.level = 0;
        break;
    }
    return this.level;
  }

  isActive() {
    return this.state !== 'idle';
  }
}

export class Voice {
  constructor(sampleRate, operatorCount) {
    this.sampleRate = sampleRate;
    this.operatorCount = operatorCount;
    this.envs = Array.from({ length: operatorCount }, () => new ADSREnvelope(sampleRate));
    this.prevOutputs = new Float32Array(operatorCount);
    this.currOutputs = new Float32Array(operatorCount);
    this.phases = new Float32Array(operatorCount);
    this.reset();
  }

  reset() {
    this.active = false;
    this.noteId = null;
    this.midiNote = -1;
    this.frequency = 0;
    this.velocity = 0;
    this.age = 0;
    for (let i = 0; i < this.operatorCount; i += 1) {
      this.prevOutputs[i] = 0;
      this.currOutputs[i] = 0;
      this.phases[i] = 0;
      this.envs[i].reset();
    }
  }

  start(noteId, midiNote, frequency, velocity, patch, age) {
    this.active = true;
    this.noteId = noteId;
    this.midiNote = midiNote;
    this.frequency = frequency;
    this.velocity = clamp(velocity, 0, 1);
    this.age = age;
    for (let i = 0; i < this.operatorCount; i += 1) {
      this.phases[i] = 0;
      this.prevOutputs[i] = 0;
      this.currOutputs[i] = 0;
      this.envs[i].noteOn(patch.operators[i]);
    }
  }

  release(noteId, patch) {
    if (!this.active) return false;
    if (noteId != null && this.noteId !== noteId) return false;
    for (let i = 0; i < this.operatorCount; i += 1) {
      this.envs[i].noteOff(patch.operators[i]);
    }
    return true;
  }

  forceRelease(patch) {
    if (!this.active) return;
    for (let i = 0; i < this.operatorCount; i += 1) {
      this.envs[i].noteOff(patch.operators[i]);
    }
  }

  hardStop() {
    this.reset();
  }

  getActivityScore() {
    if (!this.active) return -1;
    let maxLevel = 0;
    for (let i = 0; i < this.operatorCount; i += 1) {
      maxLevel = Math.max(maxLevel, this.envs[i].level);
    }
    return maxLevel;
  }

  render(patch) {
    if (!this.active) return 0;
    let mixed = 0;
    let voiceIsAlive = false;

    for (let opIndex = 0; opIndex < this.operatorCount; opIndex += 1) {
      const op = patch.operators[opIndex];
      const env = this.envs[opIndex].next(op);
      voiceIsAlive = voiceIsAlive || this.envs[opIndex].isActive();

      const opFreq = this.frequency * op.ratio * Math.pow(2, op.detune / 1200);
      const phaseInc = TWO_PI * opFreq / this.sampleRate;

      let modulation = 0;
      for (let source = 0; source < this.operatorCount; source += 1) {
        modulation += this.prevOutputs[source] * patch.matrix[opIndex][source];
      }

      let nextPhase = this.phases[opIndex] + phaseInc;
      if (nextPhase >= TWO_PI) {
        nextPhase -= TWO_PI * Math.floor(nextPhase / TWO_PI);
      }

      const opOutput = Math.sin(nextPhase + modulation) * op.level * env * this.velocity;
      this.currOutputs[opIndex] = opOutput;
      mixed += opOutput * op.output;
      this.phases[opIndex] = nextPhase;
    }

    for (let i = 0; i < this.operatorCount; i += 1) {
      this.prevOutputs[i] = this.currOutputs[i];
    }

    if (!voiceIsAlive) {
      this.reset();
      return 0;
    }

    return mixed * patch.outputGain;
  }
}

export class FMSynthEngine {
  constructor({ sampleRate, polyphony = 12, patch } = {}) {
    this.sampleRate = sampleRate;
    this.polyphony = Number.isFinite(polyphony) ? polyphony : 12;
    this.patch = normalizePatch(patch);
    this.operatorCount = this.patch.operators.length;
    this.voices = Array.from({ length: this.polyphony }, () => new Voice(sampleRate, this.operatorCount));
    this.voiceAgeCounter = 1;
  }

  setPatch(patch) {
    this.patch = normalizePatch(patch);
  }

  noteOn(event) {
    const midiNote = Number.isFinite(event?.midiNote) ? event.midiNote : 60;
    const frequency = Number.isFinite(event?.frequency) ? event.frequency : midiToFreq(midiNote);
    const velocity = Number.isFinite(event?.velocity) ? event.velocity : 0.8;
    let voice = this.voices.find((candidate) => !candidate.active);
    if (!voice) {
      voice = this.findStealVoice();
    }
    voice.start(event?.noteId ?? null, midiNote, frequency, velocity, this.patch, this.voiceAgeCounter++);
  }

  noteOff(event) {
    if (event?.noteId != null) {
      for (const voice of this.voices) {
        if (voice.release(event.noteId, this.patch)) return;
      }
    }

    const midiNote = Number.isFinite(event?.midiNote) ? event.midiNote : 60;
    for (const voice of this.voices) {
      if (voice.active && voice.midiNote === midiNote) {
        voice.release(null, this.patch);
      }
    }
  }

  allNotesOff() {
    for (const voice of this.voices) {
      voice.forceRelease(this.patch);
    }
  }

  panic() {
    for (const voice of this.voices) {
      voice.hardStop();
    }
  }

  findStealVoice() {
    let candidate = this.voices[0];
    let candidateScore = Number.POSITIVE_INFINITY;
    for (const voice of this.voices) {
      const activity = voice.getActivityScore();
      const score = activity + voice.age * 1e-6;
      if (score < candidateScore) {
        candidate = voice;
        candidateScore = score;
      }
    }
    return candidate;
  }

  renderSample() {
    let mixed = 0;
    for (const voice of this.voices) {
      if (voice.active) mixed += voice.render(this.patch);
    }
    return Math.tanh(mixed * 0.9);
  }
}
