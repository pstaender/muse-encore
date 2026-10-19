/*
 * SPDX-License-Identifier: GPL-3.0-only
 * MuseScore-Web — port of MuseScore Studio (https://github.com/musescore/MuseScore)
 * Copyright (C) 2021-2026 MuseScore Limited and others
 *
 * Port of src/engraving/dom/fret.h/.cpp
 * TODO(port): editing, harmony <-> diagram pattern matching (harmony_to_diagram.xml), fret boxes
 */

import { Font, FontType } from '../../framework/draw/types/font'
import type { PainterPath } from '../../framework/draw/types/painterpath'
import type { PointF } from '../../framework/draw/types/geometry'
import { Align, AlignH, AlignV, ElementType, FontStyle, Orientation, type track_idx_t } from '../types/types'
import { P_TYPE, type PropertyValue } from '../types/propertyvalue'
import { Sid } from '../style/styledef'
import { ElementFlag, EngravingItem, LayoutData } from './engravingitem'
import type { ElementStyle, EngravingObject } from './engravingobject'
import type { Harmony } from './harmony'
import { Pid, PropertyFlags, propertyType } from './property'
import type { Segment } from './segment'

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

    override add(e: EngravingItem): void {
        e.setParent(this)
        if (e.isHarmony()) {
            this.m_harmony = e as Harmony

            this.m_harmony.setTrack(this.track())

            // TODO(port): harmony from the diagram pattern (harmony_to_diagram.xml) if the harmony has no name

            this.m_harmony.resetProperty(Pid.OFFSET)
            this.m_harmony.setProperty(Pid.ALIGN, new Align(AlignH.HCENTER, AlignV.BASELINE))
            this.m_harmony.setPropertyFlags(Pid.ALIGN, PropertyFlags.UNSTYLED)
        } else {
            super.add(e)
        }
    }

    override remove(e: EngravingItem): void {
        if (e === this.m_harmony) {
            this.m_harmony = null
        } else {
            super.remove(e)
        }
    }

    override scanElements(func: (item: EngravingItem) => void): void {
        func(this)

        // don't display harmony in palette
        if (this.m_harmony) {
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
}
