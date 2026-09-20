# AXM Sound Mixer

AXM Sound Mixer is the **beginner-friendly Lego-like audio workspace** for AXM.

The goal is a tool that is fun and understandable even for someone who is not an audio engineer, while still using the same canonical state that AI and deterministic programs use underneath.

## Product idea

Drag in pieces such as:

- music stems
- drums
- bass
- ambient loops
- NPC speech
- vocals
- gunshots
- footsteps
- impacts
- wind / weather
- transitions
- effect blocks
- automation blocks

Then snap, trim, move, loop, layer, fade, stretch, route and automate them visually.

Think **audio Lego**, not a beginner-hostile wall of studio controls.

## Core rule

The GUI must not invent a secret project format.

```text
AUDIO ATOM
    |
CLIP / STEM / VOICE LINE
    |
TRACK
    |
SCENE / SONG / GAME CUE
    |
MIX
    |
runtime / WAV / video / game
```

Humans, AI and deterministic tools should manipulate the same underlying project model.

That enables workflows like:

1. AI drafts a battle theme.
2. Human drags the bass section later.
3. Human shortens an NPC line.
4. AI is asked to soften the transition.
5. The system modifies only the relevant canonical pieces rather than regenerating everything.

## Separation

- `axm-audio-fabric` = sound engine / processing / playback substrate.
- `axm-music-maker` = composition, stems, vocals, NPC voice performance and adaptive score.
- `axm-sound-mixer` = assembly, arranging, automation, routing and approachable human interface.

The mixer may call both neighboring repositories, but it should not duplicate their canonical engines.

## Immediate proving target

Build a local visual workspace that can place several supplied/generated clips on tracks, move/trim/loop/fade them, persist exact project state, reopen it, and produce an inspectable mix plan.

Real audio rendering can initially delegate to Audio Fabric.

See `START_HERE_NEXT.md` and `PROJECT.json`.
