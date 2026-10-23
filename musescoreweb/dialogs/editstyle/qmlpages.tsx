/*
 * SPDX-License-Identifier: GPL-3.0-only
 * The QML parts of MuseScore's Style dialog (src/notationscene/qml/MuseScore/NotationScene/styledialog), which
 * EditStyle::EditStyle embeds with createQmlWidget into widgets of editstyle.ui: the React components by the
 * objectName of their host widget (e.g. "groupBox_beams" -> BeamsPage.qml), appended to the host's layout.
 */
import { useEffect } from 'react'
import type { MasterScore, NotationStyle } from '../../../src/index'
import { scoreChanged } from '../../scoreview'
import { AccidentalsPage } from './qml/AccidentalsPage'
import { BeamsPage } from './qml/BeamsPage'
import { BendsPage } from './qml/BendsPage'
import { ChordSymbolsPage } from './qml/ChordSymbolsPage'
import { ClefKeyTimeSigPage } from './qml/ClefKeyTimeSigPage'
import { FretboardsPage } from './qml/FretboardsPage'
import { GlissandoSection } from './qml/GlissandoSection'
import { HammerOnPullOffTappingPage } from './qml/HammerOnPullOffTappingPage'
import { MeasureNumbersPage } from './qml/MeasureNumbersPage'
import { NoteFlagsTypeSelector } from './qml/NoteFlagsTypeSelector'
import { NoteLineSection } from './qml/NoteLineSection'
import { RepeatBarlinesSection } from './qml/RepeatBarlinesSection'
import { RepeatPage } from './qml/RepeatPage'
import { RestOffsetSelector } from './qml/RestOffsetSelector'
import { SlursAndTiesPage } from './qml/SlursAndTiesPage'
import { TupletCenteringSelector } from './qml/TupletCenteringSelector'
import { VoltasPage } from './qml/VoltasPage'

export interface QmlPageProps {
    score: MasterScore
    style: NotationStyle
    /** EditStyle::goToTextStylePage(QString code) / goToTextStylePage(int index) */
    goToTextStylePage: (codeOrIndex: string | number) => void
}

let s_updatePending = false

/** one view update for the changes of all mounted QML widgets */
function updateScoreView(): void {
    if (!s_updatePending) {
        s_updatePending = true
        queueMicrotask(() => {
            s_updatePending = false
            scoreChanged(false)
        })
    }
}

/** the score view is updated after each style change of a QML page (C++: the notation's styleChanged -> repaint) */
function withScoreUpdate(Page: (props: QmlPageProps) => React.JSX.Element): (props: QmlPageProps) => React.JSX.Element {
    return function QmlWidget(props: QmlPageProps): React.JSX.Element {
        useEffect(() => props.style.styleChanged().onNotify(updateScoreView), [props.style])
        return <Page {...props} />
    }
}

export const QML_WIDGETS: Readonly<Record<string, (props: QmlPageProps) => React.JSX.Element>> = {
    groupBox_noteFlags: withScoreUpdate(NoteFlagsTypeSelector),
    groupBox_rests: withScoreUpdate(RestOffsetSelector),
    groupBox_beams: withScoreUpdate(BeamsPage),
    PageBend: withScoreUpdate(BendsPage),
    PageSlursTies: withScoreUpdate(SlursAndTiesPage),
    PageAccidentals: withScoreUpdate(AccidentalsPage),
    PageFretboardDiagrams: withScoreUpdate(FretboardsPage),
    hoposPageWidget: withScoreUpdate(HammerOnPullOffTappingPage),
    groupBox_glissando: withScoreUpdate(GlissandoSection),
    groupBox_noteline: withScoreUpdate(NoteLineSection),
    clefTimeKeySigPage: withScoreUpdate(ClefKeyTimeSigPage),
    repeatBarlinesGroupBox: withScoreUpdate(RepeatBarlinesSection),
    chordSymbolsPage: withScoreUpdate(ChordSymbolsPage),
    voltasPageWidget: withScoreUpdate(VoltasPage),
    pageMeasureNumbers: withScoreUpdate(MeasureNumbersPage),
    groupBox_tuplets_properties: withScoreUpdate(TupletCenteringSelector),
    PageRepeats: withScoreUpdate(RepeatPage),
}
