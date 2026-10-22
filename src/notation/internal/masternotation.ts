/*
 * SPDX-License-Identifier: GPL-3.0-only
 * MuseScore-Web — port of MuseScore Studio (https://github.com/musescore/MuseScore)
 * Copyright (C) 2021-2026 MuseScore Limited and others
 *
 * Port of the parts of src/notation/internal/masternotation.cpp that create a new score
 * (setupNewScore, applyOptions). No undo stack, no excerpts, no playback.
 */

import { Fraction } from '../../engraving/types/fraction'
import { DurationType, ElementType, Key, KeyMode, TextStyleType } from '../../engraving/types/types'
import { Sid } from '../../engraving/style/styledef'
import { DefaultStyle } from '../../engraving/style/defaultstyle'
import { pageStyles } from '../../engraving/style/pagestyle'
import { Factory } from '../../engraving/dom/factory'
import { KeySigEvent } from '../../engraving/dom/key'
import { SegmentType } from '../../engraving/dom/segment'
import { VBox } from '../../engraving/dom/box'
import { TempoText } from '../../engraving/dom/tempotext'
import { ScoreRenderer } from '../../engraving/rendering/score/scorerenderer'
import type { MasterScore } from '../../engraving/dom/masterscore'
import type { Measure } from '../../engraving/dom/measure'
import type { TimeSig } from '../../engraving/dom/timesig'
import type { TextBase } from '../../engraving/dom/textbase'
import { MasterNotationParts } from './masternotationparts'
import type { NotationParts } from './notationparts'
import type { ScoreCreateOptions } from '../notationtypes'
import '../../engraving/editing/edit'

function clearMeasures(masterScore: MasterScore): void {
    for (const score of [masterScore]) { // TODO(port): scoreList() (excerpts)
        for (const _part of score.parts()) {
            // TODO(port): part->removeNonPrimaryInstruments() (instrument changes)
        }

        // C++ deletes the measures (deleteLater); the time signatures stay in the staves' lists as dangling pointers
        // until setUpTempoMap() rebuilds them, here they are removed at once
        for (const staff of score.staves()) {
            staff.clearTimeSig()
        }

        for (const spanner of [...score.spanner()]) {
            score.removeSpanner(spanner)
        }

        score.measures().clear()
    }

    masterScore.setPlaylistDirty()
    masterScore.updateRepeatList()
}

function createMeasures(masterScore: MasterScore, scoreOptions: ScoreCreateOptions): void {
    masterScore.sigmap().addSig(0, scoreOptions.globalTimesig)

    const keySigEvent = new KeySigEvent()
    if (scoreOptions.key === Key.INVALID) {
        // Make atonal key signature
        keySigEvent.setCustom(true)
        keySigEvent.setMode(KeyMode.NONE)
    } else {
        keySigEvent.setConcertKey(scoreOptions.key)
    }

    // Ensure all key sigs that may have been in the template file are cleared
    for (const staff of masterScore.staves()) {
        staff.keyList().clear()
    }

    const totalMeasures = scoreOptions.withPickupMeasure ? scoreOptions.totalMeasures + 1 : scoreOptions.totalMeasures
    for (let i = 0; i < totalMeasures; ++i) {
        const measureBase = masterScore.insertMeasureInMaster()
        const measure = measureBase && measureBase.isMeasure() ? measureBase as Measure : null
        if (!measure) {
            break
        }

        measure.setTimesig(scoreOptions.globalTimesig)

        if (i > 0) {
            measure.setTicks(scoreOptions.globalTimesig)
            continue
        }

        // Special handling for first measure (apply pickups, timesigs, and keysigs)...

        measure.setIrregular(scoreOptions.withPickupMeasure)
        measure.adjustToLen(scoreOptions.withPickupMeasure ? scoreOptions.pickupTimesig : scoreOptions.globalTimesig)

        // Add timesigs...
        const timesig = Factory.createItem(ElementType.TIMESIG, masterScore) as TimeSig // parent: dummy segment
        timesig.setSig(scoreOptions.globalTimesig, scoreOptions.timesigType)
        masterScore.cmdAddTimeSig(measure, /*staffIdx*/ 0, timesig, /*local*/ false)

        for (const staff of masterScore.staves()) {
            // Add keysig for each staff...
            masterScore.undoChangeKeySig(staff, measure.tick(), keySigEvent)
        }
    }
}

export class MasterNotation {
    constructor(private m_score: MasterScore) {}

    masterScore(): MasterScore { return this.m_score }

    parts(): NotationParts { return new MasterNotationParts(this.m_score) }

    setupNewScore(score: MasterScore, scoreOptions: ScoreCreateOptions): void {
        this.m_score = score

        this.parts().setParts(scoreOptions.parts, scoreOptions.order)

        score.checkChordList()
        score.updateSwing()
        score.updateCapo()

        this.applyOptions(score, scoreOptions)

        // TODO(port): initAfterSettingScore, excerpts
    }

    applyOptions(score: MasterScore, scoreOptions: ScoreCreateOptions, createdFromTemplate = false): void {
        let nvb: VBox | null = null

        if (createdFromTemplate) {
            const mb = score.first()
            if (mb && mb.isVBox()) {
                const tvb = mb as VBox
                nvb = Factory.createTitleVBox(score.dummySystem())
                nvb.setBoxHeight(tvb.boxHeight())
                nvb.setBoxWidth(tvb.boxWidth())
                nvb.setTopGap(tvb.topGap())
                nvb.setBottomGap(tvb.bottomGap())
                nvb.setTopMargin(tvb.topMargin())
                nvb.setBottomMargin(tvb.bottomMargin())
                nvb.setLeftMargin(tvb.leftMargin())
                nvb.setRightMargin(tvb.rightMargin())
                nvb.setAutoSizeEnabled(tvb.isAutoSizeEnabled())
            }

            score.clearSystemLocks()
            clearMeasures(score)

            // for templates using built-in base page style, set score page style to default (may be user-defined)
            const isBaseWidth = Math.abs(score.style().styleD(Sid.pageWidth) - DefaultStyle.baseStyle().styleD(Sid.pageWidth)) < 0.1
            const isBaseHeight = Math.abs(score.style().styleD(Sid.pageHeight) - DefaultStyle.baseStyle().styleD(Sid.pageHeight)) < 0.1
            if (isBaseWidth && isBaseHeight) {
                for (const st of pageStyles()) {
                    score.style().set(st, DefaultStyle.defaultStyle().value(st))
                }
                score.styleChanged()
            }
        }

        score.checkChordList()

        createMeasures(score, scoreOptions)

        {
            const title = score.metaTag('workTitle')
            const subtitle = score.metaTag('subtitle')
            const composer = score.metaTag('composer')
            const lyricist = score.metaTag('lyricist')

            if (title || subtitle || composer || lyricist) {
                const measure = score.measures().first()!
                if (!measure.isVBox()) {
                    if (!nvb) {
                        nvb = Factory.createTitleVBox(score.dummySystem())
                    }
                    nvb.setTick(new Fraction(0, 1))
                    nvb.setNext(measure)
                    score.measures().add(nvb)
                } else if (nvb) {
                    nvb = null
                }

                const setText = (textItemId: TextStyleType, text: string): void => {
                    let textItem: TextBase | null = score.getText(textItemId)

                    if (!textItem) {
                        textItem = score.addText(textItemId)
                    }

                    if (textItem) {
                        textItem.setPlainText(text)
                    }
                }

                if (title) {
                    setText(TextStyleType.TITLE, title)
                }
                if (subtitle) {
                    setText(TextStyleType.SUBTITLE, subtitle)
                }
                if (composer) {
                    setText(TextStyleType.COMPOSER, composer)
                }
                if (lyricist) {
                    setText(TextStyleType.LYRICIST, lyricist)
                }
            } else if (nvb) {
                nvb = null
            }

            if (nvb) {
                // TODO(port): nvb->manageExclusionFromParts(false) (excerpts)
            }
        }

        if (scoreOptions.withTempo) {
            let text = '<sym>metNoteQuarterUp</sym> = %1'
            const bpm = scoreOptions.tempo.valueBpm
            let qpm = bpm // internal tempo value is always expressed in quarter notes

            const withDot = scoreOptions.tempo.withDot
            switch (scoreOptions.tempo.duration) {
            case DurationType.V_WHOLE:
                text = '<sym>metNoteWhole</sym> = %1'
                qpm *= 4.0
                break
            case DurationType.V_HALF:
                if (withDot) {
                    text = '<sym>metNoteHalfUp</sym><sym>space</sym><sym>metAugmentationDot</sym> = %1'
                    qpm *= 3.0
                } else {
                    text = '<sym>metNoteHalfUp</sym> = %1'
                    qpm *= 2.0
                }
                break
            case DurationType.V_QUARTER:
                if (withDot) {
                    text = '<sym>metNoteQuarterUp</sym><sym>space</sym><sym>metAugmentationDot</sym> = %1'
                    qpm *= 1.5
                } else {
                    text = '<sym>metNoteQuarterUp</sym> = %1'
                }
                break
            case DurationType.V_EIGHTH:
                if (withDot) {
                    text = '<sym>metNote8thUp</sym><sym>space</sym><sym>metAugmentationDot</sym> = %1'
                    qpm *= 0.75
                } else {
                    text = '<sym>metNote8thUp</sym> = %1'
                    qpm *= 0.5
                }
                break
            case DurationType.V_16TH:
                if (withDot) {
                    text = '<sym>metNote16thUp</sym><sym>space</sym><sym>metAugmentationDot</sym> = %1'
                    qpm *= 0.375
                } else {
                    text = '<sym>metNote16thUp</sym> = %1'
                    qpm *= 0.25
                }
                break
            default:
                break
            }

            const seg = score.firstMeasure()!.first(SegmentType.ChordRest)!
            const tt = new TempoText(seg)
            tt.setXmlText(text.replace('%1', String(bpm))) // QString::arg(double): shortest representation
            tt.setTempo(qpm / 60.0) // qpm -> qps
            tt.setFollowText(true)
            tt.setTrack(0)
            seg.add(tt)
            for (const staff of score.systemObjectStaves()) {
                const linkedTt = tt.linkedClone() as TempoText
                linkedTt.setScore(score)
                linkedTt.setTrack(staff.idx() * 4 /* VOICES */)
                seg.add(linkedTt)
            }
        }

        score.setUpTempoMap()
        score.autoUpdateSpatium()

        // TODO(port): ScoreLoad; excerpts (scoreList())
        ScoreRenderer.layoutScore(score, new Fraction(0, 1), new Fraction(-1, 1))

        // TODO(port): m_notationPlayback->reload()
    }
}
