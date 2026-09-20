export const DEFAULT_SNAP_STEP_MS = 100;

function assertFiniteNonNegative(value, name) {
  if (!Number.isFinite(value) || value < 0) {
    throw new TypeError(`${name} must be a finite number >= 0`);
  }
}

export function normalizeSnapSettings({ enabled = true, stepMs = DEFAULT_SNAP_STEP_MS } = {}) {
  if (typeof enabled !== 'boolean') throw new TypeError('snap enabled must be boolean');
  if (!Number.isFinite(stepMs) || stepMs <= 0) throw new TypeError('snap stepMs must be a finite number > 0');
  return { enabled, stepMs };
}

export function snapTimeMs(timeMs, settings = {}) {
  assertFiniteNonNegative(timeMs, 'timeMs');
  const { enabled, stepMs } = normalizeSnapSettings(settings);
  if (!enabled) return timeMs;
  return Math.max(0, Math.round(timeMs / stepMs) * stepMs);
}
