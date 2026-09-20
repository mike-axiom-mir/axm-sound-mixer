import test from 'node:test';
import assert from 'node:assert/strict';
import {
  createProject, addTrack, placeClip, movePlacement, trimPlacement, setLoop,
  setFades, setTrackMix, addAutomation, canonicalJson, loadProject, buildMixPlan
} from '../src/mixer-core.mjs';

function baseProject() {
  let project = createProject({ id: 'demo', title: 'Demo Mix' });
  project = addTrack(project, { id: 'music', name: 'Music' });
  project = addTrack(project, { id: 'sfx', name: 'SFX' });
  project = placeClip(project, 'music', {
    id: 'explore', source: { kind: 'music-stem', ref: 'music://explore' }, startMs: 0,
    sourceOffsetMs: 0, durationMs: 4000, loop: false, fadeInMs: 100, fadeOutMs: 200, gain: 0.8
  });
  project = placeClip(project, 'sfx', {
    id: 'impact', source: { kind: 'audio-cue', ref: 'audio://impact' }, startMs: 1200,
    sourceOffsetMs: 0, durationMs: 300, loop: false, fadeInMs: 0, fadeOutMs: 50, gain: 1
  });
  return project;
}

test('canonical project round-trips byte-identically', () => {
  const project = baseProject();
  const encoded = canonicalJson(project);
  assert.equal(canonicalJson(loadProject(encoded)), encoded);
});

test('editing operations preserve explicit state and deterministic plan order', () => {
  let project = baseProject();
  project = movePlacement(project, 'impact', 900);
  project = trimPlacement(project, 'explore', { sourceOffsetMs: 250, durationMs: 3500 });
  project = setLoop(project, 'explore', true);
  project = setFades(project, 'explore', { fadeInMs: 50, fadeOutMs: 100 });
  project = setTrackMix(project, 'music', { gain: 0.5, pan: -0.25, solo: true });
  project = addAutomation(project, {
    id: 'duck', target: 'track:music:gain', points: [{ timeMs: 1000, value: 0.5 }, { timeMs: 500, value: 1 }]
  });
  const plan = buildMixPlan(project);
  assert.deepEqual(plan.events.map((event) => event.placementId), ['explore', 'impact']);
  assert.equal(plan.events[0].sourceOffsetMs, 250);
  assert.equal(plan.events[0].durationMs, 3500);
  assert.equal(plan.events[0].loop, true);
  assert.equal(plan.events[0].trackGain, 0.5);
  assert.equal(plan.events[0].pan, -0.25);
  assert.equal(plan.events[0].audible, true);
  assert.equal(plan.events[1].audible, false);
  assert.deepEqual(plan.automation[0].points.map((point) => point.timeMs), [500, 1000]);
});

test('invalid hidden state is rejected instead of normalized silently', () => {
  const project = baseProject();
  assert.throws(() => setFades(project, 'impact', { fadeInMs: 200, fadeOutMs: 200 }), /combined fades/);
  assert.throws(() => placeClip(project, 'sfx', {
    id: 'impact', source: { kind: 'audio-cue', ref: 'audio://other' }, startMs: 0, durationMs: 20
  }), /placement already exists/);
  assert.throws(() => setTrackMix(project, 'music', { pan: 2 }), /between -1 and 1/);
});
