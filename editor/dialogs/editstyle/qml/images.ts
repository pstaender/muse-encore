/*
 * SPDX-License-Identifier: GPL-3.0-only
 * The images of the QML pages of the Style dialog (accidentalImages/, beamImages/, courtesyImages/, ...), bundled from
 * the MuseScore submodule; addressed like in the QML ("beamImages/beam_style_french.svg").
 */
const DIR = '../../../../MuseScore/src/notationscene/qml/MuseScore/NotationScene/styledialog/'

const images = import.meta.glob<string>('../../../../MuseScore/src/notationscene/qml/MuseScore/NotationScene/styledialog/*Images/*.{png,svg}',
    { eager: true, query: '?url', import: 'default' })

export function styleDialogImage(source: string): string {
    // HammerOnPullOffTappingPage.qml names its images without the extension
    return images[DIR + source] ?? images[DIR + source + '.png'] ?? ''
}
