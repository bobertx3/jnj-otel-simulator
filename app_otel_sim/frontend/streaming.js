/**
 * streaming.js — Frontend-driven streaming engine (batch mode)
 *
 * Each tick calls /api/emit-batch which returns 5-8 events.
 * Events are fed to the UI one-by-one with a small stagger for visual effect.
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
    this._rpsWindow = [];
    this._inflight = false;
  }

  start(intervalMs = 500) {
    if (this.running) return;
    this.running = true;
    this.startTime = Date.now();
    this.totalEmitted = 0;
    this._rpsWindow = [];
    this._inflight = false;

    this._tick();
    this.intervalId = setInterval(() => this._tick(), intervalMs);
    this._updateStats();
  }

  stop() {
    this.running = false;
    if (this.intervalId) {
      clearInterval(this.intervalId);
      this.intervalId = null;
    }
    this._inflight = false;
    this._updateStats();
  }

  updateInterval(intervalMs) {
    if (!this.running) return;
    clearInterval(this.intervalId);
    this.intervalId = setInterval(() => this._tick(), intervalMs);
  }

  async _tick() {
    if (!this.running || this._inflight) return;
    this._inflight = true;

    try {
      const res = await fetch("/api/emit-batch", { method: "POST" });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body.detail || `${res.status}`);
      }
      const data = await res.json();
      const events = data.events || [];

      // Stagger events into the UI for visual streaming effect
      const staggerMs = events.length > 0 ? Math.min(80, 400 / events.length) : 0;

      events.forEach((evt, i) => {
        setTimeout(() => {
          if (!this.running) return;
          this.totalEmitted++;
          const now = Date.now();
          this._rpsWindow.push({ time: now, count: 1 });
          this.onEvent(evt);
          this._updateStats();
        }, i * staggerMs);
      });
    } catch (err) {
      this.onError(err.message || "Streaming error");
    } finally {
      this._inflight = false;
    }
  }

  _updateStats() {
    const now = Date.now();
    this._rpsWindow = this._rpsWindow.filter((r) => r.time > now - 5000);
    let rps = 0;
    if (this._rpsWindow.length > 1) {
      const elapsed = (now - this._rpsWindow[0].time) / 1000;
      rps = elapsed > 0 ? this._rpsWindow.length / elapsed : 0;
    }
    this.onStatsUpdate({
      running: this.running,
      totalEmitted: this.totalEmitted,
      eventsPerSecond: Math.round(rps * 10) / 10,
      uptimeSeconds: this.startTime ? Math.round((now - this.startTime) / 1000) : 0,
    });
  }
}
