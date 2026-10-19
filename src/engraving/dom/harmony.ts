/*
 * SPDX-License-Identifier: GPL-3.0-only
 * MuseScore-Web — port of MuseScore Studio (https://github.com/musescore/MuseScore)
 * Copyright (C) 2021-2026 MuseScore Limited and others
 *
 * Port of src/engraving/dom/harmony.h/.cpp
 * TODO(port): editing, RealizedHarmony (playback), accessibility, transposition, fret diagrams/fret boxes
 */

import { FontMetrics } from '../../framework/draw/fontmetrics'
import { Font, FontType } from '../../framework/draw/types/font'
import { LineF, PointF, RectF } from '../../framework/draw/types/geometry'
import type { PropertyValue } from '../types/propertyvalue'
import { DirectionH, ElementType, FontStyle, Key, ParenthesesMode, PlacementV, TextStyleType } from '../types/types'
import { Sid } from '../style/styledef'
import { ChordDescription, HChord, ParsedChord, type ChordList, type HDegree } from './chordlist'
import { ElementFlag } from './engravingitem'
import type { ElementStyle, EngravingObject } from './engravingobject'
import type { Parenthesis } from './parenthesis'
import {
    NoteCaseType, NoteSpellingType, Tpc, convertNote, function2Tpc, tpc2Function, tpc2name, tpcIsValid,
} from './pitchspelling'
import { Pid } from './property'
import type { Score } from './score'
import type { Segment } from './segment'
import { TextBase, TextBaseLayoutData } from './textbase'
import type { FretDiagram } from './fret'

const FALLBACK_SYMBOLTEXT_FONT = 'Bravura Text'

export enum HarmonyType {
    STANDARD,
    ROMAN,
    NASHVILLE,
}

export enum HarmonyRenderItemType {
    TEXT,
    PAREN,
}

export abstract class HarmonyRenderItem {
    private m_hAlign = true
    private m_offset = new PointF() // Offset for placing within the TextBase.
    private m_pos: PointF // Position of segments relative to Harmony position

    constructor(align: boolean, x: number, y: number) {
        this.m_hAlign = align
        this.m_pos = new PointF(x, y)
    }

    pos(): PointF { return this.m_pos.plus(this.m_offset) }
    x(): number { return this.m_pos.x() }
    y(): number { return this.m_pos.y() }
    movex(v: number): void { this.m_pos.setX(this.m_pos.x() + v) }
    movey(v: number): void { this.m_pos.setY(this.m_pos.y() + v) }
    setx(v: number): void { this.m_pos.setX(v) }
    sety(v: number): void { this.m_pos.setY(v) }
    setOffset(p: PointF): void { this.m_offset = p.clone() }

    abstract height(): number
    align(): boolean { return this.m_hAlign }

    abstract boundingRect(): RectF
    abstract tightBoundingRect(): RectF
    abstract leftPadding(): number
    abstract rightPadding(): number

    abstract type(): HarmonyRenderItemType
}

export class ChordSymbolParen extends HarmonyRenderItem {
    private static readonly INNER_PADDING = 0.05
    private static readonly OUTER_PADDING = 0.1

    top = Number.MAX_VALUE
    bottom = -Number.MAX_VALUE
    closingParenPos = -Number.MAX_VALUE

    constructor(public parenItem: Parenthesis, hAlign: boolean, x: number, y: number) {
        super(hAlign, x, y)
    }

    boundingRect(): RectF { return this.parenItem.shape().bbox() }
    tightBoundingRect(): RectF { return this.parenItem.shape().bbox() }

    height(): number { return this.parenItem.height() }
    leftPadding(): number {
        return this.parenItem.direction() === DirectionH.LEFT ? ChordSymbolParen.OUTER_PADDING : ChordSymbolParen.INNER_PADDING
    }

    rightPadding(): number {
        return this.parenItem.direction() === DirectionH.LEFT ? ChordSymbolParen.INNER_PADDING : ChordSymbolParen.OUTER_PADDING
    }

    type(): HarmonyRenderItemType { return HarmonyRenderItemType.PAREN }
}

export class TextSegment extends HarmonyRenderItem {
    private m_font = new Font()
    private m_text = ''

    constructor(s: string, f: Font, x: number, y: number, align: boolean) {
        super(align, x, y)
        this.setText(s)
        this.setFont(f)
    }

    width(): number { return FontMetrics.width(this.m_font, this.m_text) }
    capHeight(): number { return new FontMetrics(this.m_font).capHeight() }
    boundingRect(): RectF { return new FontMetrics(this.m_font).boundingRect(this.m_text) }
    tightBoundingRect(): RectF { return new FontMetrics(this.m_font).tightBoundingRect(this.m_text) }

    setText(t: string): void { this.m_text = t }
    text(): string { return this.m_text }
    font(): Font { return this.m_font }

    setFont(f: Font): void {
        this.m_font = f.clone()
        if (f.type() !== FontType.MusicSymbolText) {
            return
        }

        // Check all symbols in string are available in this font
        const fm = new FontMetrics(f)
        let fail = false
        for (const c of this.m_text) {
            if (!fm.inFont(c.codePointAt(0)!)) {
                fail = true
                break
            }
        }

        // Fallback to default musical text font
        if (fail) {
            this.m_font.setFamily(FALLBACK_SYMBOLTEXT_FONT, FontType.MusicSymbolText)
        }
    }

    leftPadding(): number { return 0.0 }
    rightPadding(): number { return 0.0 }
    height(): number { return this.tightBoundingRect().height() }

    type(): HarmonyRenderItemType { return HarmonyRenderItemType.TEXT }
}

/**
 * Contains all identifying information for a chord. The Harmony DOM class can have many of these as polychords
 */
export class HarmonyInfo {
    private m_id = -1 // >0 = id of matched chord from chord list, if applicable
    // -1 = invalid chord
    // <-10000 = private id of generated chord or matched chord with no id
    private m_rootTpc: number = Tpc.TPC_INVALID // root note for chord
    private m_bassTpc: number = Tpc.TPC_INVALID // bass note or chord bass; used for "slash" chords
    // or notation of bass note in chord
    private m_textName = '' // name recognized from chord list, read from score file, or constructed from imported source
    // Also stores the whole RNA string to be rendered
    private m_parsedChord: ParsedChord | null = null // parsed form of chord

    constructor(private m_score: Score | null) {}

    clone(): HarmonyInfo {
        const h = new HarmonyInfo(this.m_score)
        h.m_id = this.m_id
        h.m_bassTpc = this.m_bassTpc
        h.m_rootTpc = this.m_rootTpc
        h.m_textName = this.m_textName
        h.m_parsedChord = this.m_parsedChord ? this.m_parsedChord.clone() : null
        return h
    }

    id(): number { return this.m_id }
    setId(v: number): void { this.m_id = v }
    rootTpc(): number { return this.m_rootTpc }
    setRootTpc(v: number): void { this.m_rootTpc = v }
    bassTpc(): number { return this.m_bassTpc }
    setBassTpc(v: number): void { this.m_bassTpc = v }
    textName(): string { return this.m_textName }
    setTextName(v: string): void { this.m_textName = v }

    chordList(): ChordList | null { return this.m_score ? this.m_score.chordList() : null }

    /** look up id in chord list; return chord description if found, or null */
    descr(): ChordDescription | null {
        const cl = this.chordList()
        if (!cl) {
            return null
        }
        return cl.description(this.id())
    }

    /**
     * look up name in chord list, optionally look up by parsed chord as fallback;
     * return chord description if found, or null
     */
    descrByName(name: string, pc: ParsedChord | null = null): ChordDescription | null {
        let match: ChordDescription | null = null
        const cl = this.chordList()
        if (!cl) {
            return null
        }
        for (const cd of cl.descriptions()) {
            for (const s of cd.names) {
                if (s === name) {
                    return cd
                }
                if (!pc) {
                    continue
                }
                for (const sParsed of cd.parsedChords) {
                    if (sParsed.equals(pc)) {
                        match = cd
                    }
                }
            }
        }
        // exact match failed, so fall back on parsed match if one was found
        return match
    }

    /**
     * look up id in chord list; return chord description if found;
     * if not found, and chord is parseable, generate a new chord description and add to chord list
     */
    getDescription(): ChordDescription | null {
        let cd = this.descr()
        if (cd && cd.names.length) {
            this.m_textName = cd.names[0]
        } else if (this.m_textName.length) {
            cd = this.generateDescription()
            this.m_id = cd.id
        }
        return cd
    }

    /** same but lookup by name and optionally parsed chord */
    getDescriptionByName(name: string, pc: ParsedChord | null = null): ChordDescription {
        let cd = this.descrByName(name, pc)
        if (cd) {
            this.m_id = cd.id
        } else {
            cd = this.generateDescription()
            this.m_id = cd.id
        }
        return cd
    }

    /** generate new chord description from _textName; add to chord list using private id */
    generateDescription(): ChordDescription {
        const cd = ChordDescription.fromName(this.m_textName)
        cd.complete(this.getParsedChord(), this.chordList()!)
        // remove parsed chord from description
        // so we will only match it literally in the future
        cd.parsedChords = []
        this.chordList()!.insert(cd.id, cd)
        return this.chordList()!.description(cd.id)!
    }

    setParsedChord(v: ParsedChord | null): void { this.m_parsedChord = v }
    parsedChord(): ParsedChord | null { return this.m_parsedChord }

    getParsedChord(): ParsedChord {
        if (!this.m_parsedChord) {
            this.m_parsedChord = new ParsedChord()
            this.m_parsedChord.parse(this.m_textName, this.chordList(), false)
        }
        return this.m_parsedChord
    }

    hasModifiers(): boolean {
        return this.m_parsedChord ? this.m_parsedChord.modifiers().length > 0 : false
    }
}

const chordSymbolStyle: ElementStyle = [
    { sid: Sid.harmonyPlacement, pid: Pid.PLACEMENT },
    { sid: Sid.minHarmonyDistance, pid: Pid.MIN_DISTANCE },
    { sid: Sid.chordBassNoteScale, pid: Pid.HARMONY_BASS_SCALE },
    { sid: Sid.harmonyVoiceLiteral, pid: Pid.HARMONY_VOICE_LITERAL },
    { sid: Sid.harmonyVoicing, pid: Pid.HARMONY_VOICING },
    { sid: Sid.harmonyDuration, pid: Pid.HARMONY_DURATION },
]

export class HarmonyLayoutData extends TextBaseLayoutData {
    harmonyHeight = 0.0 // used for calculating the height is frame while editing.
    polychordDividerLines: LineF[] = []
    polychordDividerOffset = 0.0
    baseline: number | null = null
    fontList: Font[] = [] // temp values used in render()
    renderItemList: HarmonyRenderItem[] = [] // rendered chord
}

/**
 * This DOM class represents the chord symbol in the score. It contains the necessary information to
 * layout standard chords and polychords
 */
export class Harmony extends TextBase {
    private m_chords: HarmonyInfo[] = []

    private m_isMisspelled = false // show spell check warning
    private m_harmonyType = HarmonyType.STANDARD // used to control rendering, transposition, export, etc.
    private m_degreeList: HDegree[] = []
    private m_play = true // whether or not to play back the harmony
    private m_doNotStackModifiers = false
    private m_rootCase = NoteCaseType.AUTO
    private m_bassCase = NoteCaseType.AUTO // case as typed

    private m_bassScale = 1.0

    // RealizedHarmony properties (TODO(port): RealizedHarmony)
    private m_voiceLiteral = false
    private m_voicing = 0
    private m_duration = 0

    // Overridden textbase properties to apply to whole item
    private m_fontSize = 10.0
    private m_fontFamily = ''
    private m_fontStyle = FontStyle.Normal

    constructor(parent: EngravingObject | null) {
        super(ElementType.HARMONY, parent, TextStyleType.HARMONY_A, ElementFlag.MOVABLE | ElementFlag.ON_STAFF)
        this.m_rootCase = NoteCaseType.CAPITAL
        this.m_bassCase = NoteCaseType.CAPITAL
        this.m_harmonyType = HarmonyType.STANDARD
        this.m_play = true
        this.initElementStyle(chordSymbolStyle)
    }

    protected override onCloned(original: this): void {
        super.onCloned(original)
        this.m_degreeList = [...original.m_degreeList]
        this.m_chords = original.m_chords.map(hi => hi.clone())
    }

    protected override createLayoutData(): HarmonyLayoutData { return new HarmonyLayoutData(this) }
    override ldata(): HarmonyLayoutData { return super.ldata() as HarmonyLayoutData }
    override mutldata(): HarmonyLayoutData { return super.ldata() as HarmonyLayoutData }

    id(): number {
        if (this.m_chords.length === 0) {
            return -1
        }
        return this.m_chords[0].id()
    }

    play(): boolean { return this.m_play }
    setBassCase(c: NoteCaseType): void { this.m_bassCase = c }
    bassCase(): NoteCaseType { return this.m_bassCase }
    setRootCase(c: NoteCaseType): void { this.m_rootCase = c }
    rootCase(): NoteCaseType { return this.m_rootCase }

    /** gets the parent segment of this harmony */
    getParentSeg(): Segment | null {
        const p = this.explicitParent()
        if (p && p.isFretDiagram()) {
            // When this harmony is the child of a fret diagram, we need to go up twice
            // to get to the parent seg.
            return (p as unknown as { segment(): Segment | null }).segment()
        }
        return p as unknown as Segment | null
    }

    getParentFretDiagram(): FretDiagram | null {
        const p = this.explicitParent()
        if (p && p.isFretDiagram()) {
            return p as unknown as FretDiagram
        }
        return null
    }

    isInFretBox(): boolean {
        const parent = this.explicitParent()
        if (!parent) {
            return false
        }
        if (parent.isFretDiagram()) {
            return (parent as unknown as { isInFretBox(): boolean }).isInFretBox()
        }
        return parent.isFBox()
    }

    isRealizable(): boolean {
        if (this.m_chords.length === 0) {
            return false
        }
        for (const info of this.m_chords) {
            if (!tpcIsValid(info.rootTpc())) {
                return false
            }
        }
        return true
    }

    bassTpc(): number {
        if (this.m_chords.length === 0) {
            return Tpc.TPC_INVALID
        }
        return this.m_chords[0].bassTpc()
    }

    rootTpc(): number {
        if (this.m_chords.length === 0) {
            return Tpc.TPC_INVALID
        }
        return this.m_chords[0].rootTpc()
    }

    addDegree(d: HDegree): void { this.m_degreeList.push(d) }
    degreeList(): readonly HDegree[] { return this.m_degreeList }

    harmonyType(): HarmonyType { return this.m_harmonyType }

    setHarmonyType(val: HarmonyType): void {
        this.m_harmonyType = val
        this.setPlacement(this.propertyDefault(Pid.PLACEMENT) as PlacementV)
        switch (this.m_harmonyType) {
        case HarmonyType.STANDARD:
            this.initTextStyleType(TextStyleType.HARMONY_A)
            break
        case HarmonyType.ROMAN:
            this.initTextStyleType(TextStyleType.HARMONY_ROMAN)
            break
        case HarmonyType.NASHVILLE:
            this.initTextStyleType(TextStyleType.HARMONY_NASHVILLE)
            break
        }
    }

    parsedForm(): ParsedChord | null {
        if (this.m_chords.length === 0) {
            return null
        }
        return this.m_chords[0].getParsedChord()
    }

    isPolychord(): boolean { return this.m_chords.length > 1 }
    chords(): readonly HarmonyInfo[] { return this.m_chords }
    addChord(info: HarmonyInfo): void { this.m_chords.push(info) }

    hasModifiers(): boolean {
        for (const info of this.m_chords) {
            if (info.hasModifiers()) {
                return true
            }
        }
        return false
    }

    afterRead(): void {
        // TODO: now that we can render arbitrary chords,
        // we could try to construct a full representation from a degree list.
        // These will typically only exist for chords imported from MusicXML prior to MuseScore 2.0
        // or constructed in the Chord Symbol Properties dialog.
        for (const info of this.m_chords) {
            if (tpcIsValid(info.rootTpc())) {
                if (info.id() > 0) {
                    // positive id will happen only for scores that were created with explicit chord lists
                    // lookup id in chord list and generate new description if necessary
                    info.getDescription()
                } else {
                    // default case: look up by name
                    // description will be found for any chord already read in this score
                    // and we will generate a new one if necessary
                    info.getDescriptionByName(info.textName())
                }
            } else if (info.textName().length === 0) {
                // unrecognized chords prior to 2.0 were stored as text with markup
                // we need to strip away the markup
                // this removes any user-applied formatting,
                // but we no longer support user-applied formatting for chord symbols anyhow
                // with any luck, the resulting text will be parseable now, so give it a shot
                this.createBlocks()
                const s = this.plainText()
                if (s.length) {
                    this.setHarmony(s)
                    return
                }
                // empty text could also indicate a root-less slash chord ("/E")
                // we'll fall through and render it normally
            }
        }

        // render chord from description (or _textName)
        this.setPlainText(this.harmonyName())
    }

    harmonyName(): string {
        let name = ''
        if (this.leftParen()) {
            name = '('
        }
        for (let i = 0; i < this.m_chords.length; i++) {
            const info = this.m_chords[i]
            const hc = info.descr() ? info.descr()!.chord.clone() : new HChord()
            let r = ''
            let e = ''
            let b = ''

            if (i !== 0) {
                name += '|'
            }

            if (this.m_harmonyType === HarmonyType.STANDARD && tpcIsValid(info.rootTpc())) {
                const spelling = this.style().styleV(Sid.chordSymbolSpelling) as NoteSpellingType
                r = tpc2name(info.rootTpc(), spelling, this.m_rootCase)
            } else if (this.m_harmonyType === HarmonyType.NASHVILLE && tpcIsValid(info.rootTpc())) {
                const st = this.staff()
                const key = st ? st.key(this.tick()) : Key.INVALID
                r = tpc2Function(info.rootTpc(), key)
            }

            if (info.textName().length) {
                e = info.textName()
                if (this.m_harmonyType !== HarmonyType.ROMAN) {
                    e = e.replace(/=/g, '')
                }
            } else if (this.m_degreeList.length) {
                hc.add(this.m_degreeList)
                // try to find the chord in chordList
                let newExtension: ChordDescription | null = null
                const cl = this.score().chordList()
                for (const cd of cl.descriptions()) {
                    if (cd.chord.equals(hc) && cd.names.length) {
                        newExtension = cd
                        break
                    }
                }
                // now determine the chord name
                if (newExtension) {
                    e = newExtension.names[0]
                } else {
                    // not in table, fallback to using HChord.name()
                    r = hc.name(info.rootTpc())
                    e = ''
                }
            }

            if (tpcIsValid(info.bassTpc())) {
                const spelling = this.style().styleV(Sid.chordSymbolSpelling) as NoteSpellingType
                b = '/' + tpc2name(info.bassTpc(), spelling, this.m_bassCase)
            }

            name += r + e + b
        }

        if (this.rightParen()) {
            name += ')'
        }

        return name
    }

    /** C++ String::simplified() */
    private static simplified(s: string): string {
        return s.trim().replace(/\s+/g, ' ')
    }

    /**
     * determine root and bass tpc & case, compare body of chordname against chord list;
     * return true if chord is recognized
     */
    private parseHarmony(ss: string, syntaxOnly = false): (ChordDescription | null)[] {
        // pre-process for parentheses
        let s = Harmony.simplified(ss)
        if (s.startsWith('(')) {
            this.setParenthesesMode(this.rightParen() ? ParenthesesMode.BOTH : ParenthesesMode.LEFT, true, false)
            s = s.substring(1)
        } else {
            this.setParenthesesMode(this.rightParen() ? ParenthesesMode.RIGHT : ParenthesesMode.NONE, true, false)
        }
        const count = (c: string): number => s.split(c).length - 1
        if (s.endsWith(')') && count('(') < count(')')) {
            this.setParenthesesMode(this.leftParen() ? ParenthesesMode.BOTH : ParenthesesMode.RIGHT, true, false)
            s = s.substring(0, s.length - 1)
        } else {
            this.setParenthesesMode(this.leftParen() ? ParenthesesMode.LEFT : ParenthesesMode.NONE, true, false)
        }

        if (this.parenthesesMode() === ParenthesesMode.BOTH) {
            s = Harmony.simplified(s) // in case of spaces inside parentheses
        }

        this.m_chords = []

        const descriptions: (ChordDescription | null)[] = []

        if (s.length === 0) {
            return descriptions
        }

        const chords = s.split('|')
        for (const subChord of chords) {
            if (subChord.length === 0) {
                continue
            }
            const info = new HarmonyInfo(this.score())
            const cd = this.parseSingleHarmony(subChord, info, syntaxOnly)
            descriptions.push(cd)
            this.m_chords.push(info)
        }

        return descriptions
    }

    private parseSingleHarmony(ss: string, info: HarmonyInfo, syntaxOnly = false): ChordDescription | null {
        let s = Harmony.simplified(ss)

        if (this.m_harmonyType === HarmonyType.ROMAN) {
            info.setTextName(s)
            info.setRootTpc(Tpc.TPC_INVALID)
            info.setBassTpc(Tpc.TPC_INVALID)
            return null
        }

        let useLiteral = false
        if (ss.endsWith(' ')) {
            useLiteral = true
        }

        // pre-process for lower case minor chords
        let preferMinor: boolean
        const first = s.charAt(0)
        if (this.style().styleB(Sid.lowerCaseMinorChords) && first !== first.toUpperCase() && first === first.toLowerCase()) {
            preferMinor = true
        } else {
            preferMinor = false
        }

        let idx = 0
        const st = this.staff()
        const key = st ? st.key(this.tick()) : Key.INVALID
        const spelling = this.style().styleV(Sid.chordSymbolSpelling) as NoteSpellingType
        let r: number = Tpc.TPC_INVALID
        if (this.m_harmonyType === HarmonyType.STANDARD) {
            const res = convertNote(s, spelling, this.m_rootCase)
            r = res.tpc
            this.m_rootCase = res.noteCase
            idx = res.idx
        } else if (this.m_harmonyType === HarmonyType.NASHVILLE) {
            const res = function2Tpc(s, key)
            r = res.tpc
            idx = res.idx
        }
        if (!tpcIsValid(r)) {
            if (s.charAt(0) === '/') {
                idx = 0
            } else {
                info.setTextName(s)
                return null
            }
        }
        info.setRootTpc(r)
        info.setBassTpc(Tpc.TPC_INVALID)
        const slash = s.lastIndexOf('/')
        if (slash !== -1) {
            const bs = Harmony.simplified(s.substring(slash + 1))
            s = Harmony.simplified(s.substring(idx, slash))
            let idx2 = 0
            if (this.m_harmonyType === HarmonyType.STANDARD) {
                const res = convertNote(bs, spelling, this.m_bassCase)
                info.setBassTpc(res.tpc)
                this.m_bassCase = res.noteCase
                idx2 = res.idx
            } else if (this.m_harmonyType === HarmonyType.NASHVILLE) {
                const res = function2Tpc(bs, key)
                info.setBassTpc(res.tpc)
                idx2 = res.idx
            }
            if (idx2 !== bs.length) {
                info.setBassTpc(Tpc.TPC_INVALID)
            }
            if (!tpcIsValid(info.bassTpc())) {
                // if what follows after slash is not (just) a TPC
                // then reassemble chord and try to parse with the slash
                s = s + '/' + bs
            }
        } else {
            s = s.substring(idx) // don't simplify; keep leading space before extension if present
        }

        const cl = this.score().chordList()
        let cd: ChordDescription | null = null
        if (useLiteral) {
            cd = info.descrByName(s)
        } else {
            const pc = new ParsedChord()
            pc.parse(s, cl, syntaxOnly, preferMinor)
            // parser prepends "=" to name of implied minor chords
            // use this here as well
            if (preferMinor) {
                s = pc.name()
            }
            // look up to see if we already have a descriptor (chord has been used before)
            cd = info.descrByName(s, pc)
            info.setParsedChord(pc)
        }
        if (cd) {
            // descriptor found; use its information
            info.setId(cd.id)
            if (cd.names.length) {
                info.setTextName(cd.names[0])
            }
        } else {
            // no descriptor yet; just set textname
            // we will generate descriptor later if necessary (when we are done editing this chord)
            info.setTextName(s)
        }
        return cd
    }

    rootRenderCase(info: HarmonyInfo): NoteCaseType {
        // case
        // always use case as typed if automatic capitalization is off
        let noteCase = this.m_rootCase
        if (!this.style().styleB(Sid.automaticCapitalization)) {
            return noteCase
        }

        // set default
        if (this.style().styleB(Sid.allCapsNoteNames)) {
            noteCase = NoteCaseType.UPPER
        } else {
            noteCase = NoteCaseType.CAPITAL
        }

        // override for minor chords
        if (this.style().styleB(Sid.lowerCaseMinorChords)) {
            const cd = info.descr()
            let quality: string
            if (cd) {
                // use chord description if possible
                // this is the usual case
                quality = cd.quality()
            } else if (info.parsedChord()) {
                // this happens on load of new chord list
                // for chord symbols that were added/edited since the score was loaded
                // or read aloud with screenreader
                // parsed form is usable even if out of date with respect to chord list
                quality = info.getParsedChord().quality()
            } else {
                // this happens on load of new chord list
                // for chord symbols that have not been edited since the score was loaded
                // we need to parse this chord for now to determine quality
                // but don't keep the parsed form around as we're not ready for it yet
                quality = info.getParsedChord().quality()
                info.setParsedChord(null)
            }
            if (quality === 'minor' || quality === 'diminished' || quality === 'half-diminished') {
                noteCase = NoteCaseType.LOWER
            }
        }

        return noteCase
    }

    bassRenderCase(): NoteCaseType {
        // case
        // always use case as typed if automatic capitalization is off
        let noteCase = this.m_bassCase
        if (!this.style().styleB(Sid.automaticCapitalization)) {
            return noteCase
        }

        // set default
        if (this.style().styleB(Sid.allCapsNoteNames)) {
            noteCase = NoteCaseType.UPPER
        } else {
            noteCase = NoteCaseType.CAPITAL
        }

        // override for bass note
        if (this.style().styleB(Sid.lowerCaseBassNotes)) {
            noteCase = NoteCaseType.LOWER
        }

        return noteCase
    }

    isPlayable(): boolean { return !this.isInFretBox() }

    setHarmony(s: string): void {
        const descriptions = this.parseHarmony(s)

        for (let i = 0; i < this.m_chords.length; i++) {
            const info = this.m_chords[i]
            let cd = i < descriptions.length ? descriptions[i] : null
            if (!cd && info.getParsedChord().parseable()) {
                // our first time encountering this chord
                // generate a descriptor and use it
                cd = info.generateDescription()
                info.setId(cd.id)
            }

            if (!cd) {
                // unparseable chord or roman numeral, render as plain text
                info.setRootTpc(Tpc.TPC_INVALID)
                info.setBassTpc(Tpc.TPC_INVALID)
                info.setId(-1)
            }
        }
    }

    override baseLine(): number {
        const ldata = this.ldata()
        if (ldata.renderItemList.length === 0 || ldata.baseline === null) {
            return super.baseLine()
        }
        return ldata.baseline
    }

    override subtype(): number { return this.harmonyType() }

    override getProperty(pid: Pid): PropertyValue {
        switch (pid) {
        case Pid.PLAY:
            return this.m_play
        case Pid.HARMONY_TYPE:
            return this.m_harmonyType
        case Pid.HARMONY_BASS_SCALE:
            return this.m_bassScale
        case Pid.HARMONY_VOICE_LITERAL:
            return this.m_voiceLiteral
        case Pid.HARMONY_VOICING:
            return this.m_voicing
        case Pid.HARMONY_DURATION:
            return this.m_duration
        case Pid.HARMONY_DO_NOT_STACK_MODIFIERS:
            return this.m_doNotStackModifiers
        case Pid.FONT_SIZE:
            return this.m_fontSize
        case Pid.FONT_STYLE:
            return this.m_fontStyle
        case Pid.FONT_FACE:
            return this.m_fontFamily
        default:
            return super.getProperty(pid)
        }
    }

    override setProperty(pid: Pid, v: PropertyValue): boolean {
        switch (pid) {
        case Pid.PLAY:
            this.m_play = !!v
            break
        case Pid.HARMONY_TYPE:
            this.setHarmonyType(v as HarmonyType)
            break
        case Pid.HARMONY_BASS_SCALE:
            this.setBassScale(v as number)
            break
        case Pid.HARMONY_VOICE_LITERAL:
            this.m_voiceLiteral = !!v
            break
        case Pid.HARMONY_VOICING:
            this.m_voicing = v as number
            break
        case Pid.HARMONY_DURATION:
            this.m_duration = v as number
            break
        case Pid.HARMONY_DO_NOT_STACK_MODIFIERS:
            this.m_doNotStackModifiers = !!v
            break
        case Pid.TEXT:
            super.setProperty(pid, v)
            this.setHarmony(v as string)
            // TODO(port): update fret diagrams / fret box
            break
        default:
            return super.setProperty(pid, v)
        }
        return true
    }

    override propertyDefault(id: Pid): PropertyValue {
        switch (id) {
        case Pid.HARMONY_TYPE:
            return HarmonyType.STANDARD
        case Pid.TEXT_STYLE:
            switch (this.m_harmonyType) {
            case HarmonyType.STANDARD:
                return TextStyleType.HARMONY_A
            case HarmonyType.ROMAN:
                return TextStyleType.HARMONY_ROMAN
            case HarmonyType.NASHVILLE:
                return TextStyleType.HARMONY_NASHVILLE
            }
            break
        case Pid.HARMONY_BASS_SCALE:
            return this.style().styleD(Sid.chordBassNoteScale)
        case Pid.HARMONY_DO_NOT_STACK_MODIFIERS:
            return false
        case Pid.PLAY:
            return true
        case Pid.OFFSET: {
            const p = this.explicitParent()
            if (p && p.isFretDiagram() && (p as unknown as { visible(): boolean }).visible()) {
                return new PointF(0.0, 0.0)
            }
            break
        }
        default:
            break
        }
        return super.propertyDefault(id)
    }

    override positionRelativeToNoteheadRest(): boolean {
        return !this.parent()!.isFretDiagram()
    }

    override getPropertyStyle(pid: Pid): Sid {
        if (pid === Pid.OFFSET) {
            const p = this.explicitParent()
            if (p && p.isFretDiagram() && (p as unknown as { visible(): boolean }).visible()) {
                return Sid.NOSTYLE
            } else if (this.textStyleType() === TextStyleType.HARMONY_A) {
                return this.placeAbove() ? Sid.chordSymbolAPosAbove : Sid.chordSymbolAPosBelow
            } else if (this.textStyleType() === TextStyleType.HARMONY_B) {
                return this.placeAbove() ? Sid.chordSymbolBPosAbove : Sid.chordSymbolBPosBelow
            } else if (this.textStyleType() === TextStyleType.HARMONY_ROMAN) {
                return this.placeAbove() ? Sid.romanNumeralPosAbove : Sid.romanNumeralPosBelow
            } else if (this.textStyleType() === TextStyleType.HARMONY_NASHVILLE) {
                return this.placeAbove() ? Sid.nashvilleNumberPosAbove : Sid.nashvilleNumberPosBelow
            }
        }
        if (pid === Pid.PLACEMENT) {
            switch (this.m_harmonyType) {
            case HarmonyType.STANDARD:
                return Sid.harmonyPlacement
            case HarmonyType.ROMAN:
                return Sid.romanNumeralPlacement
            case HarmonyType.NASHVILLE:
                return Sid.nashvilleNumberPlacement
            }
        }
        return super.getPropertyStyle(pid)
    }

    bassScale(): number { return this.m_bassScale }
    setBassScale(v: number): void { this.m_bassScale = v }

    doNotStackModifiers(): boolean { return this.m_doNotStackModifiers }

    override fontStyle(): FontStyle { return this.m_fontStyle }
    override family(): string { return this.m_fontFamily }
    override size(): number { return this.m_fontSize }

    override setFontStyle(val: FontStyle): void { this.m_fontStyle = val }
    override setFamily(val: string): void { this.m_fontFamily = val }
    override setSize(val: number): void { this.m_fontSize = val }

    isMisspelled(): boolean { return this.m_isMisspelled }
}
