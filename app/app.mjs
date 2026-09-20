import {
  createProject, addTrack, placeClip, movePlacement, editPlacement, setTrackMix,
  canonicalJson, loadProject, buildMixPlan
} from '../src/mixer-core.mjs';

const PX_PER_MS = 0.1;
let project = makeDemo();
let selectedId = null;
let drag = null;

const timeline = document.querySelector('#timeline');
const io = document.querySelector('#io');
const selection = document.querySelector('#selection');
const startInput = document.querySelector('#start');
const durationInput = document.querySelector('#duration');
const fadeInInput = document.querySelector('#fadeIn');
const fadeOutInput = document.querySelector('#fadeOut');
const loopInput = document.querySelector('#loop');

function makeDemo() {
  let p = createProject({ id: 'workspace-demo', title: 'Workspace Demo' });
  p = addTrack(p, { id: 'music', name: 'Music' });
  p = addTrack(p, { id: 'sfx', name: 'SFX' });
  p = placeClip(p, 'music', { id: 'exploration', source: { kind: 'music-stem', ref: 'music://exploration' }, startMs: 0, durationMs: 4000, fadeInMs: 100, fadeOutMs: 200 });
  p = placeClip(p, 'sfx', { id: 'impact', source: { kind: 'audio-cue', ref: 'audio://impact' }, startMs: 1500, durationMs: 500, fadeOutMs: 50 });
  return p;
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
    const mute = control('Mute', track.mute, () => { project = setTrackMix(project, track.id, { mute: !track.mute }); render(); });
    const solo = control('Solo', track.solo, () => { project = setTrackMix(project, track.id, { solo: !track.solo }); render(); });
    const gain = document.createElement('input');
    gain.type = 'range'; gain.min = '0'; gain.max = '2'; gain.step = '0.05'; gain.value = String(track.gain);
    gain.setAttribute('aria-label', `${track.name} gain`);
    gain.addEventListener('change', () => { project = setTrackMix(project, track.id, { gain: Number(gain.value) }); render(); });
    head.append(title, mute, solo, gain);
    const lane = document.createElement('div');
    lane.className = 'lane';
    if (track.mute || (hasSolo && !track.solo)) lane.classList.add('muted');
    for (const placement of track.placements) lane.append(makeClip(placement));
    wrapper.append(head, lane);
    timeline.append(wrapper);
  }
  updateInspector();
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
    project = movePlacement(project, placement.id, Math.max(0, drag.startMs + deltaMs));
    drag = null;
    render();
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
  project = editPlacement(project, selectedId, {
    startMs: Number(startInput.value), durationMs: Number(durationInput.value),
    fadeInMs: Number(fadeInInput.value), fadeOutMs: Number(fadeOutInput.value), loop: loopInput.checked
  });
  render();
});
document.querySelector('#new').addEventListener('click', () => { project = makeDemo(); selectedId = null; render(); });
document.querySelector('#save').addEventListener('click', () => { io.value = canonicalJson(project); });
document.querySelector('#open').addEventListener('click', () => { project = loadProject(io.value); selectedId = null; render(); });
document.querySelector('#plan').addEventListener('click', () => { io.value = `${JSON.stringify(buildMixPlan(project), null, 2)}\n`; });

render();
