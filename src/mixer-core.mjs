const PROJECT_SCHEMA = 'axm.sound-mix-project/v1';
const TRACK_SCHEMA = 'axm.audio-track/v1';
const PLACEMENT_SCHEMA = 'axm.audio-placement/v1';
const AUTOMATION_SCHEMA = 'axm.mix-automation/v1';

function assertFiniteNonNegative(value, name) {
  if (!Number.isFinite(value) || value < 0) throw new TypeError(`${name} must be a finite number >= 0`);
}
function assertFinite(value, name) {
  if (!Number.isFinite(value)) throw new TypeError(`${name} must be finite`);
}
function assertId(value, name) {
  if (typeof value !== 'string' || value.trim() === '') throw new TypeError(`${name} must be a non-empty string`);
}
function deepClone(value) { return JSON.parse(JSON.stringify(value)); }
function stable(value) {
  if (Array.isArray(value)) return value.map(stable);
  if (value && typeof value === 'object') {
    return Object.fromEntries(Object.keys(value).sort().map((key) => [key, stable(value[key])]));
  }
  return value;
}
export function canonicalJson(project) { return `${JSON.stringify(stable(validateProject(deepClone(project))), null, 2)}\n`; }

export function createProject({ id = 'mix', title = 'Untitled Mix', sampleRate = 48000 } = {}) {
  assertId(id, 'project id');
  assertId(title, 'project title');
  if (!Number.isInteger(sampleRate) || sampleRate <= 0) throw new TypeError('sampleRate must be a positive integer');
  return {
    schema: PROJECT_SCHEMA,
    id,
    title,
    sampleRate,
    tracks: [],
    automation: [],
    revision: 0
  };
}

export function addTrack(project, { id, name, gain = 1, pan = 0 } = {}) {
  const next = validateProject(deepClone(project));
  assertId(id, 'track id');
  assertId(name ?? id, 'track name');
  assertFinite(gain, 'track gain');
  assertFinite(pan, 'track pan');
  if (gain < 0) throw new TypeError('track gain must be >= 0');
  if (pan < -1 || pan > 1) throw new TypeError('track pan must be between -1 and 1');
  if (next.tracks.some((track) => track.id === id)) throw new Error(`track already exists: ${id}`);
  next.tracks.push({ schema: TRACK_SCHEMA, id, name: name ?? id, gain, pan, mute: false, solo: false, placements: [] });
  return bump(next);
}

export function placeClip(project, trackId, input) {
  const next = validateProject(deepClone(project));
  const track = requireTrack(next, trackId);
  const placement = normalizePlacement(input);
  if (findPlacement(next, placement.id)) throw new Error(`placement already exists: ${placement.id}`);
  track.placements.push(placement);
  sortPlacements(track);
  return bump(next);
}

export function editPlacement(project, placementId, patch) {
  const next = validateProject(deepClone(project));
  const found = requirePlacement(next, placementId);
  const merged = normalizePlacement({ ...found.placement, ...patch, id: found.placement.id, source: patch.source ?? found.placement.source });
  found.track.placements[found.index] = merged;
  sortPlacements(found.track);
  return bump(next);
}

export function movePlacement(project, placementId, startMs) {
  return editPlacement(project, placementId, { startMs });
}
export function trimPlacement(project, placementId, { sourceOffsetMs, durationMs }) {
  return editPlacement(project, placementId, { sourceOffsetMs, durationMs });
}
export function setLoop(project, placementId, loop) { return editPlacement(project, placementId, { loop: Boolean(loop) }); }
export function setFades(project, placementId, { fadeInMs, fadeOutMs }) {
  return editPlacement(project, placementId, { fadeInMs, fadeOutMs });
}

export function setTrackMix(project, trackId, patch = {}) {
  const next = validateProject(deepClone(project));
  const track = requireTrack(next, trackId);
  if ('gain' in patch) { assertFinite(patch.gain, 'track gain'); if (patch.gain < 0) throw new TypeError('track gain must be >= 0'); track.gain = patch.gain; }
  if ('pan' in patch) { assertFinite(patch.pan, 'track pan'); if (patch.pan < -1 || patch.pan > 1) throw new TypeError('track pan must be between -1 and 1'); track.pan = patch.pan; }
  if ('mute' in patch) track.mute = Boolean(patch.mute);
  if ('solo' in patch) track.solo = Boolean(patch.solo);
  return bump(next);
}

export function addAutomation(project, input) {
  const next = validateProject(deepClone(project));
  assertId(input.id, 'automation id');
  assertId(input.target, 'automation target');
  if (!Array.isArray(input.points) || input.points.length === 0) throw new TypeError('automation points must be non-empty');
  const points = input.points.map((p, index) => {
    assertFiniteNonNegative(p.timeMs, `automation point ${index} timeMs`);
    assertFinite(p.value, `automation point ${index} value`);
    return { timeMs: p.timeMs, value: p.value };
  }).sort((a, b) => a.timeMs - b.timeMs || a.value - b.value);
  if (next.automation.some((automation) => automation.id === input.id)) throw new Error(`automation already exists: ${input.id}`);
  next.automation.push({ schema: AUTOMATION_SCHEMA, id: input.id, target: input.target, interpolation: input.interpolation ?? 'linear', points });
  next.automation.sort((a, b) => a.id.localeCompare(b.id));
  return bump(next);
}

export function buildMixPlan(project) {
  const valid = validateProject(deepClone(project));
  const hasSolo = valid.tracks.some((track) => track.solo);
  const events = [];
  for (const track of valid.tracks) {
    const audible = !track.mute && (!hasSolo || track.solo);
    for (const placement of track.placements) {
      events.push({
        placementId: placement.id,
        trackId: track.id,
        source: deepClone(placement.source),
        startMs: placement.startMs,
        sourceOffsetMs: placement.sourceOffsetMs,
        durationMs: placement.durationMs,
        loop: placement.loop,
        fadeInMs: placement.fadeInMs,
        fadeOutMs: placement.fadeOutMs,
        clipGain: placement.gain,
        trackGain: track.gain,
        pan: track.pan,
        audible
      });
    }
  }
  events.sort((a, b) => a.startMs - b.startMs || a.trackId.localeCompare(b.trackId) || a.placementId.localeCompare(b.placementId));
  return {
    schema: 'axm.sound-mix-plan/v1',
    projectId: valid.id,
    projectRevision: valid.revision,
    sampleRate: valid.sampleRate,
    events,
    automation: deepClone(valid.automation)
  };
}

export function validateProject(project) {
  if (!project || project.schema !== PROJECT_SCHEMA) throw new TypeError(`project schema must be ${PROJECT_SCHEMA}`);
  assertId(project.id, 'project id');
  assertId(project.title, 'project title');
  if (!Number.isInteger(project.sampleRate) || project.sampleRate <= 0) throw new TypeError('sampleRate must be a positive integer');
  if (!Number.isInteger(project.revision) || project.revision < 0) throw new TypeError('revision must be a non-negative integer');
  if (!Array.isArray(project.tracks)) throw new TypeError('tracks must be an array');
  if (!Array.isArray(project.automation)) throw new TypeError('automation must be an array');
  const trackIds = new Set();
  const placementIds = new Set();
  for (const track of project.tracks) {
    if (track.schema !== TRACK_SCHEMA) throw new TypeError(`track schema must be ${TRACK_SCHEMA}`);
    assertId(track.id, 'track id');
    assertId(track.name, 'track name');
    if (trackIds.has(track.id)) throw new Error(`duplicate track id: ${track.id}`);
    trackIds.add(track.id);
    assertFinite(track.gain, 'track gain');
    assertFinite(track.pan, 'track pan');
    if (track.gain < 0) throw new TypeError('track gain must be >= 0');
    if (track.pan < -1 || track.pan > 1) throw new TypeError('track pan must be between -1 and 1');
    if (typeof track.mute !== 'boolean' || typeof track.solo !== 'boolean') throw new TypeError('track mute/solo must be boolean');
    if (!Array.isArray(track.placements)) throw new TypeError('track placements must be an array');
    for (const placement of track.placements) {
      const normalized = normalizePlacement(placement);
      if (placementIds.has(normalized.id)) throw new Error(`duplicate placement id: ${normalized.id}`);
      placementIds.add(normalized.id);
    }
  }
  for (const automation of project.automation) {
    if (automation.schema !== AUTOMATION_SCHEMA) throw new TypeError(`automation schema must be ${AUTOMATION_SCHEMA}`);
    assertId(automation.id, 'automation id');
    assertId(automation.target, 'automation target');
    if (!Array.isArray(automation.points) || automation.points.length === 0) throw new TypeError('automation points must be non-empty');
  }
  return project;
}

export function loadProject(json) { return validateProject(JSON.parse(json)); }

function normalizePlacement(input = {}) {
  assertId(input.id, 'placement id');
  if (!input.source || typeof input.source !== 'object') throw new TypeError('placement source must be an object');
  assertId(input.source.kind, 'placement source.kind');
  assertId(input.source.ref, 'placement source.ref');
  const placement = {
    schema: PLACEMENT_SCHEMA,
    id: input.id,
    source: deepClone(input.source),
    startMs: input.startMs ?? 0,
    sourceOffsetMs: input.sourceOffsetMs ?? 0,
    durationMs: input.durationMs,
    loop: Boolean(input.loop),
    fadeInMs: input.fadeInMs ?? 0,
    fadeOutMs: input.fadeOutMs ?? 0,
    gain: input.gain ?? 1
  };
  assertFiniteNonNegative(placement.startMs, 'placement startMs');
  assertFiniteNonNegative(placement.sourceOffsetMs, 'placement sourceOffsetMs');
  assertFiniteNonNegative(placement.durationMs, 'placement durationMs');
  if (placement.durationMs === 0) throw new TypeError('placement durationMs must be > 0');
  assertFiniteNonNegative(placement.fadeInMs, 'placement fadeInMs');
  assertFiniteNonNegative(placement.fadeOutMs, 'placement fadeOutMs');
  assertFinite(placement.gain, 'placement gain');
  if (placement.gain < 0) throw new TypeError('placement gain must be >= 0');
  if (placement.fadeInMs + placement.fadeOutMs > placement.durationMs) throw new RangeError('combined fades cannot exceed placement duration');
  return placement;
}
function bump(project) { project.revision += 1; return project; }
function requireTrack(project, trackId) {
  const track = project.tracks.find((candidate) => candidate.id === trackId);
  if (!track) throw new Error(`unknown track: ${trackId}`);
  return track;
}
function findPlacement(project, placementId) {
  for (const track of project.tracks) {
    const index = track.placements.findIndex((p) => p.id === placementId);
    if (index >= 0) return { track, index, placement: track.placements[index] };
  }
  return null;
}
function requirePlacement(project, placementId) {
  const found = findPlacement(project, placementId);
  if (!found) throw new Error(`unknown placement: ${placementId}`);
  return found;
}
function sortPlacements(track) {
  track.placements.sort((a, b) => a.startMs - b.startMs || a.id.localeCompare(b.id));
}
