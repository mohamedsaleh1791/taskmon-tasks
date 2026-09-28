/**
 * Thin logger that forwards messages to a callback (wired to IPC by main.js)
 * as well as the console, so logs show up both in the UI log panel and in
 * dev tools / terminal for debugging.
 */
function createLogger(onLog) {
  return function log(message) {
    const line = `[${new Date().toLocaleTimeString()}] ${message}`;
    console.log(line);
    if (typeof onLog === 'function') {
      onLog(line);
    }
  };
}

module.exports = { createLogger };
