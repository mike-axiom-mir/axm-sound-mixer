import test from 'node:test';
import assert from 'node:assert/strict';
import { DEFAULT_SNAP_STEP_MS, normalizeSnapSettings, snapTimeMs } from '../src/timeline-grid.mjs';

test('timeline snapping defaults to a 100 ms grid', () => {
  assert.equal(DEFAULT_SNAP_STEP_MS, 100);
  assert.deepEqual(normalizeSnapSettings(), { enabled: true, stepMs: 100 });
  assert.equal(snapTimeMs(149), 100);
  assert.equal(snapTimeMs(150), 200);
  assert.equal(snapTimeMs(251), 300);
});

test('disabled snapping preserves the exact requested time', () => {
  assert.equal(snapTimeMs(137, { enabled: false, stepMs: 100 }), 137);
  assert.equal(snapTimeMs(0, { enabled: false }), 0);
});

test('timeline snapping accepts a caller-selected positive grid size', () => {
  assert.equal(snapTimeMs(74, { stepMs: 50 }), 50);
  assert.equal(snapTimeMs(75, { stepMs: 50 }), 100);
});

test('timeline snapping rejects invalid values rather than silently repairing them', () => {
  assert.throws(() => snapTimeMs(-1), /timeMs/);
  assert.throws(() => normalizeSnapSettings({ enabled: 'yes' }), /boolean/);
  assert.throws(() => normalizeSnapSettings({ stepMs: 0 }), /stepMs/);
});
