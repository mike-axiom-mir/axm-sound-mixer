export const AUDIO_FABRIC_MUSIC_RECEIPT_SCHEMA = 'axm.audio-music-render-receipt/v1';
export const AUDIO_FABRIC_RENDER_SOURCE_KIND = 'audio-fabric-render';

function assertObject(value, name) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new TypeError(`${name} must be an object`);
}
function assertNonEmptyString(value, name) {
  if (typeof value !== 'string' || value.trim() === '') throw new TypeError(`${name} must be a non-empty string`);
}
function assertSha256(value, name) {
  if (typeof value !== 'string' || !/^[0-9a-f]{64}$/.test(value)) throw new TypeError(`${name} must be a lowercase sha256 hex digest`);
}
function assertPositiveInteger(value, name) {
  if (!Number.isInteger(value) || value <= 0) throw new TypeError(`${name} must be a positive integer`);
}
function assertFinitePositive(value, name) {
  if (!Number.isFinite(value) || value <= 0) throw new TypeError(`${name} must be a finite number > 0`);
}
function roundMilliseconds(value) {
  return Number(value.toFixed(9));
}

export function validateAudioFabricMusicReceipt(receipt) {
  assertObject(receipt, 'Audio Fabric receipt');
  if (receipt.schema !== AUDIO_FABRIC_MUSIC_RECEIPT_SCHEMA) {
    throw new TypeError(`receipt.schema must be ${AUDIO_FABRIC_MUSIC_RECEIPT_SCHEMA}`);
  }
  assertSha256(receipt.music_plan_sha256, 'receipt.music_plan_sha256');
  assertNonEmptyString(receipt.project_id, 'receipt.project_id');
  assertNonEmptyString(receipt.state_id, 'receipt.state_id');

  const artifact = receipt.rendered_artifact;
  assertObject(artifact, 'receipt.rendered_artifact');
  assertNonEmptyString(artifact.kind, 'receipt.rendered_artifact.kind');
  assertSha256(artifact.content_sha256, 'receipt.rendered_artifact.content_sha256');
  if (artifact.id !== `sha256:${artifact.content_sha256}`) {
    throw new TypeError('receipt.rendered_artifact.id must match content_sha256');
  }
  assertPositiveInteger(artifact.sample_rate, 'receipt.rendered_artifact.sample_rate');
  assertPositiveInteger(artifact.channels, 'receipt.rendered_artifact.channels');
  assertPositiveInteger(artifact.frames, 'receipt.rendered_artifact.frames');
  assertFinitePositive(artifact.duration_seconds, 'receipt.rendered_artifact.duration_seconds');

  const derivedSeconds = artifact.frames / artifact.sample_rate;
  const oneSampleSeconds = 1 / artifact.sample_rate;
  if (Math.abs(artifact.duration_seconds - derivedSeconds) > oneSampleSeconds) {
    throw new RangeError('receipt.rendered_artifact.duration_seconds disagrees with frames/sample_rate');
  }
  return receipt;
}

export function validateAudioFabricRenderSource(source) {
  assertObject(source, 'Audio Fabric source');
  if (source.kind !== AUDIO_FABRIC_RENDER_SOURCE_KIND) {
    throw new TypeError(`Audio Fabric source.kind must be ${AUDIO_FABRIC_RENDER_SOURCE_KIND}`);
  }
  assertNonEmptyString(source.ref, 'Audio Fabric source.ref');
  if (!/^sha256:[0-9a-f]{64}$/.test(source.ref)) {
    throw new TypeError('Audio Fabric source.ref must be a content-addressed sha256 artifact id');
  }

  const provenance = source.provenance;
  assertObject(provenance, 'Audio Fabric source.provenance');
  if (provenance.receiptSchema !== AUDIO_FABRIC_MUSIC_RECEIPT_SCHEMA) {
    throw new TypeError(`Audio Fabric source receiptSchema must be ${AUDIO_FABRIC_MUSIC_RECEIPT_SCHEMA}`);
  }
  assertSha256(provenance.musicPlanSha256, 'Audio Fabric source provenance.musicPlanSha256');
  assertNonEmptyString(provenance.projectId, 'Audio Fabric source provenance.projectId');
  assertNonEmptyString(provenance.stateId, 'Audio Fabric source provenance.stateId');
  if ('receiptRef' in provenance && provenance.receiptRef !== null) {
    assertNonEmptyString(provenance.receiptRef, 'Audio Fabric source provenance.receiptRef');
  }

  const artifact = provenance.artifact;
  assertObject(artifact, 'Audio Fabric source provenance.artifact');
  assertNonEmptyString(artifact.kind, 'Audio Fabric source provenance.artifact.kind');
  assertSha256(artifact.contentSha256, 'Audio Fabric source provenance.artifact.contentSha256');
  assertPositiveInteger(artifact.sampleRate, 'Audio Fabric source provenance.artifact.sampleRate');
  assertPositiveInteger(artifact.channels, 'Audio Fabric source provenance.artifact.channels');
  assertPositiveInteger(artifact.frames, 'Audio Fabric source provenance.artifact.frames');
  if (source.ref !== `sha256:${artifact.contentSha256}`) {
    throw new TypeError('Audio Fabric source.ref must match provenance artifact content hash');
  }
  return source;
}

export function sourceFromAudioFabricMusicReceipt(receipt, { receiptRef = null } = {}) {
  validateAudioFabricMusicReceipt(receipt);
  if (receiptRef !== null) assertNonEmptyString(receiptRef, 'receiptRef');
  const artifact = receipt.rendered_artifact;
  return {
    kind: AUDIO_FABRIC_RENDER_SOURCE_KIND,
    ref: artifact.id,
    provenance: {
      receiptSchema: receipt.schema,
      receiptRef,
      musicPlanSha256: receipt.music_plan_sha256,
      projectId: receipt.project_id,
      projectSha256: receipt.project_sha256 ?? null,
      stateId: receipt.state_id,
      sectionId: receipt.section_id ?? null,
      artifact: {
        kind: artifact.kind,
        contentSha256: artifact.content_sha256,
        sampleRate: artifact.sample_rate,
        channels: artifact.channels,
        frames: artifact.frames
      }
    }
  };
}

export function placementFromAudioFabricMusicReceipt(receipt, {
  id,
  receiptRef = null,
  startMs = 0,
  sourceOffsetMs = 0,
  durationMs = null,
  loop = false,
  fadeInMs = 0,
  fadeOutMs = 0,
  gain = 1
} = {}) {
  assertNonEmptyString(id, 'placement id');
  validateAudioFabricMusicReceipt(receipt);
  const artifact = receipt.rendered_artifact;
  const artifactDurationMs = roundMilliseconds(artifact.frames * 1000 / artifact.sample_rate);
  if (!Number.isFinite(sourceOffsetMs) || sourceOffsetMs < 0) throw new TypeError('sourceOffsetMs must be a finite number >= 0');
  if (sourceOffsetMs >= artifactDurationMs) throw new RangeError('sourceOffsetMs must be inside the rendered artifact');
  const resolvedDurationMs = durationMs ?? roundMilliseconds(artifactDurationMs - sourceOffsetMs);
  if (!Number.isFinite(resolvedDurationMs) || resolvedDurationMs <= 0) throw new TypeError('durationMs must be a finite number > 0');
  if (!loop && sourceOffsetMs + resolvedDurationMs > artifactDurationMs + 0.000000001) {
    throw new RangeError('non-looping placement cannot extend beyond the rendered artifact');
  }
  return {
    id,
    source: sourceFromAudioFabricMusicReceipt(receipt, { receiptRef }),
    startMs,
    sourceOffsetMs,
    durationMs: resolvedDurationMs,
    loop: Boolean(loop),
    fadeInMs,
    fadeOutMs,
    gain
  };
}
