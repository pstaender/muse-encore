/*
 * SPDX-License-Identifier: GPL-3.0-only
 * MuseEncore — port of MuseScore Studio (https://github.com/musescore/MuseScore)
 * Copyright (C) 2021-2026 MuseScore Limited and others
 *
 * Port of src/notation/internal/masternotation.cpp: creating a new score (setupNewScore, applyOptions) and the
 * excerpts (parts) of the score with their notations (ExcerptNotation; the Parts dialog and the notation tabs).
 * The library keeps one MasterNotation per master score (index.ts). No playback here (NotationPlayback is separate).
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
import type { Score } from '../../engraving/dom/score'
import type { Part } from '../../engraving/dom/part'
import { Excerpt } from '../../engraving/dom/excerpt'
import { TranslatableString } from '../../framework/global/types/translatablestring'
import { ExcerptNotation } from './excerptnotation'
import { Notification, type NotationUndoStack } from './notationundostack'
import '../../engraving/editing/editexcerpt'
import type { Measure } from '../../engraving/dom/measure'
import type { TimeSig } from '../../engraving/dom/timesig'
import type { TextBase } from '../../engraving/dom/textbase'
import { MasterNotationParts } from './masternotationparts'
import type { NotationParts } from './notationparts'
import type { ScoreCreateOptions } from '../notationtypes'
import '../../engraving/editing/edit'

function clearMeasures(masterScore: MasterScore): void {
    for (const score of masterScore.scoreList()) {
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
    private m_excerpts: ExcerptNotation[] = []
    private m_potentialExcerpts: ExcerptNotation[] = []
    private m_potentialExcerptsForcedDirty = false
    private m_excerptsChanged = new Notification()

    /**
     * undoStackOf: the undo stack of a notation (the master score's notation or an excerpt's; C++ Notation::undoStack())
     */
    constructor(private m_score: MasterScore, private m_undoStackOf: ((score: Score) => NotationUndoStack) | null = null) {}

    masterScore(): MasterScore { return this.m_score }

    parts(): NotationParts { return new MasterNotationParts(this.m_score) }

    setupNewScore(score: MasterScore, scoreOptions: ScoreCreateOptions): void {
        this.m_score = score

        this.parts().setParts(scoreOptions.parts, scoreOptions.order)

        score.checkChordList()
        score.updateSwing()
        score.updateCapo()

        this.applyOptions(score, scoreOptions)

        // TODO(port): initAfterSettingScore
        // addExcerptsToMasterScore(score->excerpts()): a new score has no excerpts yet
        score.setExcerptsChanged(false)
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
                nvb.manageExclusionFromParts(/*exclude*/ false)
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

        // C++ ScoreLoad sl: no undo while laying out
        for (const s of score.scoreList()) {
            ScoreRenderer.layoutScore(s, new Fraction(0, 1), new Fraction(-1, 1))
        }

        // TODO(port): m_notationPlayback->reload()
    }

    // =================================================================================================================
    //   excerpts
    // =================================================================================================================

    private undoStack(): NotationUndoStack {
        return this.m_undoStackOf!(this.m_score)
    }

    private createAndInitExcerptNotation(excerpt: Excerpt): ExcerptNotation {
        const excerptNotation = new ExcerptNotation(excerpt, this.m_undoStackOf!)
        excerptNotation.init()

        return excerptNotation
    }

    /** MasterNotation::initAfterSettingScore (the excerpts part): called once for a loaded or new score */
    initExcerptNotations(excerpts: readonly Excerpt[]): void {
        const notationExcerpts: ExcerptNotation[] = []

        for (const excerpt of excerpts) {
            if (excerpt.isEmpty()) {
                this.masterScore().initEmptyExcerpt(excerpt)
            }

            notationExcerpts.push(this.createAndInitExcerptNotation(excerpt))
        }

        this.masterScore().setExcerptsChanged(false)

        this.doSetExcerpts(notationExcerpts)
    }

    initExcerpts(excerpts: readonly ExcerptNotation[]): void {
        for (const excerptNotation of excerpts) {
            this.masterScore().initExcerpt(excerptNotation.excerpt())
            excerptNotation.init()
            // TODO(port): initNotationSoloMuteState (the mixer)
        }
    }

    setExcerpts(excerpts: readonly ExcerptNotation[]): void {
        if (this.m_excerpts.length === excerpts.length && this.m_excerpts.every((e, i) => e === excerpts[i])) {
            return
        }

        const score = this.masterScore()

        this.undoStack().prepareChanges(new TranslatableString('undoableAction', 'Add/remove parts'))

        // Delete old excerpts (that are not included in the new list)
        for (const excerptNotation of this.m_excerpts) {
            if (excerpts.includes(excerptNotation)) {
                continue
            }

            score.deleteExcerpt(excerptNotation.excerpt())
        }

        // Init new excerpts
        for (let i = 0; i < excerpts.length; ++i) {
            const excerptNotation = excerpts[i]

            if (this.m_excerpts.includes(excerptNotation)) {
                const msExcerpts = score.excerpts()
                const from = msExcerpts.indexOf(excerptNotation.excerpt())
                if (from >= 0 && from !== i) {
                    // muse::moveItem
                    const [item] = msExcerpts.splice(from, 1)
                    msExcerpts.splice(Math.min(i, msExcerpts.length), 0, item)
                }
                continue
            }

            score.initAndAddExcerpt(excerptNotation.excerpt(), false)
            excerptNotation.init()
            // TODO(port): initNotationSoloMuteState (the mixer)
        }

        score.setExcerptsChanged(false)

        this.undoStack().commitChanges()

        this.doSetExcerpts([...excerpts])
    }

    resetExcerpt(excerptNotation: ExcerptNotation | null): void {
        if (!excerptNotation || !excerptNotation.isInited()) {
            return
        }

        this.undoStack().prepareChanges(new TranslatableString('undoableAction', 'Reset part'))

        const oldExcerpt = excerptNotation.excerpt()
        this.masterScore().deleteExcerpt(oldExcerpt)

        const newExcerpt = oldExcerpt.clone(false)
        this.masterScore().initAndAddExcerpt(newExcerpt, false)

        newExcerpt.excerptScore()!.setIsOpen(oldExcerpt.excerptScore()?.isOpen() ?? false)

        excerptNotation.reinit(newExcerpt)

        this.masterScore().setExcerptsChanged(false)

        this.undoStack().commitChanges()
    }

    sortExcerpts(excerpts: ExcerptNotation[]): void {
        const partIdList = this.masterScore().parts().map(part => part.id())
        const indexOf = (id: string): number => {
            const i = partIdList.indexOf(id)
            return i < 0 ? Number.MAX_SAFE_INTEGER : i // muse::nidx
        }

        excerpts.sort((f, s) => {
            //! NOTE: excertps created by users are always at the end of the list in alphabetical order
            if (f.isCustom() && !s.isCustom()) {
                return 1
            } else if (!f.isCustom() && s.isCustom()) {
                return -1
            } else if (f.isCustom() && s.isCustom()) {
                return f.name() < s.name() ? -1 : f.name() > s.name() ? 1 : 0
            }

            //! NOTE: sort standard excerpts in the order of their initial parts in the main score
            return indexOf(f.excerpt().initialPartId()) - indexOf(s.excerpt().initialPartId())
        })
    }

    setExcerptIsOpen(excerptNotation: ExcerptNotation, open: boolean): void {
        if (excerptNotation.isOpen() === open) {
            return
        }

        excerptNotation.setIsOpen(open)

        if (open) {
            const score = excerptNotation.score()
            if (score) {
                ScoreRenderer.layoutScore(score, new Fraction(0, 1), new Fraction(-1, 1)) // C++ msScore()->doLayout()
            }
        }
    }

    private doSetExcerpts(excerpts: ExcerptNotation[]): void {
        this.m_excerpts = excerpts
        this.m_excerptsChanged.notify()

        // (MasterNotationParts uses the master score's excerpts directly)

        this.updatePotentialExcerpts()
    }

    /** MasterNotation::updateExcerpts: called after a change of the score (C++ changesChannel), e.g. an undone part */
    updateExcerpts(): void {
        if (!this.masterScore().excerptsChanged()) {
            return
        }

        const updatedExcerpts: ExcerptNotation[] = []

        const excerpts = this.masterScore().excerpts()

        // exclude notations for old excerpts
        for (const excerptNotation of this.m_excerpts) {
            if (excerpts.includes(excerptNotation.excerpt())) {
                updatedExcerpts.push(excerptNotation)
                continue
            }
        }

        // create notations for new excerpts
        for (const excerpt of excerpts) {
            if (this.containsExcerpt(excerpt)) {
                continue
            }

            const excerptNotation = this.createAndInitExcerptNotation(excerpt)
            const open = excerpt.excerptScore()?.isOpen() ?? false
            if (open) {
                ScoreRenderer.layoutScore(excerptNotation.score()!, new Fraction(0, 1), new Fraction(-1, 1))
            }

            // TODO(port): initNotationSoloMuteState (the mixer)

            updatedExcerpts.push(excerptNotation)
        }

        this.doSetExcerpts(updatedExcerpts)

        this.masterScore().setExcerptsChanged(false)
    }

    private updatePotentialExcerpts(): void {
        const findExcerptByPart = (excerpts: readonly ExcerptNotation[], part: Part): ExcerptNotation | undefined =>
            excerpts.find(notation => notation.excerpt().initialPartId() === part.id())

        const potentialExcerpts: ExcerptNotation[] = []
        const partsWithoutExcerpt: Part[] = []

        for (const part of this.masterScore().parts()) {
            if (findExcerptByPart(this.m_excerpts, part)) {
                continue
            }

            if (!this.m_potentialExcerptsForcedDirty) {
                const it = findExcerptByPart(this.m_potentialExcerpts, part)
                if (it) {
                    potentialExcerpts.push(it)
                    continue
                }
            }

            partsWithoutExcerpt.push(part)
        }

        const excerpts = Excerpt.createExcerptsFromParts(partsWithoutExcerpt, this.masterScore())

        for (const excerpt of excerpts) {
            potentialExcerpts.push(new ExcerptNotation(excerpt, this.m_undoStackOf!))
        }

        this.m_potentialExcerpts = potentialExcerpts
        this.m_potentialExcerptsForcedDirty = false
    }

    private containsExcerpt(excerpt: Excerpt): boolean {
        return this.m_excerpts.some(excerptNotation => excerptNotation.excerpt() === excerpt)
    }

    /** MasterNotation::onPartsChanged (the parts of the master score were changed) */
    onPartsChanged(): void {
        this.m_potentialExcerptsForcedDirty = true
    }

    createEmptyExcerpt(name: string): ExcerptNotation {
        const excerptNotation = new ExcerptNotation(new Excerpt(this.masterScore()), this.m_undoStackOf!)
        excerptNotation.setName(name)

        return excerptNotation
    }

    excerpts(): readonly ExcerptNotation[] {
        this.updateExcerpts()
        return this.m_excerpts
    }

    excerptsChanged(): Notification { return this.m_excerptsChanged }

    hasParts(): boolean {
        return this.masterScore().parts().length > 0
    }

    potentialExcerpts(): readonly ExcerptNotation[] {
        this.updatePotentialExcerpts()

        return this.m_potentialExcerpts
    }

    /** the excerpt notation of an excerpt score (null for the master score) */
    excerptNotationOf(score: Score): ExcerptNotation | null {
        return this.excerpts().find(e => e.score() === score) ?? null
    }
}
