import test from 'node:test';
import assert from 'node:assert/strict';
import {
  createProject, addTrack, placeClip, movePlacement, trimPlacement, setLoop,
  setFades, setTrackMix, addAutomation, canonicalJson, loadProject, buildMixPlan, validateProject
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

test('invalid numeric project state is rejected before cloning or serialization', () => {
  for (const key of ['startMs', 'sourceOffsetMs', 'durationMs', 'fadeInMs', 'fadeOutMs', 'gain']) {
    for (const value of [NaN, Infinity, -Infinity, null]) {
      const project = baseProject();
      project.tracks[0].placements[0][key] = value;
      for (const action of [validateProject, canonicalJson, buildMixPlan, p => addTrack(p, { id: 'extra' })]) {
        assert.throws(() => action(project), TypeError, `${key}=${value}`);
      }
      assert.ok(Object.is(project.tracks[0].placements[0][key], value));
    }
  }
});

test('saved placements require their canonical schema and explicit fields', () => {
  for (const key of ['schema', 'startMs', 'sourceOffsetMs', 'durationMs', 'loop', 'fadeInMs', 'fadeOutMs', 'gain']) {
    const project = baseProject();
    delete project.tracks[0].placements[0][key];
    assert.throws(() => loadProject(JSON.stringify(project)), TypeError, key);
  }
  const project = baseProject();
  project.tracks[0].placements[0].loop = 'false';
  assert.throws(() => loadProject(JSON.stringify(project)), TypeError);
});

test('saved automation validates values and unique identities', () => {
  const project = addAutomation(baseProject(), { id: 'a', target: 'track:music:gain', points: [{ timeMs: 0, value: 1 }] });
  for (const point of [{ timeMs: -1, value: 1 }, { timeMs: 0, value: 'loud' }, { timeMs: null, value: 1 }]) {
    const bad = structuredClone(project);
    bad.automation[0].points = [point];
    assert.throws(() => loadProject(JSON.stringify(bad)), TypeError);
  }
  project.automation.push(structuredClone(project.automation[0]));
  assert.throws(() => validateProject(project), /duplicate automation/);
});

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
