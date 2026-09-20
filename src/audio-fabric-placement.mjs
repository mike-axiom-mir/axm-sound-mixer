import { placeClip } from './mixer-core.mjs';
import { placementFromAudioFabricMusicReceipt } from './audio-fabric-source.mjs';

export function placeAudioFabricMusicRender(project, trackId, receipt, options) {
  return placeClip(project, trackId, placementFromAudioFabricMusicReceipt(receipt, options));
}
