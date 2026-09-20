# START HERE NEXT

Continue this repository as the approachable Lego-like human audio workspace.

## First build

Make one local project model and a simple visual interface with:
- tracks;
- draggable clip blocks;
- move;
- trim;
- loop;
- fade in/out;
- mute/solo;
- gain;
- save;
- reopen.

The saved canonical project must reproduce the same arrangement exactly.

## UX direction

Beginner first:
- large obvious blocks;
- visible timing;
- snapping that can be disabled;
- undo/redo;
- no requirement to understand studio jargon;
- advanced controls can exist progressively.

AI help should act on the same project state:
- "move the bass later"
- "make this transition smoother"
- "lower the voice during explosions"

Those actions should become explicit project edits, not opaque regeneration.

## Integration

Audio Fabric is the playback/processing/render substrate.
Music Maker supplies structured music, stems and voice performances.
Sound Mixer assembles them.

Do not create a private UI-only format that AI or other AXM tools cannot inspect.
