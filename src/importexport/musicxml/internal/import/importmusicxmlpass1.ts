/*
 * SPDX-License-Identifier: GPL-3.0-only
 * MuseEncore — port of MuseScore Studio (https://github.com/musescore/MuseScore)
 * Copyright (C) 2021-2026 MuseScore Limited and others
 *
 * Port of src/importexport/musicxml/internal/import/importmusicxmlpass1.h/.cpp
 *
 * The C++ out parameters (int&, Fraction&, String&, ...) are { v } objects; containers passed by reference are
 * mutated in place. Methods returning C++ copies of values (muse::value(map, id)) return clones.
 */

import type { BracketItem } from '../../../../engraving/dom/bracketitem'
import type { VBox } from '../../../../engraving/dom/box'
import { scoreDummy } from '../../../../engraving/compat/dummyelement'
import '../../../../engraving/dom/excerpt' // Part.setStaves
import { Factory } from '../../../../engraving/dom/factory'
import { Interval } from '../../../../engraving/dom/interval'
import type { LayoutBreak } from '../../../../engraving/dom/layoutbreak'
import type { Measure } from '../../../../engraving/dom/measure'
import type { MeasureBase } from '../../../../engraving/dom/measurebase'
import { MScore } from '../../../../engraving/dom/mscore'
import { Part } from '../../../../engraving/dom/part'
import { Pid, PropertyFlags } from '../../../../engraving/dom/property'
import { scoreRendererHooks, type Score } from '../../../../engraving/dom/score'
import type { Staff } from '../../../../engraving/dom/staff'
import { Text } from '../../../../engraving/dom/text'
import { TimeSigType } from '../../../../engraving/dom/timesig'
import { Err } from '../../../../engraving/engravingerrors'
import { engravingFonts } from '../../../../engraving/infrastructure/engravingfont'
import { XmlStreamReader, toXmlEscaped } from '../../../../engraving/rw/xmlreader'
import { Sid } from '../../../../engraving/style/styledef'
import { allTextStyles, textStyle } from '../../../../engraving/style/textstyle'
import { Spatium } from '../../../../engraving/types/dimension'
import { Fraction } from '../../../../engraving/types/fraction'
import { SymId } from '../../../../engraving/types/symid'
import { SymNames } from '../../../../engraving/types/symnames'
import {
    Align, AlignH, AlignV, AutoOnOff, BracketType, DirectionV, DPI, DPMM, ElementType, INCH, LayoutBreakType, MAX_STAVES, NoteHeadGroup,
    TextStyleType, TimeSigPlacement, VOICES, type staff_idx_t, type track_idx_t,
} from '../../../../engraving/types/types'
import { FontMetrics } from '../../../../framework/draw/fontmetrics'
import { Color } from '../../../../framework/draw/types/color'
import { Font } from '../../../../framework/draw/types/font'
import { SizeF } from '../../../../framework/draw/types/geometry'
import { FractionMap, IntMap, StringMap } from '../../../../framework/global/orderedmap'
import { musicXmlImportConfiguration } from '../musicxmlconfiguration'
import {
    checkAtEndElement, errorStringWithLocation, musicXmlAccidentalTextToChar, strToDouble, strToInt, trimmed,
} from '../shared/musicxmlsupport'
import {
    MAX_NUMBER_LEVEL, MusicXmlExporterSoftware, MusicXmlInstrList, MusicXmlInstrument, MusicXmlInstruments, MusicXmlIntervalList,
    MusicXmlStartStop,
} from '../shared/musicxmltypes'
import type { MusicXmlLogger } from './importmusicxmllogger'
import { MusicXmlNoteDuration } from './importmusicxmlnoteduration'
import { MusicXmlPart } from './musicxmlpart'
import { MusicXmlTupletStates } from './musicxmltupletstate'
import { VoiceDesc, VoiceList } from './musicxmlvoicedesc'

function configuration(): ReturnType<typeof musicXmlImportConfiguration> {
    return musicXmlImportConfiguration()
}

function musicXmlImportBreaks(): boolean {
    return configuration().importBreaks()
}

function musicXmlImportLayout(): boolean {
    return configuration().importLayout()
}

/** muse::String::number(double): fixed with 6 decimals, trailing zeros removed */
function numberToString(n: number): string {
    let s = n.toFixed(6)
    if (s.includes('.')) {
        s = s.replace(/0+$/, '').replace(/\.$/, '')
    }
    return s === '-0' ? '0' : s
}

/** muse::String::decodeXmlEntities: decimal character references */
function decodeXmlEntities(src: string): string {
    return src.replace(/&#([0-9]+);/g, (_m, d: string) => String.fromCharCode(parseInt(d, 10) & 0xFFFF))
}

/** std::round: half away from zero */
function stdRound(v: number): number {
    return v < 0 ? -Math.round(-v) : Math.round(v)
}

//---------------------------------------------------------
//   PageFormat
//---------------------------------------------------------

export class PageFormat {
    size = new SizeF()                         // automatically initialized (to invalid)
    printableWidth = 5          // _width - left margin - right margin
    evenLeftMargin = 0.2        // values in inch
    oddLeftMargin = 0.2
    evenTopMargin = 0.2
    evenBottomMargin = 0.2
    oddTopMargin = 0.2
    oddBottomMargin = 0.2
    twosided = false
}

export type StartStop = [number, number]
export type StartStopList = StartStop[]

//---------------------------------------------------------
//   MusicXmlOctaveShiftDesc
//---------------------------------------------------------

export enum MusicXmlOctaveShiftDescType {
    UP, DOWN, STOP, NONE,
}

export class MusicXmlOctaveShiftDesc {
    static readonly Type = MusicXmlOctaveShiftDescType
    tp: MusicXmlOctaveShiftDescType
    size: number
    time: Fraction
    num = -1

    constructor(tp = MusicXmlOctaveShiftDescType.NONE, size = 0, time = new Fraction()) {
        this.tp = tp
        this.size = size
        this.time = time
    }

    clone(): MusicXmlOctaveShiftDesc {
        const r = new MusicXmlOctaveShiftDesc(this.tp, this.size, this.time)
        r.num = this.num
        return r
    }
}

//---------------------------------------------------------
//   MusicXmlPartGroup
//---------------------------------------------------------

export class MusicXmlPartGroup {
    span = 0
    start = 0
    type = BracketType.NO_BRACKET
    barlineSpan = false
    color = new Color()
    column = 0
}
export type MusicXmlPartGroupList = MusicXmlPartGroup[]
export type PartMap = StringMap<Part>
export type MusicXmlPartGroupMap = IntMap<MusicXmlPartGroup>

//---------------------------------------------------------
//   CreditWords
//    a single parsed MusicXML credit-words element
//---------------------------------------------------------

export class CreditWords {
    constructor(
        public page: number,
        public type: string,
        public defaultX: number,
        public defaultY: number,
        public fontSize: number,
        public justify: string,
        public hAlign: string,
        public vAlign: string,
        public words: string,
    ) {}
}
export type CreditWordsList = CreditWords[]

//---------------------------------------------------------
//   NoteList
//---------------------------------------------------------

/**
 List of note start/stop times in a voice in all staves.
*/

class NoteList {
    private _staffNoteLists: StartStopList[] = []   // The note start/stop times in all staves

    constructor() {
        for (let i = 0; i < MAX_STAVES; ++i) {
            this._staffNoteLists.push([])
        }
    }

    addNote(startTick: number, endTick: number, staff: number): void {
        if (staff >= 0 && staff < this._staffNoteLists.length) {
            this._staffNoteLists[staff].push([startTick, endTick])
        }
    }

    dump(voice: number): void {
        // dump contents
        for (let i = 0; i < MAX_STAVES; ++i) {
            let s = `voice ${voice} staff ${i}:`
            for (const n of this._staffNoteLists[i]) {
                s += ` ${n[0]}-${n[1]}`
            }
            console.debug(s)
        }
    }

    /**
     Determine if notes n1 and n2 overlap.
     This is NOT the case if
     - n1 starts when or after n2 stops
     - or n2 starts when or after n1 stops
     */

    private notesOverlap(n1: StartStop, n2: StartStop): boolean {
        return !(n1[0] >= n2[1] || n1[1] <= n2[0])
    }

    /**
     Determine if any note in staff1 and staff2 overlaps.
     */

    stavesOverlap(staff1: number, staff2: number): boolean {
        for (const n1 of this._staffNoteLists[staff1]) {
            for (const n2 of this._staffNoteLists[staff2]) {
                if (this.notesOverlap(n1, n2)) {
                    return true
                }
            }
        }
        return false
    }

    /**
     Determine if any note in any staff overlaps.
     */

    anyStaffOverlaps(): boolean {
        for (let i = 0; i < MAX_STAVES - 1; ++i) {
            for (let j = i + 1; j < MAX_STAVES; ++j) {
                if (this.stavesOverlap(i, j)) {
                    return true
                }
            }
        }
        return false
    }
}

//---------------------------------------------------------
//   VoiceOverlapDetector
//---------------------------------------------------------

/**
 Detect overlap in a voice, which is when a voice has two or more notes
 active at the same time. In theory this should not happen, as voices
 only move forward in time, but Sibelius 7 reuses voice numbers in multi-
 staff parts, which leads to overlap.

 Current implementation does not detect voice overlap within a staff,
 but only between staves.
*/

export class VoiceOverlapDetector {
    private _noteLists = new IntMap<NoteList>()   // The notelists for all the voices

    addNote(startTick: number, endTick: number, voice: number, staff: number): void {
        // if necessary, create the note list for voice
        if (!this._noteLists.has(voice)) {
            this._noteLists.insert(voice, new NoteList())
        }
        this._noteLists.get(voice)!.addNote(startTick, endTick, staff)
    }

    dump(): void {
        for (const [k, v] of this._noteLists) {
            v.dump(k)
        }
    }

    newMeasure(): void {
        this._noteLists.clear()
    }

    stavesOverlap(voice: number): boolean {
        const l = this._noteLists.get(voice)
        return l ? l.anyStaffOverlaps() : false
    }
}

//---------------------------------------------------------
//   allocateStaves
//---------------------------------------------------------

/**
 Allocate MuseScore staff to MusicXML voices.
 For each staff, allocate at most VOICES voices to the staff.
 */

// for regular (non-overlapping) voices:
// 1) assign voice to a staff (allocateStaves)
// 2) assign voice numbers (allocateVoices)
// due to cross-staving, it is not a priori clear to which staff
// a voice has to be assigned
// allocate ordered by number of chordrests in the MusicXML voice
//
// for overlapping voices:
// 1) assign voice to staves it is found in (allocateStaves)
// 2) assign voice numbers (allocateVoices)

function allocateStaves(vcLst: VoiceList): void {
    // initialize
    const voicesAllocated = new Array<number>(MAX_STAVES).fill(0)   // number of voices allocated on each staff

    // handle regular (non-overlapping) voices
    // note: outer loop executed vcLst.size() times, as each inner loop handles exactly one item
    for (let i = 0; i < vcLst.size(); ++i) {
        // find the regular voice containing the highest number of chords and rests that has not been handled yet
        let max = 0
        let key = -1
        for (const [k, v] of vcLst) {
            if (!v.overlaps() && v.numberChordRests() > max && v.staff() === -1) {
                max = v.numberChordRests()
                key = k
            }
        }
        if (key > 0) {
            const prefSt = (vcLst.get(key) ?? new VoiceDesc()).preferredStaff()
            if (voicesAllocated[prefSt] < VOICES) {
                vcLst.at(key).setStaff(prefSt)
                voicesAllocated[prefSt]++
            } else {
                // out of voices: mark as used but not allocated
                vcLst.at(key).setStaff(-2)
            }
        }
    }

    // handle overlapping voices
    // for every staff allocate remaining voices (if space allows)
    // the ones with the highest number of chords and rests get allocated first
    for (let h = 0; h < MAX_STAVES; ++h) {
        // note: middle loop executed vcLst.size() times, as each inner loop handles exactly one item
        for (let i = 0; i < vcLst.size(); ++i) {
            // find the overlapping voice containing the highest number of chords and rests that has not been handled yet
            let max = 0
            let key = -1
            for (const [k, v] of vcLst) {
                if (v.overlaps() && v.numberChordRests(h) > max && v.staffAlloc(h) === -1) {
                    max = v.numberChordRests(h)
                    key = k
                }
            }
            if (key > 0) {
                const prefSt = h
                if (voicesAllocated[prefSt] < VOICES) {
                    vcLst.at(key).setStaffAlloc(prefSt, 1)
                    voicesAllocated[prefSt]++
                } else {
                    // out of voices: mark as used but not allocated
                    vcLst.at(key).setStaffAlloc(prefSt, -2)
                }
            }
        }
    }
}

//---------------------------------------------------------
//   allocateVoices
//---------------------------------------------------------

/**
 Allocate MuseScore voice to MusicXML voices.
 For each staff, the voices are number 1, 2, 3, 4
 in the same order they are numbered in the MusicXML file.
 */

function allocateVoices(vcLst: VoiceList): void {
    const nextVoice = new Array<number>(MAX_STAVES).fill(0)   // number of voices allocated on each staff
    // handle regular (non-overlapping) voices
    // a voice is allocated on one specific staff
    for (const [key, v] of vcLst) {
        const staff = v.staff()
        if (staff >= 0) {
            v.setVoice(nextVoice[staff])
            nextVoice[staff]++
        }
    }
    // handle overlapping voices
    // each voice may be in every staff
    for (const [, v] of vcLst) {
        for (let j = 0; j < MAX_STAVES; ++j) {
            const staffAlloc = v.staffAlloc(j)
            if (staffAlloc >= 0) {
                v.setVoice(j, nextVoice[j])
                nextVoice[j]++
            }
        }
    }
}

//---------------------------------------------------------
//   copyOverlapData
//---------------------------------------------------------

/**
 Copy the overlap data from the overlap detector to the voice list.
 */

function copyOverlapData(vod: VoiceOverlapDetector, vcLst: VoiceList): void {
    for (const [key, v] of vcLst) {
        if (vod.stavesOverlap(key)) {
            v.setOverlap(true)
        }
    }
}

//---------------------------------------------------------
//   addBreak
//---------------------------------------------------------

function addBreak(score: Score, mb: MeasureBase, type: LayoutBreakType): void {
    void score
    const lb = Factory.createItem(ElementType.LAYOUT_BREAK, mb) as LayoutBreak
    lb.setLayoutBreakType(type)
    mb.add(lb)
}

//---------------------------------------------------------
//   addBreakToPreviousMeasureBase
//---------------------------------------------------------

function addBreakToPreviousMeasureBase(score: Score, mb: MeasureBase, type: LayoutBreakType): void {
    const pm = mb.prev()
    if (pm && musicXmlImportBreaks()) {
        addBreak(score, pm, type)
    }
}

//---------------------------------------------------------
//   addText
//---------------------------------------------------------

/**
 Add text \a strTxt to VBox \a vbx using Tid \a stl.
 */

function addText(vbx: VBox, score: Score, strTxt: string, stl: TextStyleType): void {
    void score
    if (strTxt) {
        const text = new Text(vbx, stl)
        text.setXmlText(trimmed(strTxt))
        vbx.add(text)
    }
}

function overrideTextStyleForComposer(creditString: string): boolean {
    // HACK: check if the string is likely to contain composer credit, so the proper text style can be applied.
    // TODO: introduce a flag to decide if we want to do this or not.
    const re = /\s*((Words|Music|Lyrics).*)*by\s+([A-Z][a-zA-Zö'’-]+\s[A-Z][a-zA-Zös'’-]+.*)+/
    return re.test(creditString)
}

//---------------------------------------------------------
//   addText2
//---------------------------------------------------------

/**
 Add text \a strTxt to VBox \a vbx using Tid \a stl.
 Also sets Align and Yoff.
 */

function addText2(vbx: VBox, score: Score, strTxt: string, stl: TextStyleType, align: Align): void {
    if (stl !== TextStyleType.COMPOSER && overrideTextStyleForComposer(strTxt)) {
        // HACK: in some Dolet 8 files the composer is written as a subtitle, which leads to stupid formatting.
        // This overrides the formatting and introduces proper composer text
        const text = new Text(vbx, TextStyleType.COMPOSER)
        text.setXmlText(trimmed(strTxt))
        text.setPropertyFlags(Pid.OFFSET, PropertyFlags.UNSTYLED)
        vbx.add(text)
    } else if (strTxt) {
        const text = new Text(vbx, stl)
        text.setXmlText(trimmed(strTxt))
        text.setAlign(align)
        text.setPropertyFlags(Pid.ALIGN, PropertyFlags.UNSTYLED)
        text.setPropertyFlags(Pid.OFFSET, PropertyFlags.UNSTYLED)
        vbx.add(text)
        if (stl === TextStyleType.TITLE) {
            scaleTitle(score, text)
        }
    }
}

//---------------------------------------------------------
//   findYMinYMaxInWords
//---------------------------------------------------------

function findYMinYMaxInWords(words: readonly CreditWords[]): { miny: number; maxy: number } {
    let miny = 0
    let maxy = 0

    if (!words.length) {
        return { miny, maxy }
    }

    miny = Math.trunc(words[0].defaultY)
    maxy = Math.trunc(words[0].defaultY)
    for (const w of words) {
        if (w.defaultY < miny) {
            miny = Math.trunc(w.defaultY)
        }
        if (w.defaultY > maxy) {
            maxy = Math.trunc(w.defaultY)
        }
    }
    return { miny, maxy }
}

//---------------------------------------------------------
//   alignForCreditWords
//---------------------------------------------------------

/** pageWidth is an int (C++ integer divisions) */
function alignForCreditWords(w: CreditWords, pageWidth: number, tid: TextStyleType): Align {
    const align = new Align(AlignH.LEFT)
    if (w.defaultX > Math.trunc(pageWidth / 3)) {
        if (w.defaultX < Math.trunc(2 * pageWidth / 3)) {
            align.horizontal = AlignH.HCENTER
        } else {
            align.horizontal = AlignH.RIGHT
        }
    }
    if (tid === TextStyleType.COMPOSER) {
        align.vertical = AlignV.BOTTOM
    }
    return align
}

//---------------------------------------------------------
//   creditWordTypeToTid
//---------------------------------------------------------

function creditWordTypeToTid(type: string): TextStyleType {
    if (type === 'composer') {
        return TextStyleType.COMPOSER
    } else if (type === 'lyricist') {
        return TextStyleType.LYRICIST
    } else if (type === 'subtitle') {
        return TextStyleType.SUBTITLE
    } else if (type === 'title') {
        return TextStyleType.TITLE
    } else {
        return TextStyleType.DEFAULT
    }
}

//---------------------------------------------------------
//   creditWordTypeGuess
//---------------------------------------------------------

function creditWordTypeGuess(word: CreditWords, words: readonly CreditWords[], pageWidth: number): TextStyleType {
    const pw1 = Math.trunc(pageWidth / 3)
    const pw2 = Math.trunc(pageWidth * 2 / 3)
    const defx = word.defaultX
    // composer is in the right column
    if (pw2 < defx) {
        // found composer
        return TextStyleType.COMPOSER
    } else if (defx < pw1) {
        // poet is in the left column
        // found poet/lyricist
        return TextStyleType.LYRICIST
    } else {
        // title is in the middle column
        // if another word in the middle column has a larger font size, this word is not the title
        for (const w of words) {
            if (w === word) {
                continue                 // it's me
            }
            if (w.defaultX < pw1 || pw2 < w.defaultX) {
                continue                 // it's not in the middle column
            }
            if (word.fontSize < w.fontSize) {
                return TextStyleType.SUBTITLE                  // word does not have the largest font size, assume subtitle
            }
        }
        return TextStyleType.TITLE                // no better title candidate found
    }
}

//---------------------------------------------------------
//   tidForCreditWords
//---------------------------------------------------------

function tidForCreditWords(word: CreditWords, words: readonly CreditWords[], pageWidth: number): TextStyleType {
    const tid = creditWordTypeToTid(word.type)
    if (tid !== TextStyleType.DEFAULT) {
        // type recognized, done
        return tid
    } else {
        // type not recognized, guess
        return creditWordTypeGuess(word, words, pageWidth)
    }
}

//---------------------------------------------------------
//   mustAddWordToVbox
//---------------------------------------------------------

// determine if specific types of credit words must be added: do not add copyright and page number,
// as these typically conflict with MuseScore's style and/or layout

function mustAddWordToVbox(creditType: string): boolean {
    return creditType !== 'rights' && creditType !== 'page number'
}

//---------------------------------------------------------
//   isLikelySubtitleText
//---------------------------------------------------------

export function isLikelySubtitleText(text: string, caseInsensitive = true): boolean {
    const f = caseInsensitive ? 'i' : ''
    const t = trimmed(text)
    return new RegExp('^[Ff]rom\\s+(?!$)', f).test(t)
           || new RegExp('^Theme from\\s+(?!$)', f).test(t)
           || new RegExp('(((Op\\.?\\s?\\d+)|(No\\.?\\s?\\d+))\\s?)+', f).test(t)
           || new RegExp('\\(.*[Ff]rom\\s.*\\)', f).test(t)
}

//---------------------------------------------------------
//   isLikelyCreditText
//---------------------------------------------------------

export function isLikelyCreditText(text: string, caseInsensitive = true): boolean {
    const f = caseInsensitive ? 'i' : ''
    const t = trimmed(text)
    return new RegExp('^((Words|Music|Lyrics|Composed),?(\\sand|\\s&amp;|\\s&)?\\s)*[Bb]y\\s+(?!$)', f).test(t)
           || new RegExp('^(Traditional|Trad\\.)', f).test(t)
}

function isLikelyRightsText(text: string): boolean {
    return text.toLowerCase().includes('all rights reserved') || text.includes('©')
}

//---------------------------------------------------------
//   inferSubTitleFromTitle
//---------------------------------------------------------

// Extracts a likely subtitle from the title string
// Returns the inferred subtitle

function inferFromTitle(title: { v: string }, inferredSubtitle: { v: string }, inferredCredits: { v: string }): void {
    const subtitleLines: string[] = []
    const creditLines: string[] = []
    const titleLines = title.v.split('\n')
    const nrOfTitleLines = titleLines.length
    if (nrOfTitleLines === 1) {
        return
    }
    for (let i = nrOfTitleLines; i > 0; --i) {
        const line = titleLines[i - 1]
        if (isLikelyCreditText(line, true)) {
            creditLines.unshift(line)
            titleLines.splice(i - 1, 1)
        } else if (isLikelySubtitleText(line, true)) {
            subtitleLines.unshift(line)
            titleLines.splice(i - 1, 1)
        }
    }
    title.v = titleLines.join('\n')
    inferredSubtitle.v = subtitleLines.join('\n')
    inferredCredits.v = creditLines.join('\n')
}

function resizeTitleBox(vbox: VBox): void {
    let calculatedVBoxHeight = 0
    const elist = vbox.el().slice()
    for (const e of elist) {
        scoreRendererHooks.layoutItem?.(e)
    }

    const padding = vbox.sizeIsSpatiumDependent() ? vbox.style().spatium() : vbox.style().defaultSpatium()

    for (const e of elist) {
        if (e.isText()) {
            const txt = e as Text
            const txtLD = txt.mutldata()

            const bbox = txtLD.bbox().clone()
            bbox.moveTop(0.0)
            txtLD.setBbox(bbox)
            calculatedVBoxHeight += txtLD.bbox().height() + padding
        }
    }

    const height = Spatium.fromMM(calculatedVBoxHeight, vbox.spatium())
    if (height.val() > (vbox.propertyDefault(Pid.BOX_HEIGHT) as Spatium).val()) {
        vbox.undoChangeProperty(Pid.BOX_HEIGHT, height)
    }
}

//---------------------------------------------------------
//   addCreditWords
//---------------------------------------------------------

function addCreditWords(score: Score, crWords: CreditWordsList, pageSize: SizeF, tick: Fraction, isSibeliusScore: boolean): VBox | null {
    let vbox: VBox | null = null
    const top = tick.isZero()

    const headerWords: CreditWords[] = []
    const footerWords: CreditWords[] = []
    for (const w of crWords) {
        if (w.page === 1) {
            // muse::Size is int: integer division
            if (w.defaultY > Math.trunc(pageSize.height() / 2)) {
                headerWords.push(w)
            } else {
                footerWords.push(w)
            }
        }
    }

    // if there are more credit words in the footer than in header,
    // swap header and footer, assuming this will result in a vertical
    // frame with the title on top of the page.
    // Sibelius (direct export) typically exports no header
    // and puts the title etc. in the footer
    const doSwap = footerWords.length > headerWords.length && isSibeliusScore
    let words: CreditWords[]
    if (top) {
        words = doSwap ? footerWords : headerWords
    } else {
        words = doSwap ? headerWords : footerWords
    }

    findYMinYMaxInWords(words)

    const pageWidth = Math.trunc(pageSize.width())
    for (const w of words) {
        if (mustAddWordToVbox(w.type)) {
            const tid = top ? tidForCreditWords(w, words, pageWidth) : TextStyleType.DEFAULT
            const align = alignForCreditWords(w, pageWidth, tid)
            if (!vbox) {
                const vBoxTick = top ? new Fraction(0, 1) : tick
                vbox = MusicXmlParserPass1.createAndAddVBoxForCreditWords(score, vBoxTick)
            }
            addText2(vbox, score, w.words, tid, align)
        } else if (w.type === 'rights' && !score.metaTag('copyright')) {
            // Add rights to footer, not a vbox
            const rights = w.words.replace(/(<.*?>)/g, '')
            score.setMetaTag('copyright', rights)
        }
    }

    if (vbox && !MScore.testMode) {
        // Correct size
        resizeTitleBox(vbox)
    }

    return vbox
}

//---------------------------------------------------------
//   determineMeasureStart
//---------------------------------------------------------

/**
 Determine the start ticks of each measure
 i.e. the sum of all previous measures length
 or start tick measure equals start tick previous measure plus length previous measure
 */

function determineMeasureStart(ml: readonly Fraction[], ms: Fraction[]): void {
    ms.length = ml.length
    for (let i = 0; i < ms.length; ++i) {
        ms[i] = ms[i] ?? new Fraction()
    }
    if (!(ms.length > 0)) {
        return      // no parts read
    }
    // first measure starts at t = 0
    ms[0] = new Fraction(0, 1)
    // all others start at start time previous measure plus length previous measure
    for (let i = 1; i < ml.length; i++) {
        ms[i] = ms[i - 1].plus(ml[i - 1])
    }
}

//---------------------------------------------------------
//   fixupSigmap
//---------------------------------------------------------

/**
 To enable error handling in pass2, ensure sigmap contains a valid entry at tick = 0.
 Required by TimeSigMap::tickValues(), called (indirectly) by Segment::add().
 */

function fixupSigmap(logger: MusicXmlLogger, score: Score, measureLength: readonly Fraction[]): void {
    if (!score.sigmap().has(0)) {
        // no valid timesig at tick = 0
        logger.logDebugInfo('no valid time signature at tick = 0')
        // use length of first measure instead time signature.
        // if there is no first measure, we probably don't care,
        // but set a default anyway.
        const tsig = !measureLength.length ? new Fraction(4, 4) : measureLength[0]
        score.sigmap().addSig(0, tsig)
    }
}

//---------------------------------------------------------
//   allStaffGroupsIdentical
//---------------------------------------------------------

/**
 Return true if all staves in Part \a p have the same staff group
 */

function allStaffGroupsIdentical(p: Part): boolean {
    for (let i = 1; i < p.nstaves(); ++i) {
        if (p.staff(0)!.constStaffType(new Fraction(0, 1)).group() !== p.staff(i)!.constStaffType(new Fraction(0, 1)).group()) {
            return false
        }
    }
    return true
}

//---------------------------------------------------------
//   isRedundantBracket
//---------------------------------------------------------

/**
 Return true if there is already an existing bracket
 with the same type and span.
 This prevents double brackets, which are sometimes exported
 by Dolet.
 */

function isRedundantBracket(staff: Staff, bracketType: BracketType, span: number): boolean {
    for (const bracket of staff.brackets()) {
        if (bracket.bracketType() === bracketType && bracket.bracketSpan() === span) {
            return true
        }
    }
    return false
}

//---------------------------------------------------------
//   text2syms
//---------------------------------------------------------

/** the map from symbol (Unicode) text to symId of the fallback font (cached per font, C++ builds it on every call) */
let s_text2symsCache: { font: object; map: Map<string, SymId>; maxStringSize: number } | null = null

/**
 Convert SMuFL code points to MuseScore <sym>...</sym>
 */

function text2syms(t: string): string {
    // first create a map from symbol (Unicode) text to symId
    const sf = engravingFonts().fallbackFont()
    if (!s_text2symsCache || s_text2symsCache.font !== sf) {
        const map = new Map<string, SymId>()
        let maxStringSize = 0          // maximum string size found

        for (let i = SymId.noSym as number; i < (SymId.lastSym as number); ++i) {
            const id = i as SymId
            const string = sf.toString(id)
            // insert all syms except space to prevent matching all regular spaces
            if (id !== SymId.space && !map.has(string)) {
                map.set(string, id)
            }
            if (string.length > maxStringSize) {
                maxStringSize = string.length
            }
        }
        s_text2symsCache = { font: sf, map, maxStringSize }
    }
    const { map, maxStringSize } = s_text2symsCache

    // then look for matches
    let inStr = t
    let res = ''

    while (inStr.length) {
        // try to find the largest match possible
        let maxMatch = Math.min(inStr.length, maxStringSize)
        let sym = ''
        while (maxMatch > 0) {
            const toBeMatched = inStr.slice(0, maxMatch)
            const id = map.get(toBeMatched)
            if (id !== undefined) {
                sym = SymNames.nameForSymId(id)
                break
            }
            maxMatch--
        }
        if (maxMatch > 0) {
            // found a match, add sym to res and remove match from string in
            res += '<sym>'
            res += sym
            res += '</sym>'
            inStr = inStr.slice(maxMatch)
        } else {
            // not found, move one char from res to in
            res += inStr.slice(0, 1)
            inStr = inStr.slice(1)
        }
    }

    return res
}

//---------------------------------------------------------
//   nextPartOfFormattedString
//---------------------------------------------------------

// TODO: probably should be shared between pass 1 and 2

/**
 Read the next part of a MusicXML formatted string and convert to MuseScore internal encoding.
 */

function nextPartOfFormattedString(e: XmlStreamReader): string {
    const fontWeight = e.attribute('font-weight')
    const fontSize = e.attribute('font-size')
    const fontStyle = e.attribute('font-style')
    let underline = e.attribute('underline')
    const strike = e.attribute('line-through')
    const fontFamily = e.attribute('font-family')
    // TODO: color, enclosure, yoffset in only part of the text, ...

    let txt = e.readText()
    // replace HTML entities
    txt = decodeXmlEntities(txt)
    const syms = text2syms(txt)
    if (overrideTextStyleForComposer(syms)) {
        return syms
    }

    let importedtext = ''

    if (fontSize) {
        const ok = { v: true }
        const size = Math.fround(strToDouble(fontSize, ok))
        if (ok.v) {
            importedtext += `<font size="${numberToString(size)}"/>`
        }
    }

    const needUseDefaultFont = configuration().needUseDefaultFont()
    if (fontFamily && txt === syms && !needUseDefaultFont) {
        // add font family only if no <sym> replacement made
        importedtext += `<font face="${fontFamily}"/>`
    }
    if (fontWeight === 'bold') {
        importedtext += '<b>'
    }
    if (fontStyle === 'italic') {
        importedtext += '<i>'
    }
    if (underline) {
        const ok = { v: true }
        const lines = strToInt(underline, ok)
        if (ok.v && (lines > 0)) {    // 1, 2, or 3 underlines are imported as single underline
            importedtext += '<u>'
        } else {
            underline = ''
        }
    }
    if (strike) {
        const ok = { v: true }
        const lines = strToInt(strike, ok)
        if (ok.v && (lines > 0)) {    // 1, 2, or 3 strikes are imported as single strike
            importedtext += '<s>'
        } else {
            underline = ''
        }
    }
    if (txt === syms) {
        txt = txt.split('\r').join('')     // convert Windows line break \r\n -> \n
        importedtext += toXmlEscaped(txt)
    } else {
        // <sym> replacement made, should be no need for line break or other conversions
        importedtext += syms
    }
    if (strike) {
        importedtext += '</s>'
    }
    if (underline) {
        importedtext += '</u>'
    }
    if (fontStyle === 'italic') {
        importedtext += '</i>'
    }
    if (fontWeight === 'bold') {
        importedtext += '</b>'
    }
    return importedtext
}

//---------------------------------------------------------
//   isTitleFrameStyle
//---------------------------------------------------------

/**
 Determine if tid is a style type used in a title frame
 */

function isTitleFrameStyle(tid: TextStyleType): boolean {
    return tid === TextStyleType.TITLE
           || tid === TextStyleType.SUBTITLE
           || tid === TextStyleType.COMPOSER
           || tid === TextStyleType.LYRICIST
}

//---------------------------------------------------------
//   isHarpDiagramStyle
//---------------------------------------------------------

/**
 Determine if tid is a style type used in a harp pedal diagram
 */

function isHarpPedalStyle(tid: TextStyleType): boolean {
    return tid === TextStyleType.HARP_PEDAL_DIAGRAM || tid === TextStyleType.HARP_PEDAL_TEXT_DIAGRAM
}

//---------------------------------------------------------
//   updateStyles
//---------------------------------------------------------

/**
 Update the style definitions to match the MusicXML word-font and lyric-font.
 */

function updateStyles(score: Score, wordFamily: string, wordSize: string, lyricFamily: string, lyricSize: string): void {
    const dblWordSize = strToDouble(wordSize)     // note conversion error results in value 0.0
    const dblLyricSize = strToDouble(lyricSize)   // but avoid comparing (double) floating point number with exact value later
    const epsilon = 0.001                       // use epsilon instead

    const needUseDefaultFont = configuration().needUseDefaultFont()

    // loop over all text styles (except the empty, always hidden, first one)
    // set all text styles to the MusicXML defaults
    for (const tid of allTextStyles()) {
        // The MusicXML specification does not specify to which kinds of text
        // the word-font setting applies. Setting all sizes to the size specified
        // gives bad results, so a selection is made:
        // Only apply word-font style when "Apply default typeface" is unchecked
        // exclude lyrics odd and even lines (handled separately),
        // Roman numeral analysis and harp pedal diagrams (special case, leave untouched)
        // and text types used in the title frame
        // Some further tweaking may still be required.

        if (tid === TextStyleType.LYRICS_ODD || tid === TextStyleType.LYRICS_EVEN
            || tid === TextStyleType.FRET_DIAGRAM_FINGERING || tid === TextStyleType.FRET_DIAGRAM_FRET_NUMBER
            || tid === TextStyleType.TAB_FRET_NUMBER) {
            continue
        }

        const needUseDefaultSize = configuration().needUseDefaultFont() || tid === TextStyleType.HARMONY_ROMAN
                                   || tid === TextStyleType.HAMMER_ON_PULL_OFF
                                   || isTitleFrameStyle(tid)
                                   || isHarpPedalStyle(tid)

        const ts = textStyle(tid)
        if (!ts) {
            continue
        }
        for (const a of ts) {
            if (a.pid === Pid.FONT_FACE && !needUseDefaultFont) {
                score.style().set(a.sid, wordFamily)
            } else if (a.pid === Pid.FONT_SIZE && dblWordSize > epsilon && !needUseDefaultSize) {
                score.style().set(a.sid, dblWordSize)
            }
        }
    }

    // handle lyrics odd and even lines separately
    if (!needUseDefaultFont) {
        score.style().set(Sid.lyricsOddFontFace, lyricFamily)
        score.style().set(Sid.lyricsEvenFontFace, lyricFamily)
    }
    if (dblLyricSize > epsilon) {
        score.style().set(Sid.lyricsOddFontSize, dblLyricSize)
        score.style().set(Sid.lyricsEvenFontSize, dblLyricSize)
    }
}

//---------------------------------------------------------
//   setPageFormat
//---------------------------------------------------------

function setPageFormat(score: Score, pf: PageFormat): void {
    score.style().set(Sid.pageWidth, pf.size.width())
    score.style().set(Sid.pageHeight, pf.size.height())
    score.style().set(Sid.pagePrintableWidth, pf.printableWidth)
    score.style().set(Sid.pageEvenLeftMargin, pf.evenLeftMargin)
    score.style().set(Sid.pageOddLeftMargin, pf.oddLeftMargin)
    score.style().set(Sid.pageEvenTopMargin, pf.evenTopMargin)
    score.style().set(Sid.pageEvenBottomMargin, pf.evenBottomMargin)
    score.style().set(Sid.pageOddTopMargin, pf.oddTopMargin)
    score.style().set(Sid.pageOddBottomMargin, pf.oddBottomMargin)
    score.style().set(Sid.pageTwosided, pf.twosided)
}

function scaleText(str: string, fontFaceSid: Sid, fontSize: number, score: Score): number {
    // Scale text to fit within margins
    const style = score.style()
    const fontFace = String(style.styleV(fontFaceSid))
    const font = new Font(fontFace, Font.Type.Unknown)
    font.setPointSizeF(fontSize)
    const fm = new FontMetrics(font)

    const pagePrintableWidth = (style.styleV(Sid.pagePrintableWidth) as number) * DPI

    let longestLine = 0.0
    for (const line of str.split('\n')) {
        const textWidth = fm.boundingRect(line).width()
        longestLine = Math.max(longestLine, textWidth)
    }

    return pagePrintableWidth / longestLine
}

function scaleCopyrightText(score: Score): void {
    const copyright = score.metaTag('copyright')
    if (!copyright) {
        return
    }

    const fontSize = score.style().styleV(Sid.copyrightFontSize) as number
    const sizeRatio = scaleText(copyright, Sid.copyrightFontFace, fontSize, score)

    if (sizeRatio < 1) {
        const newSize = Math.floor(fontSize * sizeRatio * 10) / 10
        score.style().set(Sid.copyrightFontSize, newSize)
    }
}

function scaleTitle(score: Score, t: Text): void {
    const title = score.metaTag('workTitle')
    if (!title) {
        return
    }

    const fontSize = score.style().styleV(Sid.titleFontSize) as number
    const sizeRatio = scaleText(title, Sid.titleFontFace, fontSize, score)

    if (sizeRatio < 1) {
        const newSize = Math.floor(fontSize * sizeRatio * 10) / 10
        // Need to layout text to generate fragments before changing its size
        // (C++ TLayout::layoutText(t, t->mutldata()))
        scoreRendererHooks.layoutItem?.(t)
        t.setProperty(Pid.FONT_SIZE, newSize)
        t.setPropertyFlags(Pid.FONT_SIZE, PropertyFlags.UNSTYLED)
    }
}

//---------------------------------------------------------
//   createPart
//---------------------------------------------------------

/**
 Create the part, set its \a id and insert it in PartMap \a pm.
 Part name (if any) will be set later.
 */

function createPart(score: Score, id: string, pm: PartMap): void {
    const part = new Part(score)
    pm.insert(id, part)
    score.appendPart(part)
    const staff = Factory.createStaff(part)
    score.appendStaff(staff)
}

//---------------------------------------------------------
//   partGroupStart
//---------------------------------------------------------

/**
 Store part-group start with number \a n, first part \a p and symbol / \a s in the partGroups
 map \a pgs for later reference, as at this time insufficient information is available to be able
 to generate the brackets.
 */

function partGroupStart(pgs: MusicXmlPartGroupMap, n: number, p: number, s: string, barlineSpan: boolean, color: Color): void {
    if (pgs.count(n) > 0) {
        // part-group number already active
        return
    }

    let bracketType = BracketType.NO_BRACKET
    if (!s) {
        // ignore (handle as NO_BRACKET)
    } else if (s === 'none') {
        // already set to NO_BRACKET
    } else if (s === 'brace') {
        bracketType = BracketType.BRACE
    } else if (s === 'bracket') {
        bracketType = BracketType.NORMAL
    } else if (s === 'line') {
        bracketType = BracketType.LINE
    } else if (s === 'square') {
        bracketType = BracketType.SQUARE
    } else {
        // part-group symbol not supported
        return
    }

    const pg = new MusicXmlPartGroup()
    pg.span = 0
    pg.start = p
    pg.barlineSpan = barlineSpan
    pg.type = bracketType
    if (color.isValid()) {
        pg.color = color
    }
    pg.column = n
    pgs.set(n, pg)
}

//---------------------------------------------------------
//   partGroupStop
//---------------------------------------------------------

/**
 Handle part-group stop with number \a n and part \a p.

 For part group n, the start part, span (in parts) and type are now known.
 To generate brackets, the span in staves must also be known.
 */

function partGroupStop(pgs: MusicXmlPartGroupMap, n: number, p: number, pgl: MusicXmlPartGroupList): void {
    const pg = pgs.get(n)
    if (!pg) {
        // part-group number not active
        return
    }

    pg.span = p - pg.start
    pgl.push(pg)
    pgs.erase(n)
}

//---------------------------------------------------------
//   setNumberOfStavesForPart
//---------------------------------------------------------

/**
 Set number of staves for part \a partId to the max value
 of the current value \a staves.
 Also handle HideMode.
 */

function setNumberOfStavesForPart(part: Part | null, staves: number): void {
    if (!part) {
        return
    }

    const prevnstaves = part.nstaves()
    if (staves > part.nstaves()) {
        part.setStaves(staves)
    }
    if (staves !== 0 && prevnstaves !== 1 && prevnstaves !== staves) {
        // A "staves" value different from the existing nstaves means
        // staves in a part will sometimes be hidden.
        // We can approximate this in the following way:
        part.setHideStavesWhenIndividuallyEmpty(true)
    }
}

//---------------------------------------------------------
//   measureDurationAsFraction
//---------------------------------------------------------

/**
 Determine a suitable measure duration value given the time signature
 by setting the duration denominator to be greater than or equal
 to the time signature denominator
 */

function measureDurationAsFraction(length: Fraction, tsigtype: number): Fraction {
    if (tsigtype <= 0) {
        // invalid tsigtype
        return length
    }

    let res = length
    while (res.denominator() < tsigtype) {
        res = new Fraction(res.numerator() * 2, res.denominator() * 2)
    }
    return res
}

//---------------------------------------------------------
//   determineTimeSig
//---------------------------------------------------------

/**
 Determine the time signature based on \a beats, \a beatType and \a timeSymbol.
 Sets return parameters \a st, \a bts, \a btp.
 Return true if OK, false on error.
 */

// TODO: share between pass 1 and pass 2

function determineTimeSig(logger: MusicXmlLogger, xmlreader: XmlStreamReader, beats: string, beatType: string, timeSymbol: string,
    st: { v: TimeSigType }, bts: { v: number }, btp: { v: number }): boolean {
    // initialize
    st.v = TimeSigType.NORMAL
    bts.v = 0               // the beats (max 4 separated by "+") as integer
    btp.v = 0               // beat-type as integer
    // determine if timesig is valid
    if (timeSymbol === 'cut') {
        st.v = TimeSigType.ALLA_BREVE
    } else if (timeSymbol === 'common') {
        st.v = TimeSigType.FOUR_FOUR
    } else if (timeSymbol && timeSymbol !== 'normal') {
        logger.logError(`time symbol '${timeSymbol}' not recognized`, xmlreader)
        return false
    }

    btp.v = strToInt(beatType)
    const list = beats.split('+')
    for (const s of list) {
        bts.v += strToInt(s)
    }

    // determine if bts and btp are valid
    if (bts.v <= 0 || btp.v <= 0) {
        logger.logError(`beats=${beats} and/or beat-type=${beatType} not recognized`, xmlreader)
        return false
    }

    return true
}

//---------------------------------------------------------
//   voiceToInt
//---------------------------------------------------------

function voiceStrIndex(v: string): number {
    if (!v) {
        return 0
    }
    return v.charCodeAt(0)
}

//---------------------------------------------------------
//   MusicXmlParserPass1
//---------------------------------------------------------

export class MusicXmlParserPass1 {
    // generic pass 1 data
    m_e = new XmlStreamReader()
    m_exporterSoftware = MusicXmlExporterSoftware.OTHER   // Software which exported the file
    m_divs = 0                              // Current MusicXML divisions value
    m_parts = new StringMap<MusicXmlPart>()      // Parts data, mapped on part id
    m_systemStartMeasureNrs = new Set<number>()       // Measure numbers of measures starting a page
    m_pageStartMeasureNrs = new Set<number>()         // Measure numbers of measures starting a page
    m_measureLength: Fraction[] = []       // Length of each measure
    m_measureStart: Fraction[] = []        // Start time of each measure
    m_credits: CreditWordsList = []                   // All credits collected
    m_partMap: PartMap = new StringMap<Part>()                           // TODO merge into MusicXmlPart ??
    m_instruments = new StringMap<MusicXmlInstruments>()   // instruments for each part, mapped on part id
    m_score: Score                    // MuseScore score
    m_logger: MusicXmlLogger              // Error logger
    m_errors = ''                             // Errors to present to the user
    m_hasBeamingInfo = false               // Whether the score supports or contains beaming info
    m_hasInferredHeaderText = false

    // part specific data (TODO: move to part-specific class)
    m_timeSigDura = new Fraction()                      // Measure duration according to last timesig read
    m_octaveShifts = new IntMap<MusicXmlOctaveShiftDesc>()   // Pending octave-shifts
    m_pageSize = new SizeF()                             // Page width read from defaults (C++ muse::Size: ints)

    readonly m_maxDiff = 5                   // Duration rounding tick threshold;
    m_adjustedDurations = new FractionMap<Fraction>()  // Rounded durations
    m_seenDenominators = new Set<number>()          // Denominators seen. Used for rounding errors.

    constructor(score: Score, logger: MusicXmlLogger) {
        this.m_score = score
        this.m_logger = logger
    }

    /** C++ m_parts[id]: the part data, default constructed and inserted if missing */
    private mxPart(id: string): MusicXmlPart {
        let p = this.m_parts.get(id)
        if (!p) {
            p = new MusicXmlPart()
            this.m_parts.set(id, p)
        }
        return p
    }

    /** C++ m_instruments[id]: default constructed and inserted if missing */
    private instruments(id: string): MusicXmlInstruments {
        let p = this.m_instruments.get(id)
        if (!p) {
            p = new MusicXmlInstruments()
            this.m_instruments.set(id, p)
        }
        return p
    }

    //---------------------------------------------------------
    //   addError
    //---------------------------------------------------------

    addError(error: string): void {
        if (error) {
            this.m_logger.logError(error, this.m_e)
            this.m_errors += errorStringWithLocation(this.m_e.byteOffset(), error) + '\n'
        }
    }

    setExporterSoftware(exporter: string): void {
        if (exporter.includes('sibelius')) {
            if (exporter.includes('dolet 6')) {
                this.m_exporterSoftware = MusicXmlExporterSoftware.DOLET6
            } else if (exporter.includes('dolet 8')) {
                this.m_exporterSoftware = MusicXmlExporterSoftware.DOLET8
            } else {
                this.m_exporterSoftware = MusicXmlExporterSoftware.SIBELIUS
            }
        } else if (exporter.includes('dorico')) {
            this.m_exporterSoftware = MusicXmlExporterSoftware.DORICO
        } else if (exporter.includes('finale')) {
            this.m_exporterSoftware = MusicXmlExporterSoftware.FINALE
        } else if (exporter.includes('noteflight')) {
            this.m_exporterSoftware = MusicXmlExporterSoftware.NOTEFLIGHT
        }
    }

    setExporterStyles(): void {
        // If exporters have different default styles to MuseScore, assume they are being used here
        if (this.sibOrDolet()) {
            this.m_score.style().set(Sid.fretFrets, 5)
        }
    }

    //---------------------------------------------------------
    //   initPartState
    //---------------------------------------------------------

    /**
     Initialize members as required for reading the MusicXML part element.
     TODO: factor out part reading into a separate class
     TODO: preferably use automatically initialized variables
     */

    initPartState(partId: string): void {
        void partId
        this.m_timeSigDura = new Fraction(0, 0)         // invalid
        this.m_octaveShifts.clear()
    }

    //---------------------------------------------------------
    //   determineMeasureLength
    //---------------------------------------------------------

    /**
     Determine the length in ticks of each measure in all parts.
     Return false on error.
     */

    determineMeasureLength(ml: Fraction[]): boolean {
        ml.length = 0

        // determine number of measures: max number of measures in any part
        let nMeasures = 0
        for (const [, part] of this.m_parts) {
            if (part.nMeasures() > nMeasures) {
                nMeasures = part.nMeasures()
            }
        }

        // determine max length of a specific measure in all parts
        for (let i = 0; i < nMeasures; ++i) {
            let maxMeasDur = new Fraction()
            for (const [, part] of this.m_parts) {
                if (i < part.nMeasures()) {
                    const measDurPartJ = part.measureDuration(i)
                    if (measDurPartJ.gt(maxMeasDur)) {
                        maxMeasDur = measDurPartJ
                    }
                }
            }
            ml.push(maxMeasDur)
        }
        return true
    }

    //---------------------------------------------------------
    //   getVoiceList
    //---------------------------------------------------------

    /**
     Get the VoiceList for part \a id.
     Return an empty VoiceList on error.
     */

    getVoiceList(id: string): VoiceList {
        const p = this.m_parts.get(id)
        if (p) {
            return p.voicelist.clone()
        }
        return new VoiceList()
    }

    //---------------------------------------------------------
    //   getInstrList
    //---------------------------------------------------------

    /**
     Get the MusicXmlInstrList for part \a id.
     Return an empty MusicXmlInstrList on error.
     */

    getInstrList(id: string): MusicXmlInstrList {
        const p = this.m_parts.get(id)
        if (p) {
            return p._instrList.clone()
        }
        return new MusicXmlInstrList()
    }

    //---------------------------------------------------------
    //   getIntervals
    //---------------------------------------------------------

    /**
     Get the MusicXmlIntervalList for part \a id.
     Return an empty MusicXmlIntervalList on error.
     */

    getIntervals(id: string): MusicXmlIntervalList {
        const p = this.m_parts.get(id)
        if (p) {
            return p._intervals.clone()
        }
        return new MusicXmlIntervalList()
    }

    //---------------------------------------------------------
    //   setDrumsetDefault
    //---------------------------------------------------------

    /**
     Set default notehead, line and stem direction
     for instrument \a instrId in part \a id.
     Called from pass 2, notehead, line and stemDirection are not read in pass 1.
     */

    setDrumsetDefault(id: string, instrId: string, hg: NoteHeadGroup, line: number, sd: DirectionV): void {
        const instr = this.m_instruments.get(id)?.get(instrId)
        if (instr) {
            instr.notehead = hg
            instr.line = line
            instr.stemDirection = sd
        }
    }

    //---------------------------------------------------------
    //   determineStaffMoveVoice
    //---------------------------------------------------------

    /**
     For part \a id, determine MuseScore (ms) staffmove, track and voice from MusicXML (mx) staff and voice
     MusicXML staff is 0 for the first staff, 1 for the second.
     Note: track is the first track of the ms staff in the score, add ms voice for elements in a voice
     Return true if OK, false on error
     TODO: finalize
     */

    determineStaffMoveVoice(id: string, mxStaff: number, mxVoice: number, msMove: { v: number }, msTrack: { v: number },
        msVoice: { v: number }): boolean {
        const p = this.m_parts.get(id)
        msMove.v = 0   // TODO
        msTrack.v = 0   // TODO
        msVoice.v = 0   // TODO

        // MusicXML voices are counted for all staves of an
        // instrument. They are not limited. In mscore voices are associated
        // with a staff. Every staff can have at most VOICES voices.

        // The following lines map MusicXML voices to mscore voices.
        // If a voice crosses two staves, this is expressed with the
        // "move" parameter in mscore.

        // MusicXML voices are unique within a part, but not across parts.

        const vd = p?.voicelist.get(mxVoice) ?? new VoiceDesc()   // muse::value(voicelist, mxVoice)
        let s: number   // staff mapped by voice mapper
        let v: number   // voice mapped by voice mapper
        if (vd.overlaps()) {
            // for overlapping voices, the staff does not change
            // and the voice is mapped and staff-dependent
            s = mxStaff
            v = vd.voice(s)
        } else {
            // for non-overlapping voices, both staff and voice are
            // set by the voice mapper
            s = vd.staff()
            v = vd.voice()
        }

        if (s < 0 || v < 0) {
            // too many voices
            return false
        }

        msMove.v = mxStaff - s
        msVoice.v = v

        // make score-relative instead on part-relative
        const part = this.m_partMap.get(id)
        if (!part) {
            return false
        }
        const scoreRelStaff = this.m_score.staffIdxOfPart(part)   // zero-based number of parts first staff in the score
        msTrack.v = (scoreRelStaff + s) * VOICES

        // note: relStaff is the staff number relative to the parts first staff
        //       voice is the voice number in the staff

        return true
    }

    //---------------------------------------------------------
    //   hasPart
    //---------------------------------------------------------

    /**
     Check if part \a id is found.
     */

    hasPart(id: string): boolean {
        return this.m_parts.has(id)
    }

    //---------------------------------------------------------
    //   trackForPart
    //---------------------------------------------------------

    /**
     Return the (score relative) track number for the first staff of part \a id.
     */

    trackForPart(id: string): track_idx_t {
        const part = this.m_partMap.get(id)
        if (!part) {
            return -1
        }
        const scoreRelStaff = this.m_score.staffIdxOfPart(part)   // zero-based number of parts first staff in the score
        return scoreRelStaff * VOICES
    }

    //---------------------------------------------------------
    //   getMeasureStart
    //---------------------------------------------------------

    /**
     Return the measure start time for measure \a i.
     */

    getMeasureStart(i: number): Fraction {
        if (i < this.m_measureStart.length) {
            return this.m_measureStart[i]
        } else {
            return new Fraction(0, 0)           // invalid
        }
    }

    //---------------------------------------------------------
    //   octaveShift
    //---------------------------------------------------------

    /**
     Return the octave shift for part \a id in \a staff at \a f.
     */

    octaveShift(id: string, staff: staff_idx_t, f: Fraction): number {
        const p = this.m_parts.get(id)
        if (p) {
            return p.octaveShift(staff, f)
        }

        return 0
    }

    //---------------------------------------------------------
    //   skipLogCurrElem
    //---------------------------------------------------------

    /**
     Skip the current element, log debug as info.
     */

    skipLogCurrElem(): void {
        this.m_logger.logDebugInfo(`skipping '${this.m_e.name()}'`, this.m_e)
        this.m_e.skipCurrentElement()
    }

    //---------------------------------------------------------
    //   createAndAddVBoxForCreditWords
    //---------------------------------------------------------

    static createAndAddVBoxForCreditWords(score: Score, tick: Fraction): VBox {
        const vbox = Factory.createTitleVBox(scoreDummy(score).system())
        vbox.setTick(tick)
        score.measures().append(vbox)
        return vbox
    }

    //---------------------------------------------------------
    //   createDefaultHeader
    //---------------------------------------------------------

    createDefaultHeader(score: Score): void {
        const strTitle = { v: '' }
        let strSubTitle = ''
        const inferredStrSubTitle = { v: '' }
        const inferredStrComposer = { v: '' }
        let strComposer = ''
        let strLyricist = ''
        let strTranslator = ''

        if (!(!score.metaTag('movementTitle') && !score.metaTag('workTitle'))) {
            strTitle.v = score.metaTag('movementTitle')
            if (!strTitle.v) {
                strTitle.v = score.metaTag('workTitle')
            }
            inferFromTitle(strTitle, inferredStrSubTitle, inferredStrComposer)
        }
        if (!(!score.metaTag('movementNumber') && !score.metaTag('workNumber'))) {
            strSubTitle = score.metaTag('movementNumber')
            if (!strSubTitle) {
                strSubTitle = score.metaTag('workNumber')
            }
        }
        if (inferredStrSubTitle.v) {
            strSubTitle = inferredStrSubTitle.v
            this.m_hasInferredHeaderText = true
        }
        const metaComposer = score.metaTag('composer')
        let metaLyricist = score.metaTag('lyricist')
        const metaTranslator = score.metaTag('translator')
        if (metaComposer) {
            strComposer = metaComposer
        }
        if (inferredStrComposer.v) {
            strComposer = inferredStrComposer.v
            this.m_hasInferredHeaderText = true
        }
        if (!metaLyricist) {
            metaLyricist = score.metaTag('poet')
        }
        if (metaLyricist) {
            strLyricist = metaLyricist
        }
        if (metaTranslator) {
            strTranslator = metaTranslator
        }

        const vbox = MusicXmlParserPass1.createAndAddVBoxForCreditWords(score, new Fraction(0, 1))
        vbox.setExcludeFromOtherParts(false)
        addText(vbox, score, toXmlEscaped(strTitle.v), TextStyleType.TITLE)
        addText(vbox, score, toXmlEscaped(strSubTitle), TextStyleType.SUBTITLE)
        addText(vbox, score, toXmlEscaped(strComposer), TextStyleType.COMPOSER)
        addText(vbox, score, toXmlEscaped(strLyricist), TextStyleType.LYRICIST)
        addText(vbox, score, toXmlEscaped(strTranslator), TextStyleType.TRANSLATOR)
    }

    //---------------------------------------------------------
    //   createMeasuresAndVboxes
    //---------------------------------------------------------

    /**
     Create required measures with correct number, start tick and length for Score \a score.
     */

    createMeasuresAndVboxes(score: Score, ml: readonly Fraction[], ms: readonly Fraction[], systemStartMeasureNrs: ReadonlySet<number>,
        pageStartMeasureNrs: ReadonlySet<number>, crWords: CreditWordsList, pageSize: SizeF): void {
        if (!crWords.length) {
            this.createDefaultHeader(score)
        }

        let pageNr = 0
        for (let i = 0; i < ml.length; ++i) {
            let vbox: VBox | null = null

            // add a header vbox if the this measure is the first in the score or the first on a new page
            if (pageStartMeasureNrs.has(i) || i === 0) {
                ++pageNr

                if (pageNr === 1) {
                    vbox = addCreditWords(score, crWords, pageSize, new Fraction(0, 0), this.sibOrDolet())
                    if (i === 0 && vbox) {
                        vbox.setExcludeFromOtherParts(false)
                    }
                }
            }

            // create and add the measure
            const measure = Factory.createItem(ElementType.MEASURE, scoreDummy(score).system()) as Measure
            measure.setTick(ms[i])
            measure.setTicks(ml[i])
            measure.setNo(i)
            score.measures().append(measure)

            // add break to previous measure or vbox
            let mb: MeasureBase | null = vbox
            if (!mb) {
                mb = measure
            }
            if (pageStartMeasureNrs.has(i)) {
                addBreakToPreviousMeasureBase(score, mb, LayoutBreakType.PAGE)
            } else if (systemStartMeasureNrs.has(i)) {
                addBreakToPreviousMeasureBase(score, mb, LayoutBreakType.LINE)
            }

            // add a footer vbox if the next measure is on a new page or end of score has been reached
            if ((pageStartMeasureNrs.has(i + 1) || i === (ml.length - 1)) && pageNr === 1) {
                addCreditWords(score, crWords, pageSize, measure.endTick(), this.sibOrDolet())
            }
        }
    }

    sibOrDolet(): boolean {
        return this.m_exporterSoftware === MusicXmlExporterSoftware.SIBELIUS || this.dolet()
    }

    dolet(): boolean {
        return this.m_exporterSoftware === MusicXmlExporterSoftware.DOLET6 || this.m_exporterSoftware === MusicXmlExporterSoftware.DOLET8
    }

    //---------------------------------------------------------
    //   parse
    //---------------------------------------------------------

    /**
     parse(data): Parse MusicXML in \a device and extract pass 1 data.
     parse(): Start the parsing process, after verifying the top-level node is score-partwise
     */

    parse(data?: Uint8Array | string): Err {
        if (data === undefined) {
            return this.parseTopLevel()
        }
        this.m_logger.logDebugTrace('MusicXmlParserPass1::parse device')
        this.m_parts.clear()
        this.m_e.setData(data)
        const res = this.parseTopLevel()
        if (res !== Err.NoError) {
            return res
        }

        // Determine the start tick of each measure in the part
        this.determineMeasureLength(this.m_measureLength)
        determineMeasureStart(this.m_measureLength, this.m_measureStart)
        // Fixup timesig at tick = 0 if necessary
        fixupSigmap(this.m_logger, this.m_score, this.m_measureLength)
        // Create the measures
        this.createMeasuresAndVboxes(this.m_score, this.m_measureLength, this.m_measureStart, this.m_systemStartMeasureNrs,
            this.m_pageStartMeasureNrs, this.m_credits, this.m_pageSize)

        return res
    }

    /** C++ parse() */
    private parseTopLevel(): Err {
        this.m_logger.logDebugTrace('MusicXmlParserPass1::parse')

        let found = false
        while (this.m_e.readNextStartElement()) {
            if (this.m_e.name() === 'score-partwise') {
                found = true
                this.scorePartwise()
            } else {
                this.m_logger.logError(`this is not a MusicXML score-partwise file (top-level node '${this.m_e.name()}')`, this.m_e)
                this.m_e.skipCurrentElement()
                return Err.FileBadFormat
            }
        }

        if (!found) {
            this.m_logger.logError('this is not a MusicXML score-partwise file, node <score-partwise> not found', this.m_e)
            if (this.m_e.errorString()) {
                this.m_errors += errorStringWithLocation(this.m_e.byteOffset(), this.m_e.errorString()) + '\n'
            }
            return Err.FileBadFormat
        }

        return Err.NoError
    }

    //---------------------------------------------------------
    //   scorePartwise
    //---------------------------------------------------------

    /**
     Parse the MusicXML top-level (XPath /score-partwise) node.
     */

    scorePartwise(): void {
        this.m_logger.logDebugTrace('MusicXmlParserPass1::scorePartwise', this.m_e)

        const partGroupList: MusicXmlPartGroupList = []

        while (this.m_e.readNextStartElement()) {
            if (this.m_e.name() === 'part') {
                this.part()
            } else if (this.m_e.name() === 'part-list') {
                this.partList(partGroupList)
            } else if (this.m_e.name() === 'work') {
                while (this.m_e.readNextStartElement()) {
                    if (this.m_e.name() === 'work-number') {
                        this.m_score.setMetaTag('workNumber', this.m_e.readText())
                    } else if (this.m_e.name() === 'work-title') {
                        this.m_score.setMetaTag('workTitle', this.m_e.readText())
                    } else {
                        this.skipLogCurrElem()
                    }
                }
            } else if (this.m_e.name() === 'identification') {
                this.identification()
            } else if (this.m_e.name() === 'defaults') {
                this.defaults()
            } else if (this.m_e.name() === 'movement-number') {
                this.m_score.setMetaTag('movementNumber', this.m_e.readText())
            } else if (this.m_e.name() === 'movement-title') {
                this.m_score.setMetaTag('movementTitle', this.m_e.readText())
            } else if (this.m_e.name() === 'credit') {
                this.credit(this.m_credits)
            } else {
                this.skipLogCurrElem()
            }
        }

        // add brackets where required

        // set of (typically multi-staff) parts containing one or more explicit brackets
        // spanning only that part: these won't get an implicit brace later
        // e.g. a two-staff piano part with an explicit brace
        const partSet = new Set<Part>()

        // handle the explicit brackets
        const il = this.m_score.parts()
        for (const pg of partGroupList) {
            // determine span in staves
            // and span all barlines except last if applicable
            let stavesSpan = 0
            for (let j = 0; j < pg.span; j++) {
                const spannedPart = il[pg.start + j]
                stavesSpan += spannedPart.nstaves()

                if (!pg.barlineSpan) {
                    continue
                }

                const staves = spannedPart.staves()
                for (const spannedStaff of staves) {
                    if ((j === pg.span - 1) && (spannedStaff === staves[staves.length - 1])) {
                        // Very last staff of group,
                        continue
                    }

                    spannedStaff.setBarLineSpan(true)
                }
            }
            // add bracket and set the span
            // TODO: use group-symbol default-x to determine horizontal order of brackets
            const staff = il[pg.start].staff(0)!
            if (pg.type !== BracketType.NO_BRACKET && !isRedundantBracket(staff, pg.type, stavesSpan)) {
                staff.setBracketType(pg.column, pg.type)
                staff.setBracketSpan(pg.column, stavesSpan)
                if ((staff.brackets().length > pg.column) && pg.color.isValid()) {
                    const bracketItem: BracketItem = staff.brackets()[pg.column]
                    bracketItem.setColor(pg.color)
                }
                // add part to set (skip implicit bracket later)
                if (pg.span === 1) {
                    partSet.add(il[pg.start])
                }
            }

            const score = staff.score()
            if (!staff.isSystemObjectStaff() && this.exporterSoftware() === MusicXmlExporterSoftware.FINALE
                && configuration().inferTextType()) {
                score.addSystemObjectStaff(staff)
            }
        }

        // handle the implicit brackets:
        // multi-staff parts w/o explicit brackets get a brace
        for (const p of il) {
            if (p.nstaves() > 1 && !partSet.has(p)) {
                const column = p.staff(0)!.bracketLevels() + 1
                p.staff(0)!.setBracketType(column, BracketType.BRACE)
                p.staff(0)!.setBracketSpan(column, p.nstaves())
                if (allStaffGroupsIdentical(p)) {
                    // span only if the same types
                    const staves = p.staves()
                    for (const spannedStaff of staves) {
                        if (spannedStaff !== staves[staves.length - 1]) { // not last staff
                            spannedStaff.setBarLineSpan(true)
                        }
                    }
                }
            }
        }
        this.addError(checkAtEndElement(this.m_e, 'score-partwise'))
    }

    //---------------------------------------------------------
    //   identification
    //---------------------------------------------------------

    /**
     Parse the /score-partwise/identification node:
     read the metadata.
     */

    identification(): void {
        this.m_logger.logDebugTrace('MusicXmlParserPass1::identification', this.m_e)

        while (this.m_e.readNextStartElement()) {
            if (this.m_e.name() === 'creator') {
                // type is an arbitrary label
                const strType = this.m_e.attribute('type')
                this.m_score.setMetaTag(strType, this.m_e.readText())
            } else if (this.m_e.name() === 'rights') {
                this.m_score.setMetaTag('copyright', this.m_e.readText())
            } else if (this.m_e.name() === 'encoding') {
                // TODO
                while (this.m_e.readNextStartElement()) {
                    if (this.m_e.name() === 'encoder') {
                        this.m_score.setMetaTag('encoder', this.m_e.readText())
                    } else if (this.m_e.name() === 'software') {
                        const exporterString = this.m_e.readText().toLowerCase()
                        this.setExporterSoftware(exporterString)
                        this.setExporterStyles()
                    } else if (this.m_e.name() === 'supports' && this.m_e.asciiAttribute('element') === 'beam'
                               && this.m_e.asciiAttribute('type') === 'yes') {
                        this.m_hasBeamingInfo = true
                        this.m_e.skipCurrentElement()
                    } else {
                        this.m_e.skipCurrentElement()
                    }
                }
                // _score->setMetaTag("encoding", _e.readText()); works with DOM but not with pull parser
                // temporarily fake the encoding tag (compliant with DOM parser) to help the autotester
                if (MScore.debugMode) {
                    this.m_score.setMetaTag('encoding', 'MuseScore 0.7.02007-09-10')
                }
            } else if (this.m_e.name() === 'source') {
                this.m_score.setMetaTag('source', this.m_e.readText())
            } else if (this.m_e.name() === 'miscellaneous') {
                // store all miscellaneous information
                while (this.m_e.readNextStartElement()) {
                    if (this.m_e.name() === 'miscellaneous-field') {
                        const name = this.m_e.attribute('name')
                        this.m_score.setMetaTag(name, this.m_e.readText())
                    } else {
                        this.m_e.skipCurrentElement()
                    }
                }
            } else {
                this.skipLogCurrElem()
            }
        }
    }

    //---------------------------------------------------------
    //   credit
    //---------------------------------------------------------

    /**
     Parse the /score-partwise/credit node:
     read the credits for later handling by doCredits().
     */

    credit(credits: CreditWordsList): void {
        this.m_logger.logDebugTrace('MusicXmlParserPass1::credit', this.m_e)

        const page = this.m_e.intAttribute('page')         // ignoring errors implies incorrect conversion defaults to the first page
        // multiple credit-words elements may be present,
        // which are appended
        // use the position info from the first one
        // font information is ignored, credits will be styled
        let creditWordsRead = false
        let defaultx = 0
        let defaulty = 0
        let fontSize = 0
        let justify = ''
        let halign = ''
        let valign = ''
        const crtypes: string[] = []
        let crwords = ''
        let hasRights = false
        while (this.m_e.readNextStartElement()) {
            if (this.m_e.name() === 'credit-words') {
                // IMPORT_LAYOUT
                if (!creditWordsRead) {
                    defaultx = this.m_e.doubleAttribute('default-x')
                    defaulty = this.m_e.doubleAttribute('default-y')
                    fontSize = this.m_e.doubleAttribute('font-size')
                    justify = this.m_e.attribute('justify')
                    halign = this.m_e.attribute('halign')
                    valign = this.m_e.attribute('valign')
                    creditWordsRead = true
                }
                crwords += nextPartOfFormattedString(this.m_e)
            } else if (this.m_e.name() === 'credit-type') {
                // multiple credit-type elements may be present, supported by
                // e.g. Finale v26.3 for Mac.
                const type = this.m_e.readText()
                crtypes.push(type)
                hasRights = hasRights || type === 'rights'
            } else {
                this.skipLogCurrElem()
            }
        }
        if (!hasRights && isLikelyRightsText(crwords)) {
            crtypes.push('rights')
        }
        if (crwords) {
            // as the meaning of multiple credit-types is undocumented,
            // use credit-type only if exactly one was found
            const crtype = (crtypes.length === 1) ? crtypes[0] : ''
            const cw = new CreditWords(page, crtype, defaultx, defaulty, fontSize, justify, halign, valign, crwords)
            credits.push(cw)
        }
    }

    //---------------------------------------------------------
    //   defaults
    //---------------------------------------------------------

    /**
     Parse the /score-partwise/defaults node:
     read the general score layout settings.
     */

    defaults(): void {
        const e = this.m_e
        let millimeter = this.m_score.style().spatium() / 10.0
        let tenths = 1.0
        let lyricFontFamily = ''
        let lyricFontSize = ''
        let wordFontFamily = ''
        let wordFontSize = ''

        const isImportLayout = musicXmlImportLayout()

        while (e.readNextStartElement()) {
            if (e.name() === 'scaling') {
                while (e.readNextStartElement()) {
                    if (e.name() === 'millimeters') {
                        millimeter = e.readDouble()
                    } else if (e.name() === 'tenths') {
                        tenths = e.readDouble()
                    } else {
                        this.skipLogCurrElem()
                    }
                }
                const _spatium = DPMM * (millimeter * 10.0 / tenths)
                if (isImportLayout) {
                    this.m_score.style().setSpatium(_spatium)
                }
            } else if (e.name() === 'concert-score') {
                this.m_score.style().set(Sid.concertPitch, true)
                e.skipCurrentElement()            // skip but don't log
            } else if (e.name() === 'page-layout') {
                const pf = new PageFormat()
                this.pageLayout(pf, millimeter / (tenths * INCH))
                if (isImportLayout) {
                    setPageFormat(this.m_score, pf)
                }
            } else if (e.name() === 'system-layout') {
                while (e.readNextStartElement()) {
                    if (e.name() === 'system-margins') {
                        e.skipCurrentElement()            // skip but don't log
                    } else if (e.name() === 'system-distance') {
                        const val = new Spatium(e.readDouble() / 10.0)
                        if (isImportLayout) {
                            this.m_score.style().set(Sid.minSystemDistance, val)
                        }
                    } else if (e.name() === 'top-system-distance') {
                        e.skipCurrentElement()            // skip but don't log
                    } else if (e.name() === 'system-dividers') {
                        while (e.readNextStartElement()) {
                            if (e.name() === 'left-divider') {
                                this.m_score.style().set(Sid.dividerLeft, (e.asciiAttribute('print-object') !== 'no'))
                                if (isImportLayout) {
                                    this.m_score.style().set(Sid.dividerLeftX, e.doubleAttribute('relative-x') / 10.0)
                                    this.m_score.style().set(Sid.dividerLeftY, e.doubleAttribute('relative-y') / 10.0)
                                }
                                e.skipCurrentElement()
                            } else if (e.name() === 'right-divider') {
                                this.m_score.style().set(Sid.dividerRight, (e.asciiAttribute('print-object') !== 'no'))
                                if (isImportLayout) {
                                    this.m_score.style().set(Sid.dividerRightX, e.doubleAttribute('relative-x') / 10.0)
                                    this.m_score.style().set(Sid.dividerRightY, e.doubleAttribute('relative-y') / 10.0)
                                }
                                e.skipCurrentElement()
                            } else {
                                this.skipLogCurrElem()
                            }
                        }
                    } else {
                        this.skipLogCurrElem()
                    }
                }
            } else if (e.name() === 'staff-layout') {
                while (e.readNextStartElement()) {
                    if (e.name() === 'staff-distance') {
                        const val = new Spatium(e.readDouble() / 10.0)
                        if (isImportLayout) {
                            this.m_score.style().set(Sid.staffDistance, val)
                        }
                    } else {
                        this.skipLogCurrElem()
                    }
                }
            } else if (e.name() === 'appearance') {
                while (e.readNextStartElement()) {
                    const type = e.attribute('type')
                    if (e.name() === 'line-width') {
                        const val = e.readDouble()
                        if (isImportLayout) {
                            this.setStyle(type, val)
                        }
                    } else if (e.name() === 'note-size') {
                        const val = e.readDouble()
                        if (isImportLayout) {
                            this.setStyle(type, val)
                        }
                    } else if (e.name() === 'distance') {
                        e.skipCurrentElement()        // skip but don't log
                    } else if (e.name() === 'glyph') {
                        e.skipCurrentElement()        // skip but don't log
                    } else if (e.name() === 'other-appearance') {
                        e.skipCurrentElement()        // skip but don't log
                    } else {
                        this.skipLogCurrElem()
                    }
                }
            } else if (e.name() === 'music-font') {
                e.skipCurrentElement()        // skip but don't log
            } else if (e.name() === 'word-font') {
                wordFontFamily = e.attribute('font-family')
                wordFontSize = e.attribute('font-size')
                e.skipCurrentElement()
            } else if (e.name() === 'lyric-font') {
                lyricFontFamily = e.attribute('font-family')
                lyricFontSize = e.attribute('font-size')
                e.skipCurrentElement()
            } else if (e.name() === 'lyric-language') {
                e.skipCurrentElement()        // skip but don't log
            } else {
                this.skipLogCurrElem()
            }
        }

        wordFontFamily = !wordFontFamily ? 'Edwin' : wordFontFamily
        lyricFontFamily = !lyricFontFamily ? wordFontFamily : lyricFontFamily
        updateStyles(this.m_score, wordFontFamily, wordFontSize, lyricFontFamily, lyricFontSize)

        scaleCopyrightText(this.m_score)
    }

    //---------------------------------------------------------
    //   setStyle
    //---------------------------------------------------------

    setStyle(type: string, val: number): void {
        const st = this.m_score.style()
        if (type === 'light barline') {
            st.set(Sid.barWidth, new Spatium(val / 10))
        } else if (type === 'heavy barline') {
            st.set(Sid.endBarWidth, new Spatium(val / 10))
        } else if (type === 'beam') {
            st.set(Sid.beamWidth, new Spatium(val / 10))
        } else if (type === 'bracket') {
            st.set(Sid.bracketWidth, new Spatium(val / 10))
        } else if (type === 'dashes') {
            st.set(Sid.lyricsDashLineThickness, new Spatium(val / 10))
        } else if (type === 'enclosure') {
            st.set(Sid.staffTextFrameWidth, new Spatium(val / 10))
        } else if (type === 'ending') {
            st.set(Sid.voltaLineWidth, new Spatium(val / 10))
        } else if (type === 'extend') {
            st.set(Sid.lyricsLineThickness, new Spatium(val / 10))
        } else if (type === 'leger') {
            st.set(Sid.ledgerLineWidth, new Spatium(val / 10))
        } else if (type === 'pedal') {
            st.set(Sid.pedalLineWidth, new Spatium(val / 10))
        } else if (type === 'octave shift') {
            st.set(Sid.ottavaLineWidth, new Spatium(val / 10))
        } else if (type === 'staff') {
            st.set(Sid.staffLineWidth, new Spatium(val / 10))
        } else if (type === 'stem') {
            st.set(Sid.stemWidth, new Spatium(val / 10))
        } else if (type === 'tuplet bracket') {
            st.set(Sid.tupletBracketWidth, new Spatium(val / 10))
        } else if (type === 'wedge') {
            st.set(Sid.hairpinLineWidth, new Spatium(val / 10))
        } else if (type === 'slur middle') {
            st.set(Sid.slurMidWidth, new Spatium(val / 10))
        } else if (type === 'slur tip') {
            st.set(Sid.slurEndWidth, new Spatium(val / 10))
        } else if (type === 'tie middle') {
            st.set(Sid.tieMidWidth, new Spatium(val / 10))
        } else if (type === 'tie tip') {
            st.set(Sid.tieEndWidth, new Spatium(val / 10))
        } else if (type === 'cue') {
            st.set(Sid.smallNoteMag, val / 100)
        } else if (type === 'grace') {
            st.set(Sid.graceNoteMag, val / 100)
        } else if (type === 'grace-cue') {
            // not supported
        }
    }

    //---------------------------------------------------------
    //   pageLayout
    //---------------------------------------------------------

    /**
     Parse the /score-partwise/defaults/page-layout node: read the page layout.
     Note that MuseScore does not support a separate value for left and right margins
     for odd and even pages. Only odd and even left margins are used, together  with
     the printable width, which is calculated from the left and right margins in the
     MusicXML file.
     */

    pageLayout(pf: PageFormat, conversion: number): void {
        const e = this.m_e
        this.m_logger.logDebugTrace('MusicXmlParserPass1::pageLayout', e)

        let _oddRightMargin = 0.0
        let _evenRightMargin = 0.0
        const size = new SizeF()

        while (e.readNextStartElement()) {
            if (e.name() === 'page-margins') {
                let type = e.attribute('type')
                if (!type) {
                    type = 'both'
                }
                let lm = 0.0
                let rm = 0.0
                let tm = 0.0
                let bm = 0.0
                while (e.readNextStartElement()) {
                    if (e.name() === 'left-margin') {
                        lm = e.readDouble() * conversion
                    } else if (e.name() === 'right-margin') {
                        rm = e.readDouble() * conversion
                    } else if (e.name() === 'top-margin') {
                        tm = e.readDouble() * conversion
                    } else if (e.name() === 'bottom-margin') {
                        bm = e.readDouble() * conversion
                    } else {
                        this.skipLogCurrElem()
                    }
                }
                pf.twosided = type === 'odd' || type === 'even'
                if (type === 'odd' || type === 'both') {
                    pf.oddLeftMargin = lm
                    _oddRightMargin = rm
                    pf.oddTopMargin = tm
                    pf.oddBottomMargin = bm
                }
                if (type === 'even' || type === 'both') {
                    pf.evenLeftMargin = lm
                    _evenRightMargin = rm
                    pf.evenTopMargin = tm
                    pf.evenBottomMargin = bm
                }
            } else if (e.name() === 'page-height') {
                const val = e.readDouble()
                size.setHeight(val * conversion)
                // set pageHeight and pageWidth for use by doCredits()
                this.m_pageSize.setHeight(Math.trunc(val + 0.5))
            } else if (e.name() === 'page-width') {
                const val = e.readDouble()
                size.setWidth(val * conversion)
                // set pageHeight and pageWidth for use by doCredits()
                this.m_pageSize.setWidth(Math.trunc(val + 0.5))
            } else {
                this.skipLogCurrElem()
            }
        }
        pf.size = size
        const w1 = size.width() - pf.oddLeftMargin - _oddRightMargin
        const w2 = size.width() - pf.evenLeftMargin - _evenRightMargin
        pf.printableWidth = Math.max(w1, w2)     // silently adjust right margins
    }

    //---------------------------------------------------------
    //   partList
    //---------------------------------------------------------

    /**
     Parse the /score-partwise/part-list:
     create the parts and for each part set id and name.
     Also handle the part-groups.
     */

    partList(partGroupList: MusicXmlPartGroupList): void {
        this.m_logger.logDebugTrace('MusicXmlParserPass1::partList', this.m_e)

        let scoreParts = 0   // number of score-parts read sofar
        const partGroups: MusicXmlPartGroupMap = new IntMap<MusicXmlPartGroup>()
        const curPartGroupName = { v: '' }

        while (this.m_e.readNextStartElement()) {
            if (this.m_e.name() === 'part-group') {
                this.partGroup(scoreParts, partGroupList, partGroups, curPartGroupName)
            } else if (this.m_e.name() === 'score-part') {
                this.scorePart(curPartGroupName.v)
                scoreParts++
            } else {
                this.skipLogCurrElem()
            }
        }
    }

    //---------------------------------------------------------
    //   partGroup
    //---------------------------------------------------------

    /**
     Parse the /score-partwise/part-list/part-group node.
     */

    partGroup(scoreParts: number, partGroupList: MusicXmlPartGroupList, partGroups: MusicXmlPartGroupMap,
        curPartGroupName: { v: string }): void {
        const e = this.m_e
        this.m_logger.logDebugTrace('MusicXmlParserPass1::partGroup', e)
        let barlineSpan = true
        let number = e.intAttribute('number')
        if (number > 0) {
            number--
        }
        let symbol = ''
        const type = e.attribute('type')
        let symbolColor = new Color()

        while (e.readNextStartElement()) {
            if (e.name() === 'group-name') {
                curPartGroupName.v = e.readText()
            } else if (e.name() === 'group-abbreviation') {
                symbol = e.readText()
            } else if (e.name() === 'group-symbol') {
                symbolColor = Color.fromString(e.attribute('color'))
                symbol = e.readText()
            } else if (e.name() === 'group-barline') {
                if (e.readText() === 'no') {
                    barlineSpan = false
                }
            } else if (e.name() === 'group-time') {
                this.m_score.style().set(Sid.timeSigPlacement, TimeSigPlacement.ACROSS_STAVES)
                e.skipCurrentElement()          // skip but don't log
            } else {
                this.skipLogCurrElem()
            }
        }

        if (type === 'start') {
            partGroupStart(partGroups, number, scoreParts, symbol, barlineSpan, symbolColor)
        } else if (type === 'stop') {
            partGroupStop(partGroups, number, scoreParts, partGroupList)
        } else {
            this.m_logger.logError(`part-group type '${type}' not supported`, e)
        }
    }

    //---------------------------------------------------------
    //   scorePart
    //---------------------------------------------------------

    /**
     Parse the /score-partwise/part-list/score-part node:
     create the part and sets id and name.
     Note that a part is created even if no part-name is present
     which is invalid MusicXML but is (sometimes ?) generated by NWC2MusicXml.
     */

    scorePart(curPartGroupName: string): void {
        const e = this.m_e
        this.m_logger.logDebugTrace('MusicXmlParserPass1::scorePart', e)
        const id = trimmed(e.attribute('id'))

        if (this.m_parts.has(id)) {
            this.m_logger.logError(`duplicate part id '${id}'`, e)
            this.skipLogCurrElem()
            return
        } else {
            this.m_parts.insert(id, new MusicXmlPart(id))
            this.m_instruments.insert(id, new MusicXmlInstruments())
            createPart(this.m_score, id, this.m_partMap)
        }

        while (e.readNextStartElement()) {
            if (e.name() === 'part-name') {
                // EngravingItem part-name contains the displayed (full) part name
                // It is displayed by default, but can be suppressed (print-object=”no”)
                // As of MusicXML 3.0, formatting is deprecated, with part-name in plain text
                // and the formatted version in the part-name-display element
                this.mxPart(id).setPrintName(e.asciiAttribute('print-object') !== 'no')
                const name = e.readText()
                this.mxPart(id).setName(name)
            } else if (e.name() === 'part-name-display') {
                this.mxPart(id).setPrintName(e.asciiAttribute('print-object') !== 'no')
                let name = ''
                while (e.readNextStartElement()) {
                    if (e.name() === 'display-text') {
                        name += e.readText()
                    } else if (e.name() === 'accidental-text') {
                        name += musicXmlAccidentalTextToChar(e.readText())
                    } else {
                        this.skipLogCurrElem()
                    }
                }
                if (name) {
                    this.mxPart(id).setName(name)
                }
            } else if (e.name() === 'part-abbreviation') {
                // EngravingItem part-name contains the displayed (abbreviated) part name
                // It is displayed by default, but can be suppressed (print-object=”no”)
                // As of MusicXML 3.0, formatting is deprecated, with part-name in plain text
                // and the formatted version in the part-abbreviation-display element
                this.mxPart(id).setPrintAbbr(e.asciiAttribute('print-object') !== 'no')
                const name = e.readText()
                this.mxPart(id).setAbbr(name)
            } else if (e.name() === 'part-abbreviation-display') {
                this.mxPart(id).setPrintAbbr(e.asciiAttribute('print-object') !== 'no')
                let name = ''
                while (e.readNextStartElement()) {
                    if (e.name() === 'display-text') {
                        name += e.readText()
                    } else if (e.name() === 'accidental-text') {
                        name += musicXmlAccidentalTextToChar(e.readText())
                    } else {
                        this.skipLogCurrElem()
                    }
                }
                if (name) {
                    this.mxPart(id).setAbbr(name)
                }
            } else if (e.name() === 'group') {
                // TODO
                e.skipCurrentElement()          // skip but don't log
            } else if (e.name() === 'score-instrument') {
                this.scoreInstrument(id, curPartGroupName)
            } else if (e.name() === 'player') {
                // unsupported
                e.skipCurrentElement()          // skip but don't log
            } else if (e.name() === 'midi-device') {
                if (!e.hasAttribute('port')) {
                    e.readText()         // empty string
                    continue
                }
                const instrId = e.attribute('id')
                const port = e.attribute('port')
                // If instrId is missing, the device assignment affects all
                // score-instrument elements in the score-part
                if (!instrId) {
                    for (const [, instr] of this.instruments(id)) {
                        instr.midiPort = strToInt(port) - 1
                    }
                } else {
                    const instr = this.instruments(id).get(instrId)
                    if (instr) {
                        instr.midiPort = strToInt(port) - 1
                    }
                }

                e.readText()       // empty string
            } else if (e.name() === 'midi-instrument') {
                this.midiInstrument(id)
            } else {
                this.skipLogCurrElem()
            }
        }
    }

    //---------------------------------------------------------
    //   scoreInstrument
    //---------------------------------------------------------

    /**
     Parse the /score-partwise/part-list/score-part/score-instrument node.
     */

    scoreInstrument(partId: string, curPartGroupName: string): void {
        const e = this.m_e
        this.m_logger.logDebugTrace('MusicXmlParserPass1::scoreInstrument', e)
        const instrId = e.attribute('id')
        const instruments = this.instruments(partId)

        while (e.readNextStartElement()) {
            if (e.name() === 'ensemble') {
                this.skipLogCurrElem()
            } else if (e.name() === 'instrument-name') {
                let instrName = e.readText()

                // Finale exports all instrument names as 'Grand Piano' - use part name
                if (this.exporterSoftware() === MusicXmlExporterSoftware.FINALE) {
                    instrName = this.mxPart(partId).getName()
                    if (instrName.length <= 1) {
                        instrName = curPartGroupName
                    }
                }
                instruments.insert(instrId, new MusicXmlInstrument(instrName))
                // EngravingItem instrument-name is typically not displayed in the score,
                // but used only internally
                const instr = instruments.get(instrId)
                if (instr) {
                    instr.name = instrName
                }
            } else if (e.name() === 'instrument-sound') {
                const instrSound = e.readText()
                const instr = instruments.get(instrId)
                if (instr) {
                    instr.sound = instrSound
                }
            } else if (e.name() === 'virtual-instrument') {
                while (e.readNextStartElement()) {
                    if (e.name() === 'virtual-library') {
                        const virtualLibrary = e.readText()
                        const instr = instruments.get(instrId)
                        if (instr) {
                            instr.virtLib = virtualLibrary
                        }
                    } else if (e.name() === 'virtual-name') {
                        const virtualName = e.readText()
                        const instr = instruments.get(instrId)
                        if (instr) {
                            instr.virtName = virtualName
                        }
                    } else {
                        this.skipLogCurrElem()
                    }
                }
            } else {
                this.skipLogCurrElem()
            }
        }
    }

    //---------------------------------------------------------
    //   midiInstrument
    //---------------------------------------------------------

    /**
     Parse the /score-partwise/part-list/score-part/midi-instrument node.
     */

    midiInstrument(partId: string): void {
        const e = this.m_e
        this.m_logger.logDebugTrace('MusicXmlParserPass1::midiInstrument', e)
        const instrId = e.attribute('id')
        const instrument = (): MusicXmlInstrument | undefined => this.instruments(partId).get(instrId)

        while (e.readNextStartElement()) {
            if (e.name() === 'midi-bank') {
                this.skipLogCurrElem()
            } else if (e.name() === 'midi-channel') {
                let channel = e.readInt()
                if (channel < 1) {
                    this.m_logger.logError(`incorrect midi-channel: ${channel}`, e)
                    channel = 1
                } else if (channel > 16) {
                    this.m_logger.logError(`incorrect midi-channel: ${channel}`, e)
                    channel = 16
                }
                const instr = instrument()
                if (instr) {
                    instr.midiChannel = channel - 1
                }
            } else if (e.name() === 'midi-program') {
                let program = e.readInt()
                // Bug fix for Cubase 6.5.5 which generates <midi-program>0</midi-program>
                // Check program number range
                if (program < 1) {
                    this.m_logger.logError(`incorrect midi-program: ${program}`, e)
                    program = 1
                } else if (program > 128) {
                    this.m_logger.logError(`incorrect midi-program: ${program}`, e)
                    program = 128
                }
                const instr = instrument()
                if (instr) {
                    instr.midiProgram = program - 1
                }
            } else if (e.name() === 'midi-unpitched') {
                const instr = instrument()
                if (instr) {
                    instr.unpitched = e.readInt() - 1
                }
            } else if (e.name() === 'volume') {
                const vol = e.readDouble()
                if (vol >= 0 && vol <= 100) {
                    const instr = instrument()
                    if (instr) {
                        instr.midiVolume = Math.trunc((vol / 100) * 127)
                    }
                } else {
                    this.m_logger.logError(`incorrect midi-volume: ${vol}`, e)
                }
            } else if (e.name() === 'pan') {
                const pan = e.readDouble()
                if (pan >= -90 && pan <= 90) {
                    const instr = instrument()
                    if (instr) {
                        instr.midiPan = Math.trunc(((pan + 90) / 180) * 127)
                    }
                } else {
                    this.m_logger.logError(`incorrect midi-volume: ${pan}`, e)
                }
            } else {
                this.skipLogCurrElem()
            }
        }
    }

    //---------------------------------------------------------
    //   part
    //---------------------------------------------------------

    /**
     Parse the /score-partwise/part node:
     read the parts data to determine measure timing and octave shifts.
     Assign voices and staves.
     */

    part(): void {
        const e = this.m_e
        this.m_logger.logDebugTrace('MusicXmlParserPass1::part', e)
        const id = trimmed(e.attribute('id'))

        if (!this.m_parts.has(id)) {
            this.m_logger.logError(`cannot find part '${id}'`, e)
            this.skipLogCurrElem()
            return
        }

        this.initPartState(id)

        const vod = new VoiceOverlapDetector()
        let time = new Fraction()    // current time within part
        const mdur = { v: new Fraction() }    // measure duration

        let measureNr = 0
        while (e.readNextStartElement()) {
            if (e.name() === 'measure') {
                this.measure(id, time, mdur, vod, measureNr)
                time = time.plus(mdur.v)
                ++measureNr
            } else {
                this.skipLogCurrElem()
            }
        }

        const mxPart = this.mxPart(id)
        // Bug fix for Cubase 6.5.5..9.5.10 which generate <staff>2</staff> in a single staff part
        setNumberOfStavesForPart(this.m_partMap.get(id) ?? null, mxPart.maxStaff() + 1)
        // allocate MuseScore staff to MusicXML voices
        allocateStaves(mxPart.voicelist)
        // allocate MuseScore voice to MusicXML voices
        allocateVoices(mxPart.voicelist)
        // calculate the octave shifts
        mxPart.calcOctaveShifts()
        // determine the lyric numbers for this part
        mxPart.lyricNumberHandler().determineLyricNos()
    }

    //---------------------------------------------------------
    //   measure
    //---------------------------------------------------------

    /**
     Parse the /score-partwise/part/measure node:
     read the measures data as required to determine measure timing, octave shifts
     and assign voices and staves.
     */

    measure(partId: string, cTime: Fraction, mdur: { v: Fraction }, vod: VoiceOverlapDetector, measureNr: number): void {
        const e = this.m_e
        this.m_logger.logDebugTrace('MusicXmlParserPass1::measure', e)
        const number = e.attribute('number')

        let mTime = new Fraction()   // current time stamp within measure
        let mDura = new Fraction()   // current total measure duration
        vod.newMeasure()
        const tupletStates = new MusicXmlTupletStates()

        while (e.readNextStartElement()) {
            if (e.name() === 'attributes') {
                this.attributes(partId, cTime.plus(mTime))
            } else if (e.name() === 'barline') {
                e.skipCurrentElement()        // skip but don't log
            } else if (e.name() === 'note') {
                const missingPrev = { v: new Fraction() }
                const dura = { v: new Fraction() }
                const missingCurr = { v: new Fraction() }
                // note: chord and grace note handling done in note()
                this.note(partId, cTime.plus(mTime), missingPrev, dura, missingCurr, vod, tupletStates)
                if (missingPrev.v.isValid()) {
                    mTime = mTime.plus(missingPrev.v)
                }
                if (dura.v.isValid()) {
                    mTime = mTime.plus(dura.v)
                }
                if (missingCurr.v.isValid()) {
                    mTime = mTime.plus(missingCurr.v)
                }
                if (mTime.gt(mDura)) {
                    mDura = mTime
                }
            } else if (e.name() === 'forward') {
                const dura = { v: new Fraction() }
                this.forward(dura)
                if (dura.v.isValid()) {
                    mTime = mTime.plus(dura.v)
                    if (mTime.gt(mDura)) {
                        mDura = mTime
                    }
                }
            } else if (e.name() === 'backup') {
                const dura = { v: new Fraction() }
                this.backup(dura)
                if (dura.v.isValid()) {
                    if (dura.v.le(mTime)) {
                        mTime = mTime.minus(dura.v)
                    } else {
                        this.m_logger.logError('backup beyond measure start', e)
                        mTime = new Fraction(0, 1)
                    }
                }
            } else if (e.name() === 'direction') {
                this.direction(partId, cTime.plus(mTime))
            } else if (e.name() === 'harmony') {
                e.skipCurrentElement()        // skip but don't log
            } else if (e.name() === 'print') {
                this.print(measureNr)
            } else if (e.name() === 'sound') {
                e.skipCurrentElement()        // skip but don't log
            } else {
                this.skipLogCurrElem()
            }
        }

        // copy overlap data from vod to voicelist
        copyOverlapData(vod, this.mxPart(partId).voicelist)

        // measure duration fixups
        mDura = mDura.reduced()

        // fix for PDFtoMusic Pro v1.3.0d Build BF4E and PlayScore / ReadScoreLib Version 3.11
        // which sometimes generate empty measures
        // if no valid length found and length according to time signature is known,
        // use length according to time signature
        if (mDura.isZero() && this.m_timeSigDura.isValid() && this.m_timeSigDura.gt(new Fraction(0, 1))) {
            mDura = this.m_timeSigDura
        }
        // if no valid length found and time signature is unknown, use default
        if (mDura.isZero() && !this.m_timeSigDura.isValid()) {
            mDura = new Fraction(4, 4)
        }

        // if necessary, round up to an integral number of 1/128th,
        // to comply with MuseScores actual measure length constraints
        let length = mDura.times(new Fraction(128, 1))
        let correctedLength = mDura
        length = length.reduced()
        if (length.denominator() !== 1) {
            const roundDown = new Fraction(Math.trunc(length.numerator() / length.denominator()), 128)
            const roundUp = new Fraction(Math.trunc(length.numerator() / length.denominator()) + 1, 128)
            // mDura is not an integer multiple of 1/128;
            // first check if the duration is larger than an integer multiple of 1/128
            // by an amount smaller than the minimum division resolution
            // in that case, round down (rounding errors have possibly occurred),
            // otherwise, round up
            if ((this.m_divs > 0) && (mDura.minus(roundDown).lt(new Fraction(1, 4 * this.m_divs)))) {
                this.m_logger.logError(`rounding down measure duration ${mDura.toString()} to ${roundDown.toString()}`, e)
                correctedLength = roundDown
            } else {
                this.m_logger.logError(`rounding up measure duration ${mDura.toString()} to ${roundUp.toString()}`, e)
                correctedLength = roundUp
            }
            mDura = correctedLength
        }

        // set measure duration to a suitable value given the time signature
        if (this.m_timeSigDura.isValid() && this.m_timeSigDura.gt(new Fraction(0, 1))) {
            const btp = this.m_timeSigDura.denominator()
            if (btp > 0) {
                mDura = measureDurationAsFraction(mDura, btp)
            }
        }

        // set return value(s)
        mdur.v = mDura

        // set measure number and duration
        this.mxPart(partId).addMeasureNumberAndDuration(number, mdur.v)

        this.addError(checkAtEndElement(e, 'measure'))
    }

    //---------------------------------------------------------
    //   print
    //---------------------------------------------------------

    print(measureNr: number): void {
        this.m_logger.logDebugTrace('MusicXmlParserPass1::print', this.m_e)

        const newPage = this.m_e.attribute('new-page')
        const newSystem = this.m_e.attribute('new-system')
        if (newPage === 'yes') {
            this.m_pageStartMeasureNrs.add(measureNr)
        }
        if (newSystem === 'yes') {
            this.m_systemStartMeasureNrs.add(measureNr)
        }

        this.m_e.skipCurrentElement()          // skip but don't log
    }

    //---------------------------------------------------------
    //   attributes
    //---------------------------------------------------------

    /**
     Parse the /score-partwise/part/measure/attributes node.
     */

    attributes(partId: string, cTime: Fraction): void {
        const e = this.m_e
        this.m_logger.logDebugTrace('MusicXmlParserPass1::attributes', e)

        let staves = 0
        const hiddenStavesSet = new Set<number>()

        while (e.readNextStartElement()) {
            if (e.name() === 'clef') {
                this.clef(partId)
            } else if (e.name() === 'divisions') {
                this.divisions()
            } else if (e.name() === 'key') {
                e.skipCurrentElement()        // skip but don't log
            } else if (e.name() === 'instruments') {
                e.skipCurrentElement()        // skip but don't log
            } else if (e.name() === 'staff-details') {
                if (e.asciiAttribute('print-object') === 'no') {
                    hiddenStavesSet.add(e.intAttribute('number'))
                }
                e.skipCurrentElement()
            } else if (e.name() === 'staves') {
                staves = e.readInt()
            } else if (e.name() === 'time') {
                this.time(cTime)
            } else if (e.name() === 'transpose') {
                this.transpose(partId, cTime)
            } else {
                this.skipLogCurrElem()
            }
        }

        // std::set<int>: in order
        const hiddenStaves = [...hiddenStavesSet].sort((a, b) => a - b)
        const mxPart = this.mxPart(partId)

        if (staves - hiddenStaves.length > MAX_STAVES) {
            this.m_logger.logError('staves exceed MAX_STAVES, even when discarding hidden staves', e)
            return
        } else if (staves > MAX_STAVES
                   && hiddenStaves.length > 0
                   && mxPart.staffNumberToIndexMap().size() === 0) {
            this.m_logger.logError('staves exceed MAX_STAVES, but hidden staves can be discarded', e)
            // Some scores have parts with many staves (~10), but most are hidden
            // When this occurs, we can discard hidden staves
            // and store a std::map between staffNumber and staffIndex.
            let staffNumber = 1
            let staffIndex = 0
            for (; staffNumber <= staves; ++staffNumber) {
                if (hiddenStavesSet.has(staffNumber)) {
                    this.m_logger.logError(`removing hidden staff ${staffNumber}`, e)
                    continue
                }
                mxPart.insertStaffNumberToIndex(staffNumber, staffIndex)
                ++staffIndex
            }

            setNumberOfStavesForPart(this.m_partMap.get(partId) ?? null, staves - hiddenStaves.length)
        } else {
            // Otherwise, don't discard any staves
            // And set hidden staves to hide when empty
            // (MuseScore doesn't currently have a mechanism
            // for hiding non-empty staves, so this is an approximation
            // of the correct implementation)
            setNumberOfStavesForPart(this.m_partMap.get(partId) ?? null, staves)
            for (const hiddenStaff of hiddenStaves) {
                const hiddenStaffIndex = (this.m_parts.get(partId) ?? new MusicXmlPart()).staffNumberToIndex(hiddenStaff)
                if (hiddenStaffIndex >= 0) {
                    this.m_partMap.get(partId)!.staff(hiddenStaffIndex)!.setHideWhenEmpty(AutoOnOff.ON)
                }
            }
        }
    }

    //---------------------------------------------------------
    //   clef
    //---------------------------------------------------------

    /**
     Parse the /score-partwise/part/measure/attributes/clef node.
     TODO: Store the clef type, to simplify staff type setting in pass 2.
     */

    clef(partId: string): void {
        void partId
        const e = this.m_e
        this.m_logger.logDebugTrace('MusicXmlParserPass1::clef', e)

        while (e.readNextStartElement()) {
            if (e.name() === 'line') {
                e.skipCurrentElement()        // skip but don't log
            } else if (e.name() === 'sign') {
                e.readText()
            } else {
                this.skipLogCurrElem()
            }
        }
    }

    //---------------------------------------------------------
    //   time
    //---------------------------------------------------------

    /**
     Parse the /score-partwise/part/measure/attributes/time node.
     */

    time(cTime: Fraction): void {
        const e = this.m_e
        let beats = ''
        let beatType = ''
        const timeSymbol = e.attribute('symbol')

        while (e.readNextStartElement()) {
            if (e.name() === 'beats') {
                beats = e.readText()
            } else if (e.name() === 'beat-type') {
                beatType = e.readText()
            } else {
                this.skipLogCurrElem()
            }
        }

        if (beats && beatType) {
            // determine if timesig is valid
            const st = { v: TimeSigType.NORMAL }
            const bts = { v: 0 }           // total beats as integer (beats may contain multiple numbers, separated by "+")
            const btp = { v: 0 }           // beat-type as integer
            if (determineTimeSig(this.m_logger, e, beats, beatType, timeSymbol, st, bts, btp)) {
                this.m_timeSigDura = new Fraction(bts.v, btp.v)
                this.m_score.sigmap().addSig(cTime.ticks(), this.m_timeSigDura)
            }
        }
    }

    //---------------------------------------------------------
    //   transpose
    //---------------------------------------------------------

    /**
     Parse the /score-partwise/part/measure/attributes/transpose node.
     */

    transpose(partId: string, tick: Fraction): void {
        const e = this.m_e
        const interval = new Interval()
        while (e.readNextStartElement()) {
            const i = e.readInt()
            if (e.name() === 'diatonic') {
                interval.diatonic = i
            } else if (e.name() === 'chromatic') {
                interval.chromatic = i
            } else if (e.name() === 'octave-change') {
                interval.diatonic += i * 7
                interval.chromatic += i * 12
            } else {
                this.skipLogCurrElem()
            }
        }

        const intervals = this.mxPart(partId)._intervals
        if (intervals.count(tick) === 0) {
            if (!interval.diatonic && interval.chromatic) {
                interval.diatonic = Interval.chromatic2diatonic(interval.chromatic)
            }
            intervals.set(tick, interval)
        }
    }

    //---------------------------------------------------------
    //   divisions
    //---------------------------------------------------------

    /**
     Parse the /score-partwise/part/measure/attributes/divisions node.
     */

    divisions(): void {
        this.m_divs = this.m_e.readInt()
        if (!(this.m_divs > 0)) {
            this.m_logger.logError('illegal divisions', this.m_e)
        }
    }

    //---------------------------------------------------------
    //   direction
    //---------------------------------------------------------

    /**
     Parse the /score-partwise/part/measure/direction node
     to be able to handle octave-shifts, as these must be interpreted
     in musical order instead of in MusicXML file order.
     */

    direction(partId: string, cTime: Fraction): void {
        const e = this.m_e
        // note: file order is direction-type first, then staff
        // this means staff is still unknown when direction-type is handled

        const starts: MusicXmlOctaveShiftDesc[] = []
        const stops: MusicXmlOctaveShiftDesc[] = []
        let staff = 0

        while (e.readNextStartElement()) {
            if (e.name() === 'direction-type') {
                this.directionType(cTime, starts, stops)
            } else if (e.name() === 'staff') {
                const nstaves = this.getPart(partId)!.nstaves()
                const strStaff = e.readText()
                staff = this.mxPart(partId).staffNumberToIndex(strToInt(strStaff))
                if (0 <= staff && staff < nstaves) {
                    // OK
                } else {
                    this.m_logger.logError(`invalid staff ${strStaff}`, e)
                    staff = 0
                }
            } else {
                e.skipCurrentElement()
            }
        }

        const mxPart = this.mxPart(partId)

        // handle the stops first
        for (const desc of stops) {
            const prevDesc = this.m_octaveShifts.get(desc.num)
            if (prevDesc) {
                if (prevDesc.tp === MusicXmlOctaveShiftDescType.UP
                    || prevDesc.tp === MusicXmlOctaveShiftDescType.DOWN) {
                    // a complete pair
                    mxPart.addOctaveShift(staff, prevDesc.size, prevDesc.time)
                    mxPart.addOctaveShift(staff, -prevDesc.size, desc.time)
                } else {
                    this.m_logger.logError('double octave-shift stop', e)
                }
                this.m_octaveShifts.erase(desc.num)
            } else {
                this.m_octaveShifts.insert(desc.num, desc.clone())
            }
        }

        // then handle the starts
        for (const desc of starts) {
            const prevDesc = this.m_octaveShifts.get(desc.num)
            if (prevDesc) {
                if (prevDesc.tp === MusicXmlOctaveShiftDescType.STOP) {
                    // a complete pair
                    mxPart.addOctaveShift(staff, desc.size, desc.time)
                    mxPart.addOctaveShift(staff, -desc.size, prevDesc.time)
                } else {
                    this.m_logger.logError('double octave-shift start', e)
                }
                this.m_octaveShifts.erase(desc.num)
            } else {
                this.m_octaveShifts.insert(desc.num, desc.clone())
            }
        }
    }

    //---------------------------------------------------------
    //   directionType
    //---------------------------------------------------------

    /**
     Parse the /score-partwise/part/measure/direction/direction-type node.
     */

    directionType(cTime: Fraction, starts: MusicXmlOctaveShiftDesc[], stops: MusicXmlOctaveShiftDesc[]): void {
        const e = this.m_e
        while (e.readNextStartElement()) {
            if (e.name() === 'octave-shift') {
                const number = e.attribute('number')
                let n = 0
                if (number) {
                    n = strToInt(number)
                    if (n <= 0) {
                        this.m_logger.logError(`invalid number ${number}`, e)
                    } else {
                        n--            // make zero-based
                    }
                }

                if (0 <= n && n < MAX_NUMBER_LEVEL) {
                    // static_cast<short>
                    const size = (e.intAttribute('size') << 16) >> 16
                    const type = e.attribute('type')
                    const osDesc = new MusicXmlOctaveShiftDesc()
                    this.handleOctaveShift(cTime, type, size, osDesc)
                    osDesc.num = n
                    if (osDesc.tp === MusicXmlOctaveShiftDescType.UP
                        || osDesc.tp === MusicXmlOctaveShiftDescType.DOWN) {
                        starts.push(osDesc)
                    } else if (osDesc.tp === MusicXmlOctaveShiftDescType.STOP) {
                        stops.push(osDesc)
                    }
                } else {
                    this.m_logger.logError(`invalid octave-shift number ${number}`, e)
                }
                e.skipCurrentElement()
            } else {
                e.skipCurrentElement()
            }
        }
    }

    //---------------------------------------------------------
    //   handleOctaveShift
    //---------------------------------------------------------

    /** desc is modified (C++ MusicXmlOctaveShiftDesc&) */
    handleOctaveShift(cTime: Fraction, type: string, size: number, desc: MusicXmlOctaveShiftDesc): void {
        let tp = MusicXmlOctaveShiftDescType.NONE
        let sz = 0

        switch (size) {
        case 22: sz = 3
            break
        case 15: sz = 2
            break
        case 8:
        default:
            sz = 1
        }

        if (!cTime.isValid() || cTime.lt(new Fraction(0, 1))) {
            this.m_logger.logError('invalid current time', this.m_e)
        }

        if (type === 'up') {
            tp = MusicXmlOctaveShiftDescType.UP
        } else if (type === 'down') {
            tp = MusicXmlOctaveShiftDescType.DOWN
            sz *= -1
        } else if (type === 'stop') {
            tp = MusicXmlOctaveShiftDescType.STOP
        } else {
            this.m_logger.logError(`invalid octave-shift type '${type}'`, this.m_e)
            return
        }

        // desc = MusicXmlOctaveShiftDesc(tp, sz, cTime)
        desc.tp = tp
        desc.size = sz
        desc.time = cTime
        desc.num = -1
    }

    //---------------------------------------------------------
    //   notations
    //---------------------------------------------------------

    /**
     Parse the /score-partwise/part/measure/note/notations node.
     */

    notations(tupletStartStop: { v: MusicXmlStartStop }): void {
        const e = this.m_e
        while (e.readNextStartElement()) {
            if (e.name() === 'tuplet') {
                const tupletType = e.attribute('type')

                // ignore possible children (currently not supported)
                e.skipCurrentElement()

                if (tupletType === 'start') {
                    tupletStartStop.v = MusicXmlStartStop.START
                } else if (tupletType === 'stop') {
                    tupletStartStop.v = MusicXmlStartStop.STOP
                } else if (tupletType && tupletType !== 'start' && tupletType !== 'stop') {
                    this.m_logger.logError(`unknown tuplet type '${tupletType}'`, e)
                }
            } else {
                e.skipCurrentElement()              // skip but don't log
            }
        }
    }

    //---------------------------------------------------------
    //   voiceToInt
    //---------------------------------------------------------

    voiceToInt(voice: string): number {
        const ok = { v: false }
        let voiceInt = strToInt(voice, ok)
        if (!voice) {
            voiceInt = 1
        } else if (!ok.v) {
            voiceInt = voiceStrIndex(voice) // Handle the rare but techincally in-spec case of a non-int voice
        }
        return voiceInt
    }

    //---------------------------------------------------------
    //   note
    //---------------------------------------------------------

    /**
     Parse the /score-partwise/part/measure/note node.
     */

    note(partId: string, sTime: Fraction, missingPrev: { v: Fraction }, dura: { v: Fraction }, missingCurr: { v: Fraction },
        vod: VoiceOverlapDetector, tupletStates: MusicXmlTupletStates): void {
        const e = this.m_e

        if (e.asciiAttribute('print-spacing') === 'no') {
            this.notePrintSpacingNo(dura)
            return
        }

        let chord = false
        let grace = false
        let bRest = false
        let staff = 0
        let type = ''
        let voice = '1'
        let instrId = ''
        const tupletStartStop = { v: MusicXmlStartStop.NONE }

        const mnd = new MusicXmlNoteDuration(this.m_divs, this.m_logger, this)
        const mxPart = this.mxPart(partId)

        while (e.readNextStartElement()) {
            if (mnd.readProperties(e)) {
                // element handled
            } else if (e.name() === 'accidental') {
                e.skipCurrentElement()        // skip but don't log
            } else if (e.name() === 'beam') {
                this.m_hasBeamingInfo = true
                e.skipCurrentElement()        // skip but don't log
            } else if (e.name() === 'chord') {
                chord = true
                e.skipCurrentElement()  // skip but don't log
            } else if (e.name() === 'cue') {
                e.skipCurrentElement()        // skip but don't log
            } else if (e.name() === 'grace') {
                grace = true
                e.skipCurrentElement()  // skip but don't log
            } else if (e.name() === 'instrument') {
                instrId = e.attribute('id')
                e.skipCurrentElement()  // skip but don't log
            } else if (e.name() === 'lyric') {
                const number = e.attribute('number')
                mxPart.lyricNumberHandler().addNumber(number)
                mxPart.hasLyrics(true)
                e.skipCurrentElement()
            } else if (e.name() === 'notations') {
                this.notations(tupletStartStop)
            } else if (e.name() === 'notehead') {
                e.skipCurrentElement()        // skip but don't log
            } else if (e.name() === 'pitch') {
                e.skipCurrentElement()        // skip but don't log
            } else if (e.name() === 'rest') {
                bRest = true
                this.rest()
            } else if (e.name() === 'staff') {
                const ok = { v: false }
                const strStaff = e.readText()
                staff = mxPart.staffNumberToIndex(strToInt(strStaff, ok))
                mxPart.setMaxStaff(staff)
                const part = this.m_partMap.get(partId)
                if (!part) {
                    continue
                }
                if (!ok.v || staff < 0 || staff >= part.nstaves()) {
                    this.m_logger.logError(`illegal or hidden staff '${strStaff}'`, e)
                }
            } else if (e.name() === 'stem') {
                e.skipCurrentElement()        // skip but don't log
            } else if (e.name() === 'tie') {
                e.skipCurrentElement()        // skip but don't log
            } else if (e.name() === 'type') {
                type = e.readText()
            } else if (e.name() === 'unpitched') {
                e.skipCurrentElement()        // skip but don't log
            } else if (e.name() === 'voice') {
                voice = e.readText()
            } else {
                this.skipLogCurrElem()
            }
        }

        // multi-instrument handling
        const prevInstrId = mxPart._instrList.instrument(sTime)
        const mustInsert = instrId !== prevInstrId
        if (mustInsert) {
            mxPart._instrList.setInstrument(instrId, sTime)
        }

        // check for timing error(s) and set dura
        // keep in this order as checkTiming() might change dura
        const errorStr = mnd.checkTiming(type, bRest, grace)
        dura.v = mnd.duration()
        if (errorStr) {
            this.m_logger.logError(errorStr, e)
        }

        // don't count chord or grace note duration
        // note that this does not check the MusicXML requirement that notes in a chord
        // cannot have a duration longer than the first note in the chord
        missingPrev.v = new Fraction(0, 1)
        if (chord || grace) {
            dura.v = new Fraction(0, 1)
        }

        if (!chord && !grace) {
            // do tuplet
            const timeMod = mnd.timeMod()
            const tupletState = tupletStates.at(voice)
            tupletState.determineTupletAction(mnd.duration(), timeMod, tupletStartStop.v, mnd.normalType(), missingPrev, missingCurr)
        }

        // store result
        if (dura.v.isValid() && dura.v.gt(new Fraction(0, 1))) {
            // count the chords
            const voiceInt = this.voiceToInt(voice)
            if (!mxPart.voicelist.has(voiceInt)) {
                mxPart.voicelist.insert(voiceInt, new VoiceDesc())
            }
            mxPart.voicelist.at(voiceInt).incrChordRests(staff)
            // determine note length for voiceInt overlap detection
            vod.addNote(sTime.plus(missingPrev.v).ticks(), sTime.plus(missingPrev.v).plus(dura.v).ticks(), voiceInt, staff)
        }

        this.addError(checkAtEndElement(e, 'note'))
    }

    //---------------------------------------------------------
    //   notePrintSpacingNo
    //---------------------------------------------------------

    /**
     Parse the /score-partwise/part/measure/note node for a note with print-spacing="no".
     These are handled like a forward: only moving the time forward.
     */

    notePrintSpacingNo(dura: { v: Fraction }): void {
        const e = this.m_e
        let chord = false
        let grace = false

        while (e.readNextStartElement()) {
            if (e.name() === 'chord') {
                chord = true
                e.skipCurrentElement()  // skip but don't log
            } else if (e.name() === 'duration') {
                this.duration(dura)
            } else if (e.name() === 'grace') {
                grace = true
                e.skipCurrentElement()  // skip but don't log
            } else {
                e.skipCurrentElement()              // skip but don't log
            }
        }

        // don't count chord or grace note duration
        // note that this does not check the MusicXML requirement that notes in a chord
        // cannot have a duration longer than the first note in the chord
        if (chord || grace) {
            dura.v = new Fraction(0, 1)
        }
    }

    //---------------------------------------------------------
    //   calcTicks
    //---------------------------------------------------------

    /** calcTicks(intTicks, _divisions, xmlReader) and calcTicks(intTicks) (= calcTicks(intTicks, m_divs, &m_e)) */
    calcTicks(intTicks: number, divisions: number = this.m_divs, xmlReader: XmlStreamReader | null = this.m_e): Fraction {
        let dura = new Fraction(0, 1)              // invalid unless set correctly

        if (divisions > 0) {
            dura = new Fraction(intTicks, 4 * divisions)
            dura = dura.reduced() // prevent overflow in later Fraction operations

            // Correct for previously adjusted durations
            // This is necessary when certain tuplets are
            // followed by a <backup> element.
            // There are two strategies:
            // 1. Use a lookup table of previous adjustments
            // 2. Check if within maxDiff of a seenDenominator
            const adjusted = this.m_adjustedDurations.get(dura)
            if (adjusted) {
                dura = adjusted
            } else if (dura.reduced().denominator() > 64) {
                // std::set<int>: in order
                for (const seenDenominator of [...this.m_seenDenominators].sort((a, b) => a - b)) {
                    const seenDenominatorTicks = new Fraction(1, seenDenominator).ticks()
                    if (Math.abs(dura.ticks() % seenDenominatorTicks) <= this.m_maxDiff) {
                        let roundedDura = new Fraction(stdRound(dura.ticks() / seenDenominatorTicks), seenDenominator)
                        roundedDura = roundedDura.reduced()
                        this.m_logger.logError(`calculated duration (${dura.toString()}) assumed to be a rounding error by proximity to (${
                            roundedDura.toString()})`)
                        this.insertAdjustedDuration(dura, roundedDura)
                        dura = roundedDura
                        break
                    }
                }
            }
        } else {
            this.m_logger.logError('illegal or uninitialized divisions', xmlReader)
        }

        return dura
    }

    //---------------------------------------------------------
    //   duration
    //---------------------------------------------------------

    /**
     Parse the /score-partwise/part/measure/note/duration node.
     duration(dura, e) and duration(dura) (= duration(dura, m_e))
     */

    duration(dura: { v: Fraction }, e: XmlStreamReader = this.m_e): void {
        this.m_logger.logDebugTrace('MusicXmlParserPass1::duration', e)

        dura.v = new Fraction(0, 0)    // invalid unless set correctly
        const intDura = e.readInt()
        dura.v = this.calcTicks(intDura)
    }

    //---------------------------------------------------------
    //   forward
    //---------------------------------------------------------

    /**
     Parse the /score-partwise/part/measure/note/forward node.
     */

    forward(dura: { v: Fraction }): void {
        const e = this.m_e
        while (e.readNextStartElement()) {
            if (e.name() === 'duration') {
                this.duration(dura)
            } else if (e.name() === 'staff') {
                e.skipCurrentElement()        // skip but don't log
            } else if (e.name() === 'voice') {
                e.skipCurrentElement()        // skip but don't log
            } else {
                this.skipLogCurrElem()
            }
        }
    }

    //---------------------------------------------------------
    //   backup
    //---------------------------------------------------------

    /**
     Parse the /score-partwise/part/measure/note/backup node.
     */

    backup(dura: { v: Fraction }): void {
        const e = this.m_e
        while (e.readNextStartElement()) {
            if (e.name() === 'duration') {
                this.duration(dura)
            } else {
                this.skipLogCurrElem()
            }
        }
    }

    //---------------------------------------------------------
    //   timeModification
    //---------------------------------------------------------

    /**
     Parse the /score-partwise/part/measure/note/time-modification node.
     */

    timeModification(timeMod: { v: Fraction }): void {
        const e = this.m_e
        let strActual = ''
        let strNormal = ''

        while (e.readNextStartElement()) {
            if (e.name() === 'actual-notes') {
                strActual = e.readText()
            } else if (e.name() === 'normal-notes') {
                strNormal = e.readText()
            } else {
                this.skipLogCurrElem()
            }
        }

        const intActual = strToInt(strActual)
        const intNormal = strToInt(strNormal)
        if (intActual > 0 && intNormal > 0) {
            timeMod.v = new Fraction(intNormal, intActual)
        } else {
            timeMod.v = new Fraction(1, 1)
            this.m_logger.logError(`illegal time-modification: actual-notes ${strActual} normal-notes ${strNormal}`, e)
        }
    }

    /** declared in the C++ header, but not defined (and not used) */
    pitch(step: { v: number }, alter: { v: number }, oct: { v: number }): void {
        void step
        void alter
        void oct
        throw new Error('MusicXmlParserPass1::pitch is not defined in MuseScore')
    }

    //---------------------------------------------------------
    //   rest
    //---------------------------------------------------------

    /**
     Parse the /score-partwise/part/measure/note/rest node.
     */

    rest(): void {
        const e = this.m_e
        while (e.readNextStartElement()) {
            if (e.name() === 'display-octave') {
                e.skipCurrentElement()        // skip but don't log
            } else if (e.name() === 'display-step') {
                e.skipCurrentElement()        // skip but don't log
            } else {
                this.skipLogCurrElem()
            }
        }
    }

    // simple accessors (importmusicxmlpass1.h)

    /** muse::value(m_partMap, id): null if not found */
    getPart(id: string): Part | null { return this.m_partMap.get(id) ?? null }
    /** muse::value(m_parts, id): a copy (a default MusicXmlPart if not found) */
    getMusicXmlPart(id: string): MusicXmlPart { return this.m_parts.get(id)?.clone() ?? new MusicXmlPart() }
    nparts(): number { return this.m_parts.size() }
    /** muse::value(m_instruments, id): a copy (empty if not found) */
    getInstruments(id: string): MusicXmlInstruments { return this.m_instruments.get(id)?.clone() ?? new MusicXmlInstruments() }
    errors(): string { return this.m_errors }
    credits(): CreditWordsList { return this.m_credits }
    hasBeamingInfo(): boolean { return this.m_hasBeamingInfo }
    isVocalStaff(partId: string): boolean { return this.m_parts.get(partId)!.isVocalStaff() }
    isPercussionStaff(partId: string): boolean { return this.m_parts.get(partId)!.isPercussionStaff() }
    setHasInferredHeaderText(b: boolean): void { this.m_hasInferredHeaderText = b }
    hasInferredHeaderText(): boolean { return this.m_hasInferredHeaderText }
    maxDiff(): number { return this.m_maxDiff }
    insertAdjustedDuration(key: Fraction, value: Fraction): void { this.m_adjustedDurations.insert(key, value) }
    adjustedDurations(): FractionMap<Fraction> { return this.m_adjustedDurations }
    insertSeenDenominator(val: number): void { this.m_seenDenominators.add(val) }
    exporterSoftware(): MusicXmlExporterSoftware { return this.m_exporterSoftware }
}
