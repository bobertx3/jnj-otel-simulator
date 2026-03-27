/**
 * streaming.js — Frontend-driven streaming engine
 */

class StreamingEngine {
  constructor({ onEvent, onError, onStatsUpdate }) {
    this.intervalId = null;
    this.running = false;
    this.onEvent = onEvent || (() => {});
    this.onError = onError || (() => {});
    this.onStatsUpdate = onStatsUpdate || (() => {});
    this.totalEmitted = 0;
    this.startTime = null;
    this._rpsWindow = []; // [{time, count}]
  }

  start(intervalMs = 2000) {
    if (this.running) return;
    this.running = true;
    this.startTime = Date.now();
    this.totalEmitted = 0;
    this._rpsWindow = [];

    this._tick(); // immediate first tick
    this.intervalId = setInterval(() => this._tick(), intervalMs);
    this._updateStats();
  }

  stop() {
    this.running = false;
    if (this.intervalId) {
      clearInterval(this.intervalId);
      this.intervalId = null;
    }
    this._updateStats();
  }

  updateInterval(intervalMs) {
    if (!this.running) return;
    clearInterval(this.intervalId);
    this.intervalId = setInterval(() => this._tick(), intervalMs);
  }

  async _tick() {
    if (!this.running) return;
    try {
      const res = await fetch("/api/emit-random", { method: "POST" });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body.detail || `${res.status}`);
      }
      const data = await res.json();
      this.totalEmitted++;
      this._rpsWindow.push({ time: Date.now(), count: 1 });
      this.onEvent(data);
      this._updateStats();
    } catch (err) {
      this.onError(err.message || "Streaming error");
    }
  }

  _updateStats() {
    const now = Date.now();
    // 10-second window for RPS
    this._rpsWindow = this._rpsWindow.filter((r) => r.time > now - 10000);
    const rps =
      this._rpsWindow.length > 1
        ? this._rpsWindow.length / ((now - this._rpsWindow[0].time) / 1000)
        : 0;
    this.onStatsUpdate({
      running: this.running,
      totalEmitted: this.totalEmitted,
      eventsPerSecond: Math.round(rps * 10) / 10,
      uptimeSeconds: this.startTime ? Math.round((now - this.startTime) / 1000) : 0,
    });
  }
}
