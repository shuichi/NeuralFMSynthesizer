let intervalId = null;
let intervalMs = 25;

function stop() {
  if (intervalId !== null) {
    clearInterval(intervalId);
    intervalId = null;
  }
}

function start() {
  stop();
  intervalId = setInterval(() => {
    postMessage({ type: 'tick', now: performance.now() });
  }, intervalMs);
}

self.onmessage = (event) => {
  const msg = event.data || {};
  switch (msg.type) {
    case 'start':
      if (typeof msg.intervalMs === 'number' && Number.isFinite(msg.intervalMs)) {
        intervalMs = Math.max(5, msg.intervalMs);
      }
      start();
      break;
    case 'stop':
      stop();
      break;
    case 'setInterval':
      if (typeof msg.intervalMs === 'number' && Number.isFinite(msg.intervalMs)) {
        intervalMs = Math.max(5, msg.intervalMs);
        if (intervalId !== null) start();
      }
      break;
    default:
      break;
  }
};
