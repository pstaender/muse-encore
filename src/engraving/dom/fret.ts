/*
 * SPDX-License-Identifier: GPL-3.0-only
 * MuseEncore — port of MuseScore Studio (https://github.com/musescore/MuseScore)
 * Copyright (C) 2021-2026 MuseScore Limited and others
 *
 * Port of src/engraving/dom/fret.h/.cpp
 * The harmony to diagram data (data/harmony_to_diagram.xml, in fonts/) is registered by initEngravingFonts and read on
 * first use like in C++.
 */

import { MoveElementAnchors } from './anchors'
import { Font, FontType } from '../../framework/draw/types/font'
import type { PainterPath } from '../../framework/draw/types/painterpath'
import { LineF, PointF, type RectF } from '../../framework/draw/types/geometry'
import type { EditData } from '../editing/editdata'
import { Align, AlignH, AlignV, ElementType, FontStyle, NoteSpellingType, Orientation, type track_idx_t } from '../types/types'
import { P_TYPE, type PropertyValue } from '../types/propertyvalue'
import { Sid } from '../style/styledef'
import { ElementFlag, EngravingItem, LayoutData } from './engravingitem'
import type { ElementStyle, EngravingObject } from './engravingobject'
import type { Harmony } from './harmony'
import { Pid, PropertyFlags, propertyType } from './property'
import type { Segment } from './segment'
import { NoteCaseType, Tpc, convertNote, tpcIsValid } from './pitchspelling'
import { ParsedChord, type ChordList } from './chordlist'
import { XmlReader } from '../rw/xmlreader'
import { HarmonyToDiagramReader } from '../rw/harmonytodiagramreader'
import { ReadContext } from '../rw/read460/readcontext'
import { TRead } from '../rw/read460/tread'
import { Factory } from './factory'
import { scoreDummy } from '../compat/dummyelement'
import { Link } from '../editing/addremoveelement'
import { isPaletteScore } from './palettescore'
import { FretClear, FretBarre as FretBarreCmd, FretDot as FretDotCmd, FretMarker as FretMarkerCmd } from '../editing/editfretboarddiagram'

export enum FretDotType {
    NORMAL = 0,
    CROSS,
    SQUARE,
    TRIANGLE = 3,
}

export enum FretMarkerType {
    NONE,
    CIRCLE,
    CROSS,
}

export class FretBarre {
    constructor(public startString = -1, public endString = -1) {}
    exists(): boolean { return this.startString > -1 }
    clone(): FretBarre { return new FretBarre(this.startString, this.endString) }
}

export class FretDot {
    fingering = 0 // NOTE:JT - possible future feature?

    constructor(public fret = 0, public dtype = FretDotType.NORMAL, public isPartOfSlurBarre = false) {}
    exists(): boolean { return this.fret > 0 }
    clone(): FretDot { return new FretDot(this.fret, this.dtype, this.isPartOfSlurBarre) }
}

export class FretMarker {
    constructor(public mtype = FretMarkerType.NONE) {}
    exists(): boolean { return this.mtype !== FretMarkerType.NONE }
}

const markerTypeNameMap: readonly [FretMarkerType, string][] = [
    [FretMarkerType.CIRCLE, 'circle'],
    [FretMarkerType.CROSS, 'cross'],
    [FretMarkerType.NONE, 'none'],
]

const dotTypeNameMap: readonly [FretDotType, string][] = [
    [FretDotType.NORMAL, 'normal'],
    [FretDotType.CROSS, 'cross'],
    [FretDotType.SQUARE, 'square'],
    [FretDotType.TRIANGLE, 'triangle'],
]

export class FretItem {
    static markerToChar(t: FretMarkerType): string {
        switch (t) {
        case FretMarkerType.CIRCLE: return 'O'
        case FretMarkerType.CROSS: return 'X'
        default:
            return ''
        }
    }

    static markerTypeToName(t: FretMarkerType): string {
        return markerTypeNameMap.find(i => i[0] === t)?.[1] ?? ''
    }

    static nameToMarkerType(n: string): FretMarkerType {
        return markerTypeNameMap.find(i => i[1] === n)?.[0] ?? FretMarkerType.NONE
    }

    static dotTypeToName(t: FretDotType): string {
        return dotTypeNameMap.find(i => i[0] === t)?.[1] ?? ''
    }

    static nameToDotType(n: string): FretDotType {
        return dotTypeNameMap.find(i => i[1] === n)?.[0] ?? FretDotType.NORMAL
    }
}

const fretStyle: ElementStyle = [
    { sid: Sid.fretNumPos, pid: Pid.FRET_NUM_POS },
    { sid: Sid.fretMag, pid: Pid.MAG },
    { sid: Sid.fretPlacement, pid: Pid.PLACEMENT },
    { sid: Sid.fretStrings, pid: Pid.FRET_STRINGS },
    { sid: Sid.fretFrets, pid: Pid.FRET_FRETS },
    { sid: Sid.fretNut, pid: Pid.FRET_NUT },
    { sid: Sid.fretMinDistance, pid: Pid.MIN_DISTANCE },
    { sid: Sid.fretOrientation, pid: Pid.ORIENTATION },
    { sid: Sid.fretShowFingerings, pid: Pid.FRET_SHOW_FINGERINGS },
]

export class FingeringItem {
    constructor(public fingerNumber: string, public pos: PointF) {}
}

export class FretDiagramLayoutData extends LayoutData {
    stringLineWidth = 0.0
    nutLineWidth = 0.0
    nutY = 0.0
    stringDist = 0.0
    fretDist = 0.0
    markerSize = 0.0
    markerY = 0.0
    stringExtendTop = 0.0
    stringExtendBottom = 0.0
    dotDiameter = 0.0
    fretNumPadding = 0.0
    gridHeight = 0.0
    fingeringItems: FingeringItem[] = []
    slurPaths: PainterPath[] = []
    fretText = ''
}

/** C++ DiagramInfo */
export interface DiagramInfo {
    harmonyName: string
    diagramXml: string
    diagramPattern: string
}

/** C++ HarmonyMapKey (the std::map key as a string) */
function harmonyMapKey(keys: number, rootTpc: number, bassTpc: number): string {
    return `${keys}:${rootTpc}:${bassTpc}`
}

const s_harmonyToDiagramMap = new Map<string, DiagramInfo[]>()
/** in the order of the file (C++: the order of an unordered_map) */
const s_diagramPatternToHarmoniesMap = new Map<string, string[]>()
let s_harmonyToDiagramFile: Uint8Array | string | null = null

/** C++ String::simplified() */
function simplified(s: string): string {
    return s.trim().replace(/\s+/g, ' ')
}

function createHarmonyMapKey(harmony: string, spellingType: NoteSpellingType, cl: ChordList | null): string {
    let s = harmony
    const { tpc: rootTpc, idx } = convertNote(s, spellingType, NoteCaseType.AUTO)

    let bassTpc: number = Tpc.TPC_INVALID
    const slash = s.lastIndexOf('/')
    if (slash !== -1) {
        const bs = simplified(s.substring(slash + 1))
        s = simplified(s.substring(idx, slash))
        bassTpc = convertNote(bs, spellingType, NoteCaseType.AUTO).tpc

        if (!tpcIsValid(bassTpc)) {
            // if what follows after slash is not (just) a TPC
            // then reassemble chord and try to parse with the slash
            s = s + '/' + bs
        }
    } else {
        s = s.substring(idx)
    }

    const chord = new ParsedChord()
    chord.parse(s, cl) // C++: LOGE() << "Error parse " << harmony

    const keys = chord.keys()

    return harmonyMapKey(keys, rootTpc, bassTpc)
}

function resolveDiagram(diagrams: readonly DiagramInfo[]): DiagramInfo {
    const isSimpler = (a: DiagramInfo, b: DiagramInfo): boolean => {
        const harmonyNameA = a.harmonyName
        const harmonyNameB = b.harmonyName

        if (harmonyNameA.length !== harmonyNameB.length) {
            return harmonyNameA.length < harmonyNameB.length
        }

        return harmonyNameA < harmonyNameB
    }

    let result = diagrams[0]
    for (let i = 1; i < diagrams.length; ++i) {
        if (!isSimpler(result, diagrams[i])) {
            result = diagrams[i]
        }
    }

    return result
}

/** the state of a diagram that the fret undo commands restore (C++ FretUndoData) */
export interface FretDiagramData {
    barres: Map<number, FretBarre>
    markers: Map<number, FretMarker>
    dots: Map<number, FretDot[]>
    strings: number
    frets: number
    fretOffset: number
    maxFrets: number
    showNut: boolean
    orientation: Orientation
    userMag: number
    showFingering: boolean
}

function cloneBarres(m: Map<number, FretBarre>): Map<number, FretBarre> {
    return new Map([...m].map(([k, v]) => [k, v.clone()]))
}

function cloneDots(m: Map<number, FretDot[]>): Map<number, FretDot[]> {
    return new Map([...m].map(([k, v]) => [k, v.map(d => d.clone())]))
}

/** iterate a C++ std::map<int, T> in key order */
function sortedEntries<T>(m: Map<number, T>): [number, T][] {
    return [...m.entries()].sort((a, b) => a[0] - b[0])
}

export class FretDiagram extends EngravingItem {
    private m_strings = 0
    private m_frets = 0
    private m_fretOffset = 0
    private m_maxFrets = 0
    private m_showNut = false
    private m_orientation = Orientation.VERTICAL

    private m_barres = new Map<number, FretBarre>()
    private m_dots = new Map<number, FretDot[]>()
    private m_markers = new Map<number, FretMarker>()

    private m_harmony: Harmony | null = null

    private m_userMag = 1.0 // allowed 0.1 - 10.0

    private m_showFingering = false
    private m_fingering: number[] = []

    constructor(parent: EngravingObject | null) {
        super(ElementType.FRET_DIAGRAM, parent, ElementFlag.MOVABLE | ElementFlag.ON_STAFF)
        this.initDefaultValues()

        this.initElementStyle(fretStyle)
    }

    protected override onCloned(original: this): void {
        super.onCloned(original)
        this.m_barres = new Map([...original.m_barres].map(([k, v]) => [k, v.clone()]))
        this.m_dots = new Map([...original.m_dots].map(([k, v]) => [k, v.map(d => d.clone())]))
        this.m_markers = new Map(original.m_markers)
        this.m_harmony = null
        if (original.m_harmony) {
            this.add(original.m_harmony.clone())
        }
    }

    protected override createLayoutData(): FretDiagramLayoutData { return new FretDiagramLayoutData(this) }
    override ldata(): FretDiagramLayoutData { return super.ldata() as FretDiagramLayoutData }
    override mutldata(): FretDiagramLayoutData { return super.ldata() as FretDiagramLayoutData }

    private initDefaultValues(): void {
        this.m_strings = 6
        this.m_frets = 4
        this.m_fretOffset = 0
        this.m_maxFrets = 24
        this.m_showNut = true
        this.m_orientation = Orientation.VERTICAL

        this.m_userMag = 1.0

        this.m_showFingering = false
        this.m_fingering = new Array<number>(this.m_strings).fill(0)
    }

    segment(): Segment | null {
        const parent = this.explicitParent()
        if (!parent || !parent.isSegment()) {
            return null
        }
        return parent as unknown as Segment
    }

    /** C++ linkedClone() */
    override linkedClone(): EngravingItem {
        const e = this.clone()
        e.setAutoplace(true)
        if (this.m_harmony) {
            const newHarmony = this.m_harmony.linkedClone()
            e.add(newHarmony)
        }
        this.score().undo(new Link(e, this))
        return e
    }

    updateDiagram(harmonyName: string): void {
        const availableDiagrams = this.patternsFromHarmony(harmonyName)
        if (!availableDiagrams.length) {
            return
        }

        const diagramXml = resolveDiagram(availableDiagrams).diagramXml

        if (!diagramXml) {
            return
        }

        this.clear()

        const ctx = new ReadContext(this.score())
        const reader = new XmlReader(diagramXml)

        TRead.readFretDiagram(this, reader, ctx)

        this.triggerLayout()
    }

    mainWidth(): number {
        let mainWidth = 0.0
        if (this.orientation() === Orientation.VERTICAL) {
            mainWidth = this.ldata().stringDist * (this.strings() - 1)
        } else if (this.orientation() === Orientation.HORIZONTAL) {
            mainWidth = this.ldata().fretDist * this.frets()
        }
        return mainWidth
    }

    strings(): number { return this.m_strings }
    frets(): number { return this.m_frets }
    setFrets(n: number): void { this.m_frets = n }

    setStrings(n: number): void {
        const difference = n - this.m_strings
        if (difference === 0 || n <= 0) {
            return
        }

        // Move all dots, makers, barres to the RIGHT, so we add strings to the left
        // This is more useful - few instruments need strings added to the right.
        const tempDots = new Map<number, FretDot[]>()
        const tempMarkers = new Map<number, FretMarker>()

        for (let string = 0; string < this.m_strings; ++string) {
            if (string + difference < 0) {
                continue
            }

            for (const d of this.dot(string)) {
                if (d.exists()) {
                    const list = tempDots.get(string + difference) ?? []
                    list.push(d.clone())
                    tempDots.set(string + difference, list)
                }
            }

            if (this.marker(string).exists()) {
                tempMarkers.set(string + difference, this.marker(string))
            }
        }

        this.m_dots = tempDots
        this.m_markers = tempMarkers

        for (let fret = 1; fret <= this.m_frets; ++fret) {
            if (this.barre(fret).exists()) {
                const b = this.m_barres.get(fret)!
                if (b.startString + difference <= 0) {
                    this.removeBarre(fret)
                    continue
                }

                b.startString = Math.max(0, b.startString + difference)
                b.endString = b.endString === -1 ? -1 : b.endString + difference
            }
        }

        if (difference > 0) {
            for (let i = 0; i < difference; ++i) {
                this.m_fingering.push(0)
            }
        } else {
            this.m_fingering.splice(this.m_fingering.length + difference)
        }

        this.m_strings = n
    }

    setDot(string: number, fret: number, add = false, dtype = FretDotType.NORMAL): void {
        if (fret === 0) {
            this.removeDot(string, fret)
        } else if (string >= 0 && string < this.m_strings) {
            // Special case - with add, if there is a dot in the position, remove it
            // If not, add it.
            if (add) {
                if (this.dot(string, fret)[0].exists()) {
                    this.removeDot(string, fret)
                    return // We are done here, all we needed to do was remove a single dot
                }
            } else {
                this.m_dots.set(string, [])
            }

            const list = this.m_dots.get(string) ?? []
            list.push(new FretDot(fret, dtype))
            this.m_dots.set(string, list)
            if (!add) {
                this.setMarker(string, FretMarkerType.NONE)
            }
        }
    }

    addDotForDotStyleBarre(string: number, fret: number): void {
        const list = this.m_dots.get(string) ?? []
        if (list.length === 0) {
            list.push(new FretDot(fret, FretDotType.NORMAL, /*isPartOfSlurBarre*/ true))
        }
        this.m_dots.set(string, list)
    }

    removeDotForDotStyleBarre(string: number, fret: number): void {
        this.removeDot(string, fret)
    }

    setMarker(string: number, mtype: FretMarkerType): void {
        if (string >= 0 && string < this.m_strings) {
            this.m_markers.set(string, new FretMarker(mtype))
            if (mtype !== FretMarkerType.NONE) {
                this.removeDot(string)
                this.removeBarres(string)
            }
        }
    }

    /**
     * We'll accept a value of -1 for the end string, to denote that the barre goes as far right as possible.
     * Take a start string value of -1 to mean 'remove this barre'
     */
    setBarre(startString: number, endString: number, fret: number): void {
        if (startString === -1) {
            this.removeBarre(fret)
        } else if (startString >= 0 && endString >= -1 && startString < this.m_strings && endString < this.m_strings) {
            this.m_barres.set(fret, new FretBarre(startString, endString))
        }
    }

    /** C++ setBarre(int string, int fret, bool add) (clicks on a dot with shift) */
    setBarreForString(string: number, fret: number): void {
        const b = this.barre(fret)
        if (!b.exists()) {
            if (string < this.m_strings - 1) {
                this.m_barres.set(fret, new FretBarre(string, -1))
                this.removeDotsMarkers(string, -1, fret)
            }
        } else if (b.endString === -1 && b.startString < string) {
            this.m_barres.get(fret)!.endString = string
        } else {
            this.removeDotsMarkers(b.startString, b.endString, fret)
            this.removeBarre(fret)
        }
    }

    undoSetFretDot(string: number, fret: number, add = true, dtype = FretDotType.NORMAL): void {
        for (const e of this.linkList()) {
            const fd = e as FretDiagram
            fd.score().undo(new FretDotCmd(fd, string, fret, add, dtype))
        }
    }

    undoSetFretMarker(string: number, mtype: FretMarkerType): void {
        for (const e of this.linkList()) {
            const fd = e as FretDiagram
            fd.score().undo(new FretMarkerCmd(fd, string, mtype))
        }
    }

    /** add refers to using multiple dots per string when adding dots automatically */
    undoSetFretBarre(string: number, fret: number, add = false): void {
        for (const e of this.linkList()) {
            const fd = e as FretDiagram
            fd.score().undo(new FretBarreCmd(fd, string, fret, add))
        }
    }

    private removeBarre(f: number): void {
        this.m_barres.delete(f)
    }

    /** Remove barres crossing a certain point. Fret of 0 means any point along the string. */
    private removeBarres(string: number, fret = 0): void {
        for (const [bfret, b] of sortedEntries(this.m_barres)) {
            if (b.exists() && b.startString <= string && (b.endString >= string || b.endString === -1)) {
                if (!(fret > 0 && fret !== bfret)) {
                    this.m_barres.delete(bfret)
                }
            }
        }
    }

    private removeMarker(s: number): void {
        this.m_markers.delete(s)
    }

    /** take a fret value of 0 to mean remove all dots */
    private removeDot(s: number, f = 0): void {
        if (f > 0) {
            const tempDots: FretDot[] = []
            for (const d of this.dot(s)) {
                if (d.exists() && d.fret !== f) {
                    tempDots.push(d.clone())
                }
            }
            this.m_dots.set(s, tempDots)
        } else {
            this.m_dots.set(s, [])
        }

        if (this.m_dots.get(s)!.length === 0) {
            this.m_dots.delete(s)
        }
    }

    /** removes all markers between [ss, es] and dots between [ss, es], where the dots have a fret of fret. */
    private removeDotsMarkers(ss: number, es: number, fret: number): void {
        if (ss === -1) {
            return
        }

        const end = es === -1 ? this.m_strings : es
        for (let string = ss; string <= end; ++string) {
            this.removeDot(string, fret)

            if (this.marker(string).exists()) {
                this.removeMarker(string)
            }
        }
    }

    clear(): void {
        this.m_barres.clear()
        this.m_dots.clear()
        this.m_markers.clear()
        this.m_fretOffset = 0
    }

    isClear(): boolean {
        return this.m_barres.size === 0 && this.m_dots.size === 0 && this.m_markers.size === 0
    }

    fretOffset(): number { return this.m_fretOffset }
    setFretOffset(val: number): void { this.m_fretOffset = val }
    maxFrets(): number { return this.m_maxFrets }
    setMaxFrets(val: number): void { this.m_maxFrets = val }
    showNut(): boolean { return this.m_showNut }
    setShowNut(val: boolean): void { this.m_showNut = val }
    userMag(): number { return this.m_userMag }
    setUserMag(m: number): void { this.m_userMag = m }
    numPos(): number { return this.style().styleI(Sid.fretNumPos) }
    orientation(): Orientation { return this.m_orientation }

    /** take fret value of zero to mean all dots */
    dot(s: number, f = 0): FretDot[] {
        const list = this.m_dots.get(s)
        if (list) {
            if (f !== 0) {
                for (const d of list) {
                    if (d.fret === f) {
                        return [d.clone()]
                    }
                }
            } else {
                return list
            }
        }
        return [new FretDot(0)]
    }

    marker(s: number): FretMarker {
        return this.m_markers.get(s) ?? new FretMarker(FretMarkerType.NONE)
    }

    barre(f: number): FretBarre {
        return this.m_barres.get(f) ?? new FretBarre(-1, -1)
    }

    /** key ordered like the C++ maps */
    barres(): [number, FretBarre][] { return sortedEntries(this.m_barres) }
    dots(): [number, FretDot[]][] { return sortedEntries(this.m_dots) }
    markers(): [number, FretMarker][] { return sortedEntries(this.m_markers) }

    private fontFromStyle(face: Sid, size: Sid, styleSid: Sid): Font {
        const st = this.style()
        const f = new Font(st.styleSt(face), FontType.Text)
        f.setPointSizeF(st.styleD(size) * this.userMag())
        const fStyle = st.styleV(styleSid) as FontStyle
        f.setBold(!!(fStyle & FontStyle.Bold))
        f.setItalic(!!(fStyle & FontStyle.Italic))
        f.setUnderline(!!(fStyle & FontStyle.Underline))
        f.setStrike(!!(fStyle & FontStyle.Strike))
        return f
    }

    fretNumFont(): Font {
        return this.fontFromStyle(Sid.fretDiagramFretNumberFontFace, Sid.fretDiagramFretNumberFontSize, Sid.fretDiagramFretNumberFontStyle)
    }

    fingeringFont(): Font {
        return this.fontFromStyle(Sid.fretDiagramFingeringFontFace, Sid.fretDiagramFingeringFontSize, Sid.fretDiagramFingeringFontStyle)
    }

    harmony(): Harmony | null { return this.m_harmony }

    harmonyPlainText(): string { return this.m_harmony ? this.m_harmony.plainText() : '' }
    harmonyDisplayText(): string { return this.m_harmony ? this.m_harmony.displayText() : '' }

    /**
     * Pattern format: one token per string: X = cross marker, O = circle marker, - = nothing, or the dots in brackets
     * [{fret}-{type},...] with the types O (normal), X (cross), S (square), T (triangle), e.g. [1-X,2-O,3-S].
     * Barre chords follow after ';', in the format: B{fret}[{start}-{end}], e.g. B1[0-5] = barre on fret 1 from
     * string 0 to 5
     */
    static applyDiagramPattern(diagram: FretDiagram, pattern: string): void {
        diagram.clear()

        const parts = pattern.split(';')
        if (!parts.length) {
            return
        }

        const mainPart = parts[0]
        const stringTokens: string[] = []

        for (let i = 0; i < mainPart.length;) {
            if (mainPart[i] === '[') {
                const rb = mainPart.indexOf(']', i)
                if (rb !== -1) {
                    stringTokens.push(mainPart.substring(i, rb + 1))
                    i = rb + 1
                    continue
                }
            }
            stringTokens.push(mainPart.substring(i, i + 1))
            ++i
        }

        const stringCount = stringTokens.length
        diagram.setStrings(stringCount)
        diagram.setFrets(4)
        diagram.setPropertyFlags(Pid.FRET_STRINGS, PropertyFlags.UNSTYLED)
        diagram.setPropertyFlags(Pid.FRET_FRETS, PropertyFlags.UNSTYLED)

        let offset = 0

        for (let i = 0; i < stringCount; ++i) {
            const token = stringTokens[i]

            if (token === '-') {
                continue
            }

            if (token.startsWith('[') && token.endsWith(']')) {
                // Example: [1-O,2-X,3-S]
                const inner = token.substring(1, token.length - 1)
                const pairs = inner.split(',')

                for (const p of pairs) {
                    const dash = p.indexOf('-')
                    if (dash > 0) {
                        const fret = parseInt(p.substring(0, dash), 10) || 0
                        const typeChar = p.substring(dash + 1, dash + 2)
                        let dt: FretDotType

                        switch (typeChar) {
                        case 'X': dt = FretDotType.CROSS
                            break
                        case 'O': dt = FretDotType.NORMAL
                            break
                        case 'S': dt = FretDotType.SQUARE
                            break
                        case 'T': dt = FretDotType.TRIANGLE
                            break
                        default: dt = FretDotType.NORMAL
                            break
                        }

                        diagram.setDot(i, fret - offset, true, dt)
                        if (fret - 3 > 0 && offset < fret - 3) {
                            offset = fret - 3
                        }
                    }
                }
            } else if (token === 'X') {
                diagram.setMarker(i, FretMarkerType.CROSS)
            } else if (token === 'O') {
                diagram.setMarker(i, FretMarkerType.CIRCLE)
            }
        }

        if (offset > 0) {
            diagram.setFretOffset(offset)
        }

        for (let i = 1; i < parts.length; ++i) {
            const barrePart = parts[i]
            if (!barrePart.startsWith('B')) {
                continue
            }

            const lb = barrePart.indexOf('[')
            const rb = barrePart.indexOf(']')
            if (lb < 2 || rb < lb) {
                continue
            }

            const fret = parseInt(barrePart.substring(1, lb), 10) || 0
            if (fret <= 0) {
                continue
            }

            const range = barrePart.substring(lb + 1, rb)
            const dash = range.indexOf('-')
            if (dash > 0) {
                const start = parseInt(range.substring(0, dash), 10) || 0
                const end = parseInt(range.substring(dash + 1), 10) || 0
                if (start >= 0 && end >= start && end < stringCount) {
                    diagram.setBarre(start, end, fret - offset)
                }
            }
        }
    }

    patternFromDiagram(): string {
        const diagramStrings = this.strings()
        const offset = this.fretOffset()

        const patternParts: string[] = []

        for (let i = 0; i < diagramStrings; ++i) {
            const fretMarker = this.marker(i)

            if (fretMarker.mtype === FretMarkerType.CROSS) {
                patternParts.push('X')
                continue
            } else if (fretMarker.mtype === FretMarkerType.CIRCLE) {
                patternParts.push('O')
                continue
            }

            const dots = this.m_dots.get(i)
            const dotList: FretDot[] = []
            if (dots) {
                for (const dot of dots) {
                    if (!dot.isPartOfSlurBarre) { // Don't write dot if part of slur barré
                        dotList.push(dot)
                    }
                }
            }

            if (dotList.length) {
                const dotDescriptions: string[] = []
                for (const dot of dots!) {
                    if (dot.isPartOfSlurBarre) {
                        continue
                    }

                    const actualFret = dot.fret + offset
                    let typeChar = 'O'

                    switch (dot.dtype) {
                    case FretDotType.NORMAL: typeChar = 'O'
                        break
                    case FretDotType.CROSS: typeChar = 'X'
                        break
                    case FretDotType.SQUARE: typeChar = 'S'
                        break
                    case FretDotType.TRIANGLE: typeChar = 'T'
                        break
                    default: break
                    }

                    dotDescriptions.push(`${actualFret}-${typeChar}`)
                }

                patternParts.push('[' + dotDescriptions.join(',') + ']')
            } else {
                patternParts.push('-')
            }
        }

        let pattern = patternParts.join('')

        const barreParts: string[] = []
        for (const [fret, b] of this.barres()) {
            if (!b.exists()) {
                continue
            }

            const adjustedFret = fret + offset
            const start = b.startString
            const end = (b.endString !== -1) ? b.endString : diagramStrings - 1

            barreParts.push(`B${adjustedFret}[${start}-${end}]`)
        }

        if (barreParts.length) {
            pattern += ';' + barreParts.join(';')
        }

        return pattern
    }

    harmoniesFromPattern(pattern: string): string[] {
        if (!s_diagramPatternToHarmoniesMap.size) {
            this.readHarmonyToDiagramFile()
        }
        return [...(s_diagramPatternToHarmoniesMap.get(pattern) ?? [])]
    }

    patternsFromHarmony(harmonyName: string): DiagramInfo[] {
        if (!s_harmonyToDiagramMap.size) {
            this.readHarmonyToDiagramFile()
        }

        const spellingType = this.style().styleV(Sid.chordSymbolSpelling) as NoteSpellingType
        const key = createHarmonyMapKey(harmonyName, spellingType, this.score().chordList())

        return [...(s_harmonyToDiagramMap.get(key) ?? [])]
    }

    undoFretClear(): void {
        for (const e of this.linkList()) {
            const fd = e as FretDiagram
            fd.score().undo(new FretClear(fd))
        }
    }

    /** if this is being done by the user, use undoSetHarmony instead */
    setHarmony(harmonyText: string): void {
        if (!this.m_harmony) {
            const h = Factory.createItem(ElementType.HARMONY, scoreDummy(this.score()).segment()) as Harmony
            this.add(h)
        }

        this.m_harmony!.setHarmony(harmonyText)
        this.m_harmony!.setXmlText(this.m_harmony!.harmonyName())
        this.triggerLayout()
    }

    /** C++ FretUndoData(FretDiagram*) */
    fretUndoData(): FretDiagramData {
        return {
            barres: cloneBarres(this.m_barres), markers: new Map(this.m_markers), dots: cloneDots(this.m_dots),
            strings: this.m_strings, frets: this.m_frets, fretOffset: this.m_fretOffset, maxFrets: this.m_maxFrets,
            showNut: this.m_showNut, orientation: this.m_orientation, userMag: this.m_userMag,
            showFingering: this.m_showFingering,
        }
    }

    /** C++ FretUndoData::updateDiagram(): resets every fret diagram property of the changed diagram */
    restoreFretUndoData(d: FretDiagramData): void {
        this.m_barres = cloneBarres(d.barres)
        this.m_markers = new Map(d.markers)
        this.m_dots = cloneDots(d.dots)

        this.m_strings = d.strings
        this.m_frets = d.frets
        this.m_fretOffset = d.fretOffset
        this.m_maxFrets = d.maxFrets
        this.m_showNut = d.showNut
        this.m_orientation = d.orientation

        this.m_userMag = d.userMag

        this.m_showFingering = d.showFingering
    }

    static makeFromHarmonyOrFretDiagram(harmonyOrFretDiagram: EngravingItem): FretDiagram | null {
        let fretDiagram: FretDiagram | null = null

        if (harmonyOrFretDiagram.isHarmony() && !harmonyOrFretDiagram.parentItem()!.isFretDiagram()) {
            const harmony = (harmonyOrFretDiagram as Harmony).clone() as Harmony

            fretDiagram = Factory.createItem(ElementType.FRET_DIAGRAM, scoreDummy(harmonyOrFretDiagram.score()).segment()) as FretDiagram

            fretDiagram.updateDiagram(harmony.plainText())

            fretDiagram.add(harmony)
        } else if (harmonyOrFretDiagram.isHarmony() && harmonyOrFretDiagram.parentItem()!.isFretDiagram()) {
            fretDiagram = (harmonyOrFretDiagram.parentItem() as FretDiagram).clone() as FretDiagram
        } else if (harmonyOrFretDiagram.isFretDiagram()) {
            const diagram = (harmonyOrFretDiagram as FretDiagram).clone() as FretDiagram
            fretDiagram = diagram
            diagram.setOffset(new PointF())
            if (!diagram.harmony()) {
                //! generate from diagram and add harmony
                diagram.add(Factory.createItem(ElementType.HARMONY, scoreDummy(harmonyOrFretDiagram.score()).segment())!)
            }
        }

        return fretDiagram
    }

    isCustom(harmonyNameForCompare: string): boolean {
        if (!harmonyNameForCompare) {
            return false
        }

        const props = [Pid.FRET_STRINGS, Pid.FRET_FRETS, Pid.FRET_NUT, Pid.FRET_FINGERING]

        for (const pid of props) {
            if (pid === Pid.FRET_FINGERING) {
                if (this.custom(Pid.FRET_SHOW_FINGERINGS)) {
                    return true
                }
            } else if (this.custom(pid)) {
                return true
            }
        }

        if (!s_harmonyToDiagramMap.size) {
            this.readHarmonyToDiagramFile()
        }

        const spellingType = this.style().styleV(Sid.chordSymbolSpelling) as NoteSpellingType
        const key = createHarmonyMapKey(harmonyNameForCompare, spellingType, this.score().chordList())

        const availableDiagrams = s_harmonyToDiagramMap.get(key) ?? []
        if (!availableDiagrams.length) {
            return true
        }

        const currentPattern = this.patternFromDiagram()

        for (const diagram of availableDiagrams) {
            if (diagram.diagramPattern === currentPattern) {
                return false
            }
        }

        return true
    }

    /** the content of harmony_to_diagram.xml (C++ HARMONY_TO_DIAGRAM_FILE_PATH, ":/data/harmony_to_diagram.xml") */
    static registerHarmonyToDiagramFile(data: Uint8Array | string): void {
        s_harmonyToDiagramFile = data
        s_harmonyToDiagramMap.clear()
        s_diagramPatternToHarmoniesMap.clear()
    }

    private readHarmonyToDiagramFile(): void {
        if (!s_harmonyToDiagramFile) {
            return // C++: LOGE() << file.errorString()
        }

        const reader = new XmlReader(s_harmonyToDiagramFile)

        const harmonyToDiagramMap = HarmonyToDiagramReader.read(reader)

        const chordList = this.score().chordList()
        const spellingType = NoteSpellingType.STANDARD

        for (const [key, value] of harmonyToDiagramMap) {
            const mapKey = createHarmonyMapKey(key, spellingType, chordList)

            let diagrams = s_harmonyToDiagramMap.get(mapKey)
            if (!diagrams) {
                diagrams = []
                s_harmonyToDiagramMap.set(mapKey, diagrams)
            }
            diagrams.push({ harmonyName: key, diagramXml: value.xml, diagramPattern: value.pattern })
            let names = s_diagramPatternToHarmoniesMap.get(value.pattern)
            if (!names) {
                names = []
                s_diagramPatternToHarmoniesMap.set(value.pattern, names)
            }
            names.push(key)
        }
    }

    override add(e: EngravingItem): void {
        e.setParent(this)
        if (e.isHarmony()) {
            this.m_harmony = e as Harmony

            this.m_harmony.setTrack(this.track())

            if (!this.m_harmony.harmonyName()) {
                if (!s_diagramPatternToHarmoniesMap.size) {
                    this.readHarmonyToDiagramFile()
                }

                const pattern = this.patternFromDiagram()
                if (pattern) {
                    const matchedHarmonies = s_diagramPatternToHarmoniesMap.get(pattern) ?? []
                    if (matchedHarmonies.length) {
                        this.m_harmony.setHarmony(matchedHarmonies[0])
                    }
                }
            }

            this.m_harmony.resetProperty(Pid.OFFSET)
            this.m_harmony.setProperty(Pid.ALIGN, new Align(AlignH.HCENTER, AlignV.BASELINE))
            this.m_harmony.setPropertyFlags(Pid.ALIGN, PropertyFlags.UNSTYLED)

            e.added()
        } else {
            super.add(e)
        }
    }

    override remove(e: EngravingItem): void {
        if (e === this.m_harmony) {
            this.m_harmony = null
            e.removed()
        } else {
            super.remove(e)
        }
    }

    override scanElements(func: (item: EngravingItem) => void): void {
        func(this)

        // don't display harmony in palette
        if (this.m_harmony && !isPaletteScore(this.score())) {
            func(this.m_harmony)
        }
    }

    override getProperty(propertyId: Pid): PropertyValue {
        switch (propertyId) {
        case Pid.MAG:
            return this.userMag()
        case Pid.FRET_STRINGS:
            return this.strings()
        case Pid.FRET_FRETS:
            return this.frets()
        case Pid.FRET_NUT:
            return this.showNut()
        case Pid.FRET_OFFSET:
            return this.fretOffset()
        case Pid.ORIENTATION:
            return this.m_orientation
        case Pid.FRET_SHOW_FINGERINGS:
            return this.m_showFingering
        case Pid.FRET_FINGERING:
            return this.m_fingering
        default:
            return super.getProperty(propertyId)
        }
    }

    override setProperty(propertyId: Pid, v: PropertyValue): boolean {
        switch (propertyId) {
        case Pid.MAG:
            this.setUserMag(v as number)
            break
        case Pid.FRET_STRINGS:
            this.setStrings(v as number)
            break
        case Pid.FRET_FRETS:
            this.setFrets(v as number)
            break
        case Pid.FRET_NUT:
            this.setShowNut(!!v)
            break
        case Pid.FRET_OFFSET:
            this.setFretOffset(v as number)
            break
        case Pid.ORIENTATION:
            this.m_orientation = v as Orientation
            break
        case Pid.FRET_SHOW_FINGERINGS:
            this.setShowFingering(!!v)
            break
        case Pid.FRET_FINGERING:
            this.setFingering([...(v as number[])])
            break
        case Pid.EXCLUDE_VERTICAL_ALIGN: {
            const val = !!v
            this.setExcludeVerticalAlign(val)
            const h = this.harmony()
            if (h && h.excludeVerticalAlign() !== val) {
                h.setExcludeVerticalAlign(val)
            }
            break
        }
        default:
            return super.setProperty(propertyId, v)
        }
        return true
    }

    override propertyDefault(pid: Pid): PropertyValue {
        // We shouldn't style the fret offset
        if (pid === Pid.FRET_OFFSET) {
            return 0
        } else if (pid === Pid.FRET_FINGERING) {
            return new Array<number>(this.m_strings).fill(0)
        }

        for (const p of this.styledProperties() ?? []) {
            if (p.pid === pid) {
                if (propertyType(pid) === P_TYPE.MILLIMETRE) {
                    return this.style().styleMM(p.sid)
                }
                return this.style().styleV(p.sid)
            }
        }
        return super.propertyDefault(pid)
    }

    override setVisible(f: boolean): void {
        super.setVisible(f)

        if (this.m_harmony && this.m_harmony.isStyled(Pid.OFFSET)) {
            this.m_harmony.resetProperty(Pid.OFFSET)
        }
    }

    override setTrack(val: track_idx_t): void {
        super.setTrack(val)

        if (this.m_harmony) {
            this.m_harmony.setTrack(val)
        }
    }

    showFingering(): boolean { return this.m_showFingering }
    setShowFingering(v: boolean): void { this.m_showFingering = v }
    fingering(): readonly number[] { return this.m_fingering }
    setFingering(v: number[]): void { this.m_fingering = v }

    isInFretBox(): boolean {
        const parent = this.explicitParent()
        return parent ? parent.isFBox() : false
    }

    override allowTimeAnchor(): boolean { return !!this.explicitParent() && this.parent()!.isSegment() }

    override dragAnchorLines(): LineF[] {
        return this.genericDragAnchorLines()
    }

    override drag(ed: EditData): RectF {
        const result = super.drag(ed)

        MoveElementAnchors.moveElementAnchorsOnDrag(this, ed)

        return result
    }
}
