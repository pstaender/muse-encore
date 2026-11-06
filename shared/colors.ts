// SPDX-License-Identifier: GPL-3.0-only
// The blue of both apps (not MuseScore's): the accent of the UI (--accent in the stylesheets) and the selection color
// of voice 1 (MuseScore: #0065BF), i.e. selected elements, the note input cursor, the playback cursor; the colors of the
// other voices. The library keeps MuseScore's defaults; the apps set them with useAppColors().
import { setVoiceColor } from '../src/index'

export const ACCENT_COLOR = '#3066FD'

/** the selection colors of the voices 1-4 and of "all voices" (MuseScore: #0065BF, #007F00, #C53F00, #C31989, #6038FC) */
export const VOICE_COLORS: readonly string[] = [ACCENT_COLOR, '#00C950', '#FB2C36', '#E12AFB', '#5D0EC0']

export function useAppColors(): void {
    VOICE_COLORS.forEach((c, voice) => setVoiceColor(voice, c))
}
