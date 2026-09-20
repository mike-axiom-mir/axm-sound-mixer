import test from 'node:test';
import assert from 'node:assert/strict';
import { createProject, addTrack, placeClip } from '../src/mixer-core.mjs';
import {
  applyEdit, createEditSession, commitEdit, undoEdit, redoEdit, canUndo, canRedo
} from '../src/edit-ops.mjs';

function baseProject() {
  let project = createProject({ id: 'edit-demo', title: 'Edit Demo' });
  project = addTrack(project, { id: 'music', name: 'Music', gain: 1, pan: 0 });
  project = placeClip(project, 'music', {
    id: 'phrase',
    source: { kind: 'music-stem', ref: 'music://phrase' },
    startMs: 0,
    sourceOffsetMs: 0,
    durationMs: 2000,
    loop: false,
    fadeInMs: 0,
    fadeOutMs: 100,
    gain: 1
  });
  return project;
}

function placement(project) { return project.tracks[0].placements[0]; }

test('explicit AI edit applies only against the expected canonical revision', () => {
  const project = baseProject();
  const edit = {
    schema: 'axm.sound-mix-edit/v1',
    id: 'ai-move-1',
    kind: 'placement.patch',
    targetId: 'phrase',
    expectedRevision: project.revision,
    actor: { kind: 'ai', id: 'test-arranger', provenance: { request: 'move phrase later' } },
    reason: 'Move the phrase 500 ms later without regenerating it.',
    patch: { startMs: 500 }
  };
  const result = applyEdit(project, edit);
  assert.equal(placement(result.project).startMs, 500);
  assert.equal(result.receipt.edit.actor.kind, 'ai');
  assert.equal(result.receipt.edit.actor.provenance.request, 'move phrase later');
  assert.equal(result.receipt.beforeRevision, project.revision);
  assert.equal(result.receipt.afterRevision, project.revision + 1);
  assert.equal(result.receipt.inverse.patch.startMs, 0);
  assert.throws(() => applyEdit(result.project, edit), /stale edit revision/);
});

test('undo and redo are explicit compensating edits over canonical state', () => {
  const original = baseProject();
  let session = createEditSession(original);
  session = commitEdit(session, {
    schema: 'axm.sound-mix-edit/v1',
    id: 'human-fade-1',
    kind: 'placement.patch',
    targetId: 'phrase',
    actor: { kind: 'human', id: 'local-user' },
    patch: { fadeInMs: 200, fadeOutMs: 200 }
  });
  assert.equal(placement(session.project).fadeInMs, 200);
  assert.equal(placement(session.project).fadeOutMs, 200);
  assert.equal(canUndo(session), true);
  assert.equal(canRedo(session), false);

  const editedRevision = session.project.revision;
  session = undoEdit(session);
  assert.equal(placement(session.project).fadeInMs, 0);
  assert.equal(placement(session.project).fadeOutMs, 100);
  assert.equal(session.project.revision, editedRevision + 1);
  assert.equal(canUndo(session), false);
  assert.equal(canRedo(session), true);

  session = redoEdit(session);
  assert.equal(placement(session.project).fadeInMs, 200);
  assert.equal(placement(session.project).fadeOutMs, 200);
  assert.equal(canUndo(session), true);
  assert.equal(canRedo(session), false);
});

test('track mix edits are reversible and a new edit clears redo history', () => {
  let session = createEditSession(baseProject());
  session = commitEdit(session, {
    schema: 'axm.sound-mix-edit/v1', id: 'mix-1', kind: 'track.mix', targetId: 'music',
    actor: { kind: 'human', id: 'local-user' }, patch: { gain: 0.5, pan: -0.25, mute: true }
  });
  assert.equal(session.project.tracks[0].gain, 0.5);
  assert.equal(session.project.tracks[0].pan, -0.25);
  assert.equal(session.project.tracks[0].mute, true);

  session = undoEdit(session);
  assert.equal(session.project.tracks[0].gain, 1);
  assert.equal(session.project.tracks[0].pan, 0);
  assert.equal(session.project.tracks[0].mute, false);
  assert.equal(canRedo(session), true);

  session = commitEdit(session, {
    schema: 'axm.sound-mix-edit/v1', id: 'mix-2', kind: 'track.mix', targetId: 'music',
    actor: { kind: 'human', id: 'local-user' }, patch: { solo: true }
  });
  assert.equal(session.project.tracks[0].solo, true);
  assert.equal(canRedo(session), false);
});

test('edit contract rejects hidden scope expansion and malformed actor provenance', () => {
  const project = baseProject();
  assert.throws(() => applyEdit(project, {
    schema: 'axm.sound-mix-edit/v1', id: 'bad-source', kind: 'placement.patch', targetId: 'phrase',
    expectedRevision: project.revision,
    actor: { kind: 'ai', id: 'test-arranger' },
    patch: { source: { kind: 'audio-cue', ref: 'audio://replacement' } }
  }), /unsupported field: source/);
  assert.throws(() => applyEdit(project, {
    schema: 'axm.sound-mix-edit/v1', id: 'bad-actor', kind: 'track.mix', targetId: 'music',
    expectedRevision: project.revision,
    actor: { kind: 'unknown', id: 'mystery' },
    patch: { gain: 0.5 }
  }), /actor.kind/);
});
