import { editPlacement, setTrackMix, validateProject } from './mixer-core.mjs';

const EDIT_SCHEMA = 'axm.sound-mix-edit/v1';
const RECEIPT_SCHEMA = 'axm.sound-mix-edit-receipt/v1';
const SESSION_SCHEMA = 'axm.sound-mix-edit-session/v1';
const ACTOR_KINDS = new Set(['human', 'ai', 'tool', 'system']);
const PLACEMENT_PATCH_KEYS = new Set([
  'startMs', 'sourceOffsetMs', 'durationMs', 'loop', 'fadeInMs', 'fadeOutMs', 'gain'
]);
const TRACK_MIX_PATCH_KEYS = new Set(['gain', 'pan', 'mute', 'solo']);

function clone(value) { return structuredClone(value); }
function assertId(value, name) {
  if (typeof value !== 'string' || value.trim() === '') throw new TypeError(`${name} must be a non-empty string`);
}
function assertPlainObject(value, name) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new TypeError(`${name} must be an object`);
}
function normalizeActor(actor) {
  if (actor === undefined) return undefined;
  assertPlainObject(actor, 'edit actor');
  if (!ACTOR_KINDS.has(actor.kind)) throw new TypeError('edit actor.kind must be human, ai, tool, or system');
  assertId(actor.id, 'edit actor.id');
  const normalized = { kind: actor.kind, id: actor.id };
  if (actor.provenance !== undefined) normalized.provenance = clone(actor.provenance);
  return normalized;
}
function normalizePatch(patch, allowed, name) {
  assertPlainObject(patch, name);
  const keys = Object.keys(patch);
  if (keys.length === 0) throw new TypeError(`${name} must contain at least one field`);
  for (const key of keys) {
    if (!allowed.has(key)) throw new TypeError(`${name} contains unsupported field: ${key}`);
  }
  return clone(patch);
}
function normalizeEdit(edit) {
  assertPlainObject(edit, 'edit');
  if (edit.schema !== EDIT_SCHEMA) throw new TypeError(`edit schema must be ${EDIT_SCHEMA}`);
  assertId(edit.id, 'edit id');
  assertId(edit.targetId, 'edit targetId');
  if (!Number.isInteger(edit.expectedRevision) || edit.expectedRevision < 0) {
    throw new TypeError('edit expectedRevision must be a non-negative integer');
  }
  const normalized = {
    schema: EDIT_SCHEMA,
    id: edit.id,
    kind: edit.kind,
    targetId: edit.targetId,
    expectedRevision: edit.expectedRevision
  };
  const actor = normalizeActor(edit.actor);
  if (actor) normalized.actor = actor;
  if (edit.reason !== undefined) {
    if (typeof edit.reason !== 'string') throw new TypeError('edit reason must be a string');
    normalized.reason = edit.reason;
  }
  if (edit.kind === 'placement.patch') {
    normalized.patch = normalizePatch(edit.patch, PLACEMENT_PATCH_KEYS, 'placement patch');
  } else if (edit.kind === 'track.mix') {
    normalized.patch = normalizePatch(edit.patch, TRACK_MIX_PATCH_KEYS, 'track mix patch');
  } else {
    throw new TypeError(`unsupported edit kind: ${edit.kind}`);
  }
  return normalized;
}
function findPlacement(project, placementId) {
  for (const track of project.tracks) {
    const placement = track.placements.find((candidate) => candidate.id === placementId);
    if (placement) return placement;
  }
  throw new Error(`unknown placement: ${placementId}`);
}
function findTrack(project, trackId) {
  const track = project.tracks.find((candidate) => candidate.id === trackId);
  if (!track) throw new Error(`unknown track: ${trackId}`);
  return track;
}
function inversePatch(before, patch) {
  return Object.fromEntries(Object.keys(patch).map((key) => [key, clone(before[key])]));
}
function inverseEdit(edit, patch, expectedRevision) {
  return {
    schema: EDIT_SCHEMA,
    id: `inverse:${edit.id}:${expectedRevision}`,
    kind: edit.kind,
    targetId: edit.targetId,
    patch,
    expectedRevision,
    actor: { kind: 'tool', id: 'axm-sound-mixer:undo' },
    reason: `Compensating edit for ${edit.id}`
  };
}

export function applyEdit(project, inputEdit) {
  const current = validateProject(clone(project));
  const edit = normalizeEdit(inputEdit);
  if (edit.expectedRevision !== current.revision) {
    throw new Error(`stale edit revision: expected ${edit.expectedRevision}, current ${current.revision}`);
  }

  let next;
  let inverse;
  if (edit.kind === 'placement.patch') {
    const before = findPlacement(current, edit.targetId);
    inverse = inverseEdit(edit, inversePatch(before, edit.patch), current.revision + 1);
    next = editPlacement(current, edit.targetId, edit.patch);
  } else {
    const before = findTrack(current, edit.targetId);
    inverse = inverseEdit(edit, inversePatch(before, edit.patch), current.revision + 1);
    next = setTrackMix(current, edit.targetId, edit.patch);
  }

  return {
    project: next,
    receipt: {
      schema: RECEIPT_SCHEMA,
      edit,
      beforeRevision: current.revision,
      afterRevision: next.revision,
      inverse
    }
  };
}

export function createEditSession(project) {
  return {
    schema: SESSION_SCHEMA,
    project: validateProject(clone(project)),
    undo: [],
    redo: []
  };
}

function validateSession(session) {
  assertPlainObject(session, 'edit session');
  if (session.schema !== SESSION_SCHEMA) throw new TypeError(`edit session schema must be ${SESSION_SCHEMA}`);
  if (!Array.isArray(session.undo) || !Array.isArray(session.redo)) throw new TypeError('edit session undo/redo must be arrays');
  validateProject(session.project);
  return session;
}

export function commitEdit(session, inputEdit) {
  const current = validateSession(clone(session));
  const edit = clone(inputEdit);
  if (edit.expectedRevision === undefined) edit.expectedRevision = current.project.revision;
  const result = applyEdit(current.project, edit);
  return {
    schema: SESSION_SCHEMA,
    project: result.project,
    undo: [...current.undo, result.receipt.inverse],
    redo: []
  };
}

export function undoEdit(session) {
  const current = validateSession(clone(session));
  if (current.undo.length === 0) throw new Error('nothing to undo');
  const operation = current.undo.at(-1);
  operation.expectedRevision = current.project.revision;
  const result = applyEdit(current.project, operation);
  return {
    schema: SESSION_SCHEMA,
    project: result.project,
    undo: current.undo.slice(0, -1),
    redo: [...current.redo, result.receipt.inverse]
  };
}

export function redoEdit(session) {
  const current = validateSession(clone(session));
  if (current.redo.length === 0) throw new Error('nothing to redo');
  const operation = current.redo.at(-1);
  operation.expectedRevision = current.project.revision;
  const result = applyEdit(current.project, operation);
  return {
    schema: SESSION_SCHEMA,
    project: result.project,
    undo: [...current.undo, result.receipt.inverse],
    redo: current.redo.slice(0, -1)
  };
}

export function canUndo(session) { return validateSession(session).undo.length > 0; }
export function canRedo(session) { return validateSession(session).redo.length > 0; }

export const editSchemas = Object.freeze({ edit: EDIT_SCHEMA, receipt: RECEIPT_SCHEMA, session: SESSION_SCHEMA });
