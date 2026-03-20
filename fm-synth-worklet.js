import { FMSynthEngine, midiToFreq } from './fm-core.js';

class FMSynthProcessor extends AudioWorkletProcessor {
  constructor(options) {
    super();
    const polyphony = options?.processorOptions?.polyphony;
    this.engine = new FMSynthEngine({
      sampleRate,
      polyphony,
      patch: options?.processorOptions?.patch,
    });
    this.eventQueue = [];

    this.port.onmessage = (event) => {
      const msg = event.data || {};
      switch (msg.type) {
        case 'setPatch':
          this.engine.setPatch(msg.patch);
          break;
        case 'noteOn':
        case 'noteOff':
          this.insertEvent(msg);
          break;
        case 'allNotesOff':
          this.eventQueue.length = 0;
          this.engine.allNotesOff();
          break;
        case 'panic':
          this.eventQueue.length = 0;
          this.engine.panic();
          break;
        default:
          break;
      }
    };
  }

  insertEvent(event) {
    const evt = {
      type: event.type,
      time: Number.isFinite(event.time) ? event.time : currentTime,
      noteId: event.noteId ?? null,
      midiNote: Number.isFinite(event.midiNote) ? event.midiNote : 60,
      velocity: Number.isFinite(event.velocity) ? event.velocity : 0.8,
      frequency: Number.isFinite(event.frequency) ? event.frequency : midiToFreq(event.midiNote ?? 60),
    };
    this.eventQueue.push(evt);
    this.eventQueue.sort((a, b) => a.time - b.time);
  }

  dispatchEventsUntil(sampleTime) {
    while (this.eventQueue.length && this.eventQueue[0].time <= sampleTime + 1e-8) {
      const event = this.eventQueue.shift();
      if (event.type === 'noteOn') {
        this.engine.noteOn(event);
      } else if (event.type === 'noteOff') {
        this.engine.noteOff(event);
      }
    }
  }

  process(_inputs, outputs) {
    const output = outputs[0];
    const left = output[0];
    const right = output[1] || output[0];

    for (let i = 0; i < left.length; i += 1) {
      const sampleTime = currentTime + i / sampleRate;
      this.dispatchEventsUntil(sampleTime);

      const out = this.engine.renderSample();
      left[i] = out;
      if (right !== left) right[i] = out;
    }

    return true;
  }
}

registerProcessor('fm-synth-processor', FMSynthProcessor);
