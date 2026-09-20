import test from 'node:test';
import assert from 'node:assert/strict';
import {
  createProject,
  addTrack,
  canonicalJson,
  loadProject,
  buildMixPlan
} from '../src/mixer-core.mjs';
import {
  placementFromAudioFabricMusicReceipt,
  sourceFromAudioFabricMusicReceipt,
  validateAudioFabricMusicReceipt,
  validateAudioFabricRenderSource
} from '../src/audio-fabric-source.mjs';
import { placeAudioFabricMusicRender } from '../src/audio-fabric-placement.mjs';

const ACCEPTED_PLAN_SHA256 = '4640d35f86c03137beb0bbada9e9525fb5e20c6f361a134bbe06c96398d049ef';
const ACCEPTED_ARTIFACT_SHA256 = '3211f29d357255f67f6cdf835b3c12ad625b375d54b58bcc3232c00a819f3e2f';
const RECEIPT_REF = 'actions/35496206944/music-maker-audio-fabric-proof-35496206944/render-first.receipt.json';

function acceptedReceiptShape() {
  return {
    schema: 'axm.audio-music-render-receipt/v1',
    music_plan_sha256: ACCEPTED_PLAN_SHA256,
    project_id: 'three-state-proof',
    project_sha256: null,
    state_id: 'exploration',
    section_id: 'exploration-section',
    rendered_artifact: {
      kind: 'audio/wav-pcm16-stereo',
      id: `sha256:${ACCEPTED_ARTIFACT_SHA256}`,
      content_sha256: ACCEPTED_ARTIFACT_SHA256,
      sample_rate: 44100,
      channels: 2,
      frames: 103360,
      duration_seconds: 103360 / 44100
    }
  };
}

test('accepted Audio Fabric artifact becomes an explicit grounded Mixer source', () => {
  const receipt = acceptedReceiptShape();
  validateAudioFabricMusicReceipt(receipt);
  const source = sourceFromAudioFabricMusicReceipt(receipt, { receiptRef: RECEIPT_REF });
  assert.equal(source.kind, 'audio-fabric-render');
  assert.equal(source.ref, `sha256:${ACCEPTED_ARTIFACT_SHA256}`);
  assert.equal(source.provenance.receiptSchema, 'axm.audio-music-render-receipt/v1');
  assert.equal(source.provenance.receiptRef, RECEIPT_REF);
  assert.equal(source.provenance.musicPlanSha256, ACCEPTED_PLAN_SHA256);
  assert.equal(source.provenance.projectId, 'three-state-proof');
  assert.equal(source.provenance.stateId, 'exploration');
  assert.equal(source.provenance.artifact.frames, 103360);
  validateAudioFabricRenderSource(source);
});

test('grounded Audio Fabric placement survives canonical save/reopen and mix-plan replay', () => {
  const receipt = acceptedReceiptShape();
  let project = createProject({ id: 'accepted-audio-proof', title: 'Accepted Audio Proof', sampleRate: 48000 });
  project = addTrack(project, { id: 'music', name: 'Music' });
  project = placeAudioFabricMusicRender(project, 'music', receipt, {
    id: 'exploration-render',
    receiptRef: RECEIPT_REF,
    startMs: 250,
    gain: 0.8,
    fadeInMs: 20,
    fadeOutMs: 20
  });

  const encoded = canonicalJson(project);
  const reopened = loadProject(encoded);
  assert.equal(canonicalJson(reopened), encoded);

  const firstPlan = buildMixPlan(project);
  const reopenedPlan = buildMixPlan(reopened);
  assert.deepEqual(reopenedPlan, firstPlan);
  assert.equal(firstPlan.events.length, 1);
  assert.equal(firstPlan.events[0].source.ref, `sha256:${ACCEPTED_ARTIFACT_SHA256}`);
  assert.equal(firstPlan.events[0].source.provenance.musicPlanSha256, ACCEPTED_PLAN_SHA256);
  assert.equal(firstPlan.events[0].source.provenance.receiptRef, RECEIPT_REF);
  assert.equal(firstPlan.events[0].durationMs, 2343.764172336);
  validateAudioFabricRenderSource(firstPlan.events[0].source);
});

test('receipt adapter rejects mismatched artifact identity and impossible duration metadata', () => {
  const mismatchedIdentity = acceptedReceiptShape();
  mismatchedIdentity.rendered_artifact.id = `sha256:${'0'.repeat(64)}`;
  assert.throws(() => sourceFromAudioFabricMusicReceipt(mismatchedIdentity), /must match content_sha256/);

  const mismatchedDuration = acceptedReceiptShape();
  mismatchedDuration.rendered_artifact.duration_seconds = 99;
  assert.throws(() => placementFromAudioFabricMusicReceipt(mismatchedDuration, { id: 'bad' }), /disagrees with frames\/sample_rate/);
});

test('non-looping grounded placement cannot silently overrun its rendered artifact', () => {
  const receipt = acceptedReceiptShape();
  assert.throws(() => placementFromAudioFabricMusicReceipt(receipt, {
    id: 'too-long',
    sourceOffsetMs: 1000,
    durationMs: 2000,
    loop: false
  }), /cannot extend beyond/);

  const looped = placementFromAudioFabricMusicReceipt(receipt, {
    id: 'looped',
    sourceOffsetMs: 1000,
    durationMs: 4000,
    loop: true
  });
  assert.equal(looped.loop, true);
  assert.equal(looped.durationMs, 4000);
});
