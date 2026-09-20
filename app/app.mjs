import {
  createProject, addTrack, placeClip, canonicalJson, loadProject, buildMixPlan
} from '../src/mixer-core.mjs';
import {
  createEditSession, commitEdit, undoEdit, redoEdit, canUndo, canRedo
} from '../src/edit-ops.mjs';

const PX_PER_MS = 0.1;
let session = createEditSession(makeDemo());
let project = session.project;
let selectedId = null;
let drag = null;
let editCounter = 0;

const timeline = document.querySelector('#timeline');
const io = document.querySelector('#io');
const selection = document.querySelector('#selection');
const startInput = document.querySelector('#start');
const durationInput = document.querySelector('#duration');
const fadeInInput = document.querySelector('#fadeIn');
const fadeOutInput = document.querySelector('#fadeOut');
const loopInput = document.querySelector('#loop');
const undoButton = document.querySelector('#undo');
const redoButton = document.querySelector('#redo');
const historyStatus = document.querySelector('#history-status');

function makeDemo() {
  let p = createProject({ id: 'workspace-demo', title: 'Workspace Demo' });
  p = addTrack(p, { id: 'music', name: 'Music' });
  p = addTrack(p, { id: 'sfx', name: 'SFX' });
  p = placeClip(p, 'music', { id: 'exploration', source: { kind: 'music-stem', ref: 'music://exploration' }, startMs: 0, durationMs: 4000, fadeInMs: 100, fadeOutMs: 200 });
  p = placeClip(p, 'sfx', { id: 'impact', source: { kind: 'audio-cue', ref: 'audio://impact' }, startMs: 1500, durationMs: 500, fadeOutMs: 50 });
  return p;
}

function nextEditId(prefix) { editCounter += 1; return `human:${prefix}:${editCounter}`; }
function commitUserEdit(edit) {
  session = commitEdit(session, {
    schema: 'axm.sound-mix-edit/v1',
    ...edit,
    actor: { kind: 'human', id: 'local-user' }
  });
  project = session.project;
  render();
}
function resetSession(nextProject) {
  project = nextProject;
  session = createEditSession(project);
  selectedId = null;
  drag = null;
  render();
}

function render() {
  timeline.replaceChildren();
  const hasSolo = project.tracks.some((track) => track.solo);
  for (const track of project.tracks) {
    const wrapper = document.createElement('section');
    wrapper.className = 'track';
    const head = document.createElement('div');
    head.className = 'track-head';
    const title = document.createElement('strong');
    title.textContent = track.name;
    const mute = control('Mute', track.mute, () => commitUserEdit({
      id: nextEditId('mute'), kind: 'track.mix', targetId: track.id, patch: { mute: !track.mute }
    }));
    const solo = control('Solo', track.solo, () => commitUserEdit({
      id: nextEditId('solo'), kind: 'track.mix', targetId: track.id, patch: { solo: !track.solo }
    }));
    const gain = document.createElement('input');
    gain.type = 'range'; gain.min = '0'; gain.max = '2'; gain.step = '0.05'; gain.value = String(track.gain);
    gain.setAttribute('aria-label', `${track.name} gain`);
    gain.addEventListener('change', () => commitUserEdit({
      id: nextEditId('gain'), kind: 'track.mix', targetId: track.id, patch: { gain: Number(gain.value) }
    }));
    head.append(title, mute, solo, gain);
    const lane = document.createElement('div');
    lane.className = 'lane';
    if (track.mute || (hasSolo && !track.solo)) lane.classList.add('muted');
    for (const placement of track.placements) lane.append(makeClip(placement));
    wrapper.append(head, lane);
    timeline.append(wrapper);
  }
  updateInspector();
  undoButton.disabled = !canUndo(session);
  redoButton.disabled = !canRedo(session);
  historyStatus.textContent = `Project revision ${project.revision}. Undo/redo are explicit compensating edits; opening a project starts a fresh local edit history.`;
}

function control(label, active, handler) {
  const button = document.createElement('button');
  button.textContent = active ? `${label}: on` : `${label}: off`;
  button.setAttribute('aria-pressed', String(active));
  button.addEventListener('click', handler);
  return button;
}

function makeClip(placement) {
  const clip = document.createElement('button');
  clip.className = 'clip';
  clip.dataset.id = placement.id;
  clip.style.left = `${placement.startMs * PX_PER_MS}px`;
  clip.style.width = `${Math.max(placement.durationMs * PX_PER_MS, 20)}px`;
  clip.textContent = `${placement.id}${placement.loop ? ' ↻' : ''}`;
  clip.title = `${placement.source.kind}: ${placement.source.ref}`;
  clip.addEventListener('click', () => { selectedId = placement.id; updateInspector(); });
  clip.addEventListener('pointerdown', (event) => {
    selectedId = placement.id;
    drag = { id: placement.id, pointerX: event.clientX, startMs: placement.startMs };
    clip.setPointerCapture(event.pointerId);
  });
  clip.addEventListener('pointermove', (event) => {
    if (!drag || drag.id !== placement.id) return;
    const deltaMs = Math.round((event.clientX - drag.pointerX) / PX_PER_MS / 100) * 100;
    clip.style.left = `${Math.max(0, drag.startMs + deltaMs) * PX_PER_MS}px`;
  });
  clip.addEventListener('pointerup', (event) => {
    if (!drag || drag.id !== placement.id) return;
    const deltaMs = Math.round((event.clientX - drag.pointerX) / PX_PER_MS / 100) * 100;
    const startMs = Math.max(0, drag.startMs + deltaMs);
    drag = null;
    if (startMs === placement.startMs) { render(); return; }
    commitUserEdit({
      id: nextEditId('drag'), kind: 'placement.patch', targetId: placement.id, patch: { startMs }
    });
  });
  return clip;
}

function findSelected() {
  for (const track of project.tracks) {
    const placement = track.placements.find((candidate) => candidate.id === selectedId);
    if (placement) return placement;
  }
  return null;
}

function updateInspector() {
  const placement = findSelected();
  if (!placement) { selection.textContent = 'Nothing selected.'; return; }
  selection.textContent = `${placement.id} — ${placement.source.kind} — ${placement.source.ref}`;
  startInput.value = placement.startMs;
  durationInput.value = placement.durationMs;
  fadeInInput.value = placement.fadeInMs;
  fadeOutInput.value = placement.fadeOutMs;
  loopInput.checked = placement.loop;
}

document.querySelector('#apply').addEventListener('click', () => {
  if (!selectedId) return;
  commitUserEdit({
    id: nextEditId('clip'), kind: 'placement.patch', targetId: selectedId,
    patch: {
      startMs: Number(startInput.value), durationMs: Number(durationInput.value),
      fadeInMs: Number(fadeInInput.value), fadeOutMs: Number(fadeOutInput.value), loop: loopInput.checked
    }
  });
});
document.querySelector('#new').addEventListener('click', () => resetSession(makeDemo()));
document.querySelector('#save').addEventListener('click', () => { io.value = canonicalJson(project); });
document.querySelector('#open').addEventListener('click', () => resetSession(loadProject(io.value)));
document.querySelector('#plan').addEventListener('click', () => { io.value = `${JSON.stringify(buildMixPlan(project), null, 2)}\n`; });
undoButton.addEventListener('click', () => {
  if (!canUndo(session)) return;
  session = undoEdit(session); project = session.project; render();
});
redoButton.addEventListener('click', () => {
  if (!canRedo(session)) return;
  session = redoEdit(session); project = session.project; render();
});
document.addEventListener('keydown', (event) => {
  if (!(event.ctrlKey || event.metaKey) || event.key.toLowerCase() !== 'z') return;
  if (event.target instanceof HTMLInputElement || event.target instanceof HTMLTextAreaElement) return;
  if (event.shiftKey) {
    if (!canRedo(session)) return;
    event.preventDefault();
    session = redoEdit(session); project = session.project; render();
  } else {
    if (!canUndo(session)) return;
    event.preventDefault();
    session = undoEdit(session); project = session.project; render();
  }
});

render();
