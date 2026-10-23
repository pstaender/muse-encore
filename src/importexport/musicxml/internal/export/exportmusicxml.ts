/*
 * SPDX-License-Identifier: GPL-3.0-only
 * MuseEncore — port of MuseScore Studio (https://github.com/musescore/MuseScore)
 * Copyright (C) 2021-2026 MuseScore Limited and others
 *
 * Port of src/importexport/musicxml/internal/export/exportmusicxml.h/.cpp
 *
 * MusicXML export. The C++ std::list/std::vector are arrays, the maps keyed by pointers are Maps. The export
 * settings (C++ IMusicXmlConfiguration) are passed to saveXml/saveMxl and are ExportMusicXml.configuration()
 * during the export. Numbers are formatted like C++: String::number(v, prec) and String::arg(double) (fixed
 * notation without trailing zeros), the XmlWriter writes doubles like printf("%g"); floats of the C++ code are
 * emulated with Math.fround.
 *
 * TODO(port): TremoloBar (<bend> with <with-bar>) is not ported, tremolo bars are not exported
 */

import { strToU8, zipSync, type Zippable } from 'fflate'
import { RealIsEqual, RealIsNull } from '../../../../framework/global/realfn'
import { PointF } from '../../../../framework/draw/types/geometry'
import type { Color } from '../../../../framework/draw/types/color'
import { scoreDummy } from '../../../../engraving/compat/dummyelement'
import type { Accidental } from '../../../../engraving/dom/accidental'
import { AccidentalBracket } from '../../../../engraving/dom/accidental'
import { AccidentalType } from '../../../../engraving/dom/accidentaldata'
import type { Arpeggio } from '../../../../engraving/dom/arpeggio'
import { ArticulationAnchor, type Articulation } from '../../../../engraving/dom/articulation'
import {
    BARLINE_SPAN_SHORT1_FROM, BARLINE_SPAN_SHORT1_TO, BARLINE_SPAN_SHORT2_FROM, BARLINE_SPAN_TICK1_FROM,
    BARLINE_SPAN_TICK1_TO, BARLINE_SPAN_TICK2_FROM, BARLINE_SPAN_TICK2_TO, type BarLine,
} from '../../../../engraving/dom/barline'
import type { Beam } from '../../../../engraving/dom/beam'
import type { TBox } from '../../../../engraving/dom/box'
import { BracketItem } from '../../../../engraving/dom/bracketitem'
import type { Breath } from '../../../../engraving/dom/breath'
import type { Chord } from '../../../../engraving/dom/chord'
import type { ChordLine } from '../../../../engraving/dom/chordline'
import type { ChordRest } from '../../../../engraving/dom/chordrest'
import type { Clef } from '../../../../engraving/dom/clef'
import { ClefInfo } from '../../../../engraving/dom/clefinfo'
import type { DurationElement } from '../../../../engraving/dom/durationelement'
import { TDuration } from '../../../../engraving/dom/durationtype'
import { Dynamic } from '../../../../engraving/dom/dynamic'
import type { EngravingItem } from '../../../../engraving/dom/engravingitem'
import type { Fermata } from '../../../../engraving/dom/fermata'
import {
    FBIDigitNone, FiguredBassContLine, FiguredBassModifier, type FiguredBass, type FiguredBassItem,
} from '../../../../engraving/dom/figuredbass'
import { FretDotType, FretMarkerType, type FretDiagram } from '../../../../engraving/dom/fret'
import type { Glissando } from '../../../../engraving/dom/glissando'
import type { HammerOnPullOffSegment } from '../../../../engraving/dom/hammeronpulloff'
import { HairpinType, type Hairpin } from '../../../../engraving/dom/hairpin'
import { HarmonyType, type Harmony, type HarmonyInfo } from '../../../../engraving/dom/harmony'
import type { HarpPedalDiagram } from '../../../../engraving/dom/harppedaldiagram'
import type { Image } from '../../../../engraving/dom/image'
import { imageStore, type ImageStoreItem } from '../../../../engraving/dom/imagestore'
import type { InstrumentChange } from '../../../../engraving/dom/instrchange'
import type { Instrument } from '../../../../engraving/dom/instrument'
import type { Jump } from '../../../../engraving/dom/jump'
import { KeySig } from '../../../../engraving/dom/keysig'
import type { LineSegment, SLine } from '../../../../engraving/dom/line'
import type { Lyrics } from '../../../../engraving/dom/lyrics'
import type { Marker } from '../../../../engraving/dom/marker'
import type { Measure } from '../../../../engraving/dom/measure'
import type { MeasureBase } from '../../../../engraving/dom/measurebase'
import type { MeasureRepeat } from '../../../../engraving/dom/measurerepeat'
import { MScore } from '../../../../engraving/dom/mscore'
import { INVALID_LINE, type Note } from '../../../../engraving/dom/note'
import type { Ornament } from '../../../../engraving/dom/ornament'
import { OttavaType, type Ottava } from '../../../../engraving/dom/ottava'
import type { Page } from '../../../../engraving/dom/page'
import type { Part } from '../../../../engraving/dom/part'
import type { Pedal } from '../../../../engraving/dom/pedal'
import { tpc2alter, tpc2alterByKey, tpc2degree, tpc2stepName, tpcIsValid } from '../../../../engraving/dom/pitchspelling'
import type { PlayTechAnnotation } from '../../../../engraving/dom/playtechannotation'
import type { RehearsalMark } from '../../../../engraving/dom/rehearsalmark'
import type { Rest } from '../../../../engraving/dom/rest'
import type { Score } from '../../../../engraving/dom/score'
import { SegmentType, type Segment } from '../../../../engraving/dom/segment'
import type { Slur } from '../../../../engraving/dom/slur'
import type { SlurTie, SlurTieSegment } from '../../../../engraving/dom/slurtie'
import type { Spanner } from '../../../../engraving/dom/spanner'
import type { StaffTextBase } from '../../../../engraving/dom/stafftextbase'
import type { Symbol as MSymbol } from '../../../../engraving/dom/symbol'
import type { System } from '../../../../engraving/dom/system'
import type { Tapping } from '../../../../engraving/dom/tapping'
import { TempoText } from '../../../../engraving/dom/tempotext'
import { CharFormat, FormatId, FrameType, TextFragment, type TextBase } from '../../../../engraving/dom/textbase'
import type { Text } from '../../../../engraving/dom/text'
import type { TextLineBase } from '../../../../engraving/dom/textlinebase'
import { TimeSigType, type TimeSig } from '../../../../engraving/dom/timesig'
import type { Trill } from '../../../../engraving/dom/trill'
import { TupletNumberType, type Tuplet } from '../../../../engraving/dom/tuplet'
import { line2pitch } from '../../../../engraving/dom/utils'
import { VoltaType, type Volta } from '../../../../engraving/dom/volta'
import { Pid } from '../../../../engraving/dom/property'
import { Grip } from '../../../../engraving/editing/editdata'
import { EngravingConfiguration } from '../../../../engraving/internal/engravingconfiguration'
import { XmlWriter, type XmlAttributes } from '../../../../engraving/rw/xmlwriter'
import { PROGRAM_VERSION } from '../../../../engraving/rw/write/writer'
import { Sid } from '../../../../engraving/style/styledef'
import type { MStyle } from '../../../../engraving/style/style'
import { Constants } from '../../../../engraving/types/constants'
import { Fraction } from '../../../../engraving/types/fraction'
import { SymId } from '../../../../engraving/types/symid'
import { SymNames } from '../../../../engraving/types/symnames'
import { TConv } from '../../../../engraving/types/typesconv'
import {
    AccidentalRole, AlignH, AlignV, ArpeggioType, BarLineType, BeamMode, BracketType, ChordLineType, ClefType,
    DirectionV, DPMM, DurationType, DynamicType, ElementType, FontStyle, GlissandoType, GuitarBendType, HookType, INCH,
    JumpType, Key, KeyMode, LineType, LyricsSyllabic, MarkerType, NoteHeadGroup, NoteHeadScheme, NoteHeadType, nidx,
    ParenthesesMode, PlacementV, PlayingTechniqueType, SlurStyleType, StaffGroup, TappingHand, TextStyleType,
    TimeSigPlacement, TremoloChordType, TremoloType, TrillType, VOICES, staff2track, track2staff,
    type staff_idx_t, type track_idx_t,
} from '../../../../engraving/types/types'
import { MusicXmlConfiguration, MusicXmlExportBreaksType } from '../musicxmlconfiguration'
import { MScoreTextToMusicXml } from '../shared/musicxmlfonthandler'
import {
    accSymId2MusicXmlString, accSymId2SmuflMusicXmlString, accidentalType2MusicXmlString,
    accidentalType2SmuflMusicXmlString, harmonyXmlDegrees, harmonyXmlFunction, harmonyXmlKind, harmonyXmlParens,
    harmonyXmlSymbols, harmonyXmlText, isLaissezVibrer,
} from '../shared/musicxmlsupport'
import { ArpeggioMap, MAX_NUMBER_LEVEL, MusicXmlArpeggioDesc } from '../shared/musicxmltypes'

//---------------------------------------------------------
//   number formatting
//---------------------------------------------------------

/**
 * muse::String::number(double, prec): fixed notation (std::fixed, rounding of the exact binary value with ties
 * to even like printf), trailing zeros and a trailing '.' removed, no "-0"
 */
function numStr(v: number, prec = 6): string {
    let s = v.toFixed(prec)
    // toFixed rounds exact ties away from zero, printf rounds them to even
    const exact = Math.abs(v).toFixed(Math.min(100, prec + 30))
    const dot = exact.indexOf('.')
    const tail = exact.slice(dot + 1 + prec)
    if (/^50*$/.test(tail)) {
        const truncated = exact.slice(0, prec ? dot + 1 + prec : dot)
        const lastDigit = Number(truncated[truncated.length - 1])
        if (lastDigit % 2 === 0) {
            s = (v < 0 ? '-' : '') + truncated
        }
    }
    if (s.includes('.')) {
        s = s.replace(/0+$/, '').replace(/\.$/, '')
    }
    if (s === '-0') {
        s = '0'
    }
    return s
}

/** C++ String::arg(double): String::number(val) (precision 6) */
function argD(v: number): string {
    return numStr(v, 6)
}

/** C++ int conversion of a double (truncation; no negative zero, which the XmlWriter would write as "-0") */
function cInt(v: number): number {
    return Math.trunc(v) + 0
}

/** C++ std::lcm */
function lcm(a: number, b: number): number {
    const gcd = (x: number, y: number): number => {
        x = Math.abs(x)
        y = Math.abs(y)
        while (y) {
            const t = y
            y = x % y
            x = t
        }
        return x
    }
    if (a === 0 || b === 0) {
        return 0
    }
    return Math.abs(a / gcd(a, b) * b)
}

/** muse::Color::toString(): "#RRGGBB" (uppercase), "#RRGGBBAA" if not opaque */
function colorToString(c: Color): string {
    const h = (n: number): string => Math.max(0, Math.min(255, n)).toString(16).toUpperCase().padStart(2, '0')
    let s = `#${h(c.r)}${h(c.g)}${h(c.b)}`
    if (c.a !== 255) {
        s += h(c.a)
    }
    return s
}

function defaultColor(): Color {
    return EngravingConfiguration.defaultColor()
}

//---------------------------------------------------------
//   local defines for debug output
//---------------------------------------------------------

const MAX_PART_GROUPS = 8

//---------------------------------------------------------
//   typedefs
//---------------------------------------------------------

type FigBassMap = Map<track_idx_t, FiguredBass>
type TrillHash = Map<ChordRest, Trill>
type MusicXmlInstrumentMap = Map<Instrument, number>

//---------------------------------------------------------
//   attributes -- prints <attributes> tag when necessary
//---------------------------------------------------------

class Attributes {
    private m_inAttributes = false

    constructor() { this.start() }

    //---------------------------------------------------------
    //   doAttr - when necessary change state and print <attributes> tag
    //---------------------------------------------------------

    doAttr(xml: XmlWriter, attr: boolean): void {
        if (!this.m_inAttributes && attr) {
            xml.startElement('attributes')
            this.m_inAttributes = true
        } else if (this.m_inAttributes && !attr) {
            xml.endElement()
            this.m_inAttributes = false
        }
    }

    //---------------------------------------------------------
    //   start -- initialize
    //---------------------------------------------------------

    start(): void {
        this.m_inAttributes = false
    }

    //---------------------------------------------------------
    //   stop -- print </attributes> tag when necessary
    //---------------------------------------------------------

    stop(xml: XmlWriter): void {
        if (this.m_inAttributes) {
            xml.endElement()
            this.m_inAttributes = false
        }
    }
}

//---------------------------------------------------------
//   notations -- prints <notations> tag when necessary
//---------------------------------------------------------

class Notations {
    private m_notationsPrinted = false
    private m_prevElementVisible = true
    private m_currentContainer = ''

    //---------------------------------------------------------
    //   tag
    //---------------------------------------------------------

    tag(xml: XmlWriter, e: EngravingItem, container = ''): void {
        if (this.m_notationsPrinted && this.m_prevElementVisible !== e.visible()) {
            this.etag(xml)
        }

        if (!this.m_notationsPrinted) {
            if (e.visible()) {
                xml.startElement('notations')
            } else {
                xml.startElement('notations', [['print-object', 'no']])
            }
            if (container && (this.m_currentContainer === container)) {
                // restart container to ensure it's inside notations
                xml.startElement(container)
            }
        }
        if (this.m_currentContainer !== container) {
            if (this.m_currentContainer) {
                xml.endElement()
            }
            if (container) {
                xml.startElement(container)
            }
        }

        this.m_currentContainer = container
        this.m_notationsPrinted = true
        this.m_prevElementVisible = e.visible()
    }

    //---------------------------------------------------------
    //   etag
    //---------------------------------------------------------

    etag(xml: XmlWriter): void {
        if (this.m_currentContainer) {
            xml.endElement()
            this.m_currentContainer = ''
        }
        if (this.m_notationsPrinted) {
            xml.endElement()
        }
        this.m_notationsPrinted = false
    }

    //---------------------------------------------------------
    //   closeContainer
    //---------------------------------------------------------

    closeContainer(xml: XmlWriter): void {
        if (this.m_currentContainer) {
            xml.endElement()
        }
        this.m_currentContainer = ''
    }
}

//---------------------------------------------------------
//  MeasureNumberStateHandler
//---------------------------------------------------------

/**
 State handler used to calculate measure number including implicit flag.
 To be called once at the start of each measure in a part.
 */

class MeasureNumberStateHandler {
    private m_measureNo = 0 // number of next regular measure
    private m_measureNoOffset = 0 // measure number offset
    private m_irregularMeasureNo = 0 // number of next irregular measure
    private m_pickupMeasureNo = 0 // number of next pickup measure
    private m_cachedAttributes = '' // attributes calculated by updateForMeasure()

    constructor() {
        this.init()
    }

    private init(): void {
        this.m_measureNo = 1
        this.m_measureNoOffset = 0
        this.m_irregularMeasureNo = 1
        this.m_pickupMeasureNo = 1
    }

    updateForMeasure(m: Measure): void {
        // restart measure numbering after a section break if startWithMeasureOne is set
        // check the previous MeasureBase instead of Measure to catch breaks in frames too
        let previousMB: MeasureBase | null = m.prev()
        if (previousMB) {
            previousMB = previousMB.mbWithPrecedingSectionBreak()
        }

        if (previousMB) {
            const layoutSectionBreak = previousMB.sectionBreakElement()
            if (layoutSectionBreak && layoutSectionBreak.startWithMeasureOne()) {
                this.init()
            }
        }

        // update measure numbers and cache result
        this.m_measureNoOffset = m.noOffset()
        this.m_measureNo += this.m_measureNoOffset
        this.m_cachedAttributes = ' number='
        if ((this.m_irregularMeasureNo + this.m_measureNo) === 2 && m.irregular()) {
            this.m_cachedAttributes += '"0" implicit="yes"'
            this.m_pickupMeasureNo++
        } else if (m.irregular()) {
            this.m_cachedAttributes += `"X${this.m_irregularMeasureNo++}" implicit="yes"`
        } else {
            this.m_cachedAttributes += `"${this.m_measureNo++}"`
        }
    }

    measureNumber(): string {
        return this.m_cachedAttributes
    }

    isFirstActualMeasure(): boolean {
        return (this.m_irregularMeasureNo + (this.m_measureNo - this.m_measureNoOffset) + this.m_pickupMeasureNo) === 4
    }
}

//---------------------------------------------------------
//   MeasurePrintContext
//---------------------------------------------------------

class MeasurePrintContext {
    scoreStart = true
    pageStart = true
    systemStart = true
    pageNumber = 0
    writePageNo = false
    prevMeasure: Measure | null = null
    prevSystem: System | null = null
    lastSystemPrevPage: System | null = null

    //---------------------------------------------------------
    //   measureWritten
    //---------------------------------------------------------

    measureWritten(m: Measure): void {
        this.scoreStart = false
        this.pageStart = false
        this.systemStart = false
        this.prevMeasure = m
    }
}

//---------------------------------------------------------
//   positionToString
//---------------------------------------------------------

function positionToString(def: PointF, rel: PointF, spatium: number): string {
    // minimum value to export
    const positionElipson = Math.fround(0.1)

    // convert into tenths for MusicXML (C++ floats)
    const defaultX = Math.fround(10 * def.x() / spatium)
    const defaultY = Math.fround(-10 * def.y() / spatium)
    const relativeX = Math.fround(10 * rel.x() / spatium)
    const relativeY = Math.fround(-10 * rel.y() / spatium)

    // generate string representation
    let res = ''
    if (Math.abs(defaultX) > positionElipson) {
        res += ` default-x="${numStr(defaultX, 2)}"`
    }
    if (Math.abs(defaultY) > positionElipson) {
        res += ` default-y="${numStr(defaultY, 2)}"`
    }
    if (Math.abs(relativeX) > positionElipson) {
        res += ` relative-x="${numStr(relativeX, 2)}"`
    }
    if (Math.abs(relativeY) > positionElipson) {
        res += ` relative-y="${numStr(relativeY, 2)}"`
    }

    return res
}

//---------------------------------------------------------
//   color2xml
//---------------------------------------------------------

function color2xml(el: EngravingItem): string {
    if (!el.color().equals(defaultColor())) {
        return ` color="${colorToString(el.color())}"`
    } else if (el.isSLine() && !(el as unknown as SLine).lineColor().equals(defaultColor())) {
        return ` color="${colorToString((el as unknown as SLine).lineColor())}"`
    } else {
        return ''
    }
}

function addColorAttr(el: EngravingItem, attrs: Array<[string, string | number]>): void {
    if (!el.color().equals(defaultColor())) {
        attrs.push(['color', colorToString(el.color())])
    }
}

//---------------------------------------------------------
//   frame2xml
//---------------------------------------------------------

function frame2xml(el: TextBase): string {
    switch (el.frameType()) {
    case FrameType.CIRCLE:
        return ' enclosure="circle"'
    case FrameType.SQUARE:
        return ' enclosure="rectangle"'
    default:
        return ''
    }
}

//---------------------------------------------------------
//   fontStyleToXML
//---------------------------------------------------------

function fontStyleToXML(style: FontStyle, allowUnderline = true): string {
    let res = ''
    if (style & FontStyle.Bold) {
        res += ' font-weight="bold"'
    }
    if (style & FontStyle.Italic) {
        res += ' font-style="italic"'
    }
    if (allowUnderline && (style & FontStyle.Underline)) {
        res += ' underline="1"'
    }
    // at places where underline is not wanted (e.g. fingering, pluck), strike is not wanted too
    if (allowUnderline && (style & FontStyle.Strike)) {
        res += ' line-through="1"'
    }
    return res
}

//---------------------------------------------------------
//   placement2xml
//---------------------------------------------------------

function placement2xml(el: EngravingItem): string {
    return ` placement="${TConv.toXmlPlacementV(el.placement())}"`
}

//---------------------------------------------------------
//   slurHandler
//---------------------------------------------------------

function slurTieLineStyle(s: SlurTie): string {
    let lineType = ''
    let rest = ''
    switch (s.styleType()) {
    case SlurStyleType.Dashed:
    case SlurStyleType.WideDashed:
        lineType = 'dashed'
        break
    case SlurStyleType.Dotted:
        lineType = 'dotted'
        break
    case SlurStyleType.Solid:
    default:
        lineType = ''
    }
    if (lineType) {
        rest = ` line-type="${lineType}"`
    }
    if (s.slurDirection() !== DirectionV.AUTO) {
        rest += ` orientation="${s.up() ? 'over' : 'under'}"`
        rest += ` placement="${s.up() ? 'above' : 'below'}"`
    }
    rest += color2xml(s)
    return rest
}

function slurTieBezier(st: SlurTie, start: boolean): string {
    if (!ExportMusicXml.configuration().exportLayout()) {
        return ''
    }

    let attributeString = ''
    const spatium = Math.trunc(st.spatium()) // C++ int
    if (st.spannerSegments().length) {
        if (start) {
            const front = st.frontSegment() as unknown as SlurTieSegment
            const startP = front.ups(Grip.START).pos()
            const bezierP = front.ups(Grip.BEZIER1).pos()
            attributeString += ` bezier-x="${argD(10 * (bezierP.x() - startP.x()) / spatium)}"`
            attributeString += ` bezier-y="${argD(-10 * (bezierP.y() - startP.y()) / spatium)}"`
        } else {
            const back = st.backSegment() as unknown as SlurTieSegment
            const endP = back.ups(Grip.END).pos()
            const bezierP = back.ups(Grip.BEZIER2).pos()
            attributeString += ` bezier-x="${argD(10 * (bezierP.x() - endP.x()) / spatium)}"`
            attributeString += ` bezier-y="${argD(-10 * (bezierP.y() - endP.y()) / spatium)}"`
        }
    }

    return attributeString
}

//---------------------------------------------------------
//   findFirstChordRest -- find first chord or rest (in musical order) for slur s
//   note that this is not necessarily the same as s->startElement()
//---------------------------------------------------------

function findFirstChordRest(s: Slur): ChordRest | null {
    const e1 = s.startElement()
    if (!e1 || !(e1.isChordRest())) {
        return null
    }

    const e2 = s.endElement()
    if (!e2 || !(e2.isChordRest())) {
        return null
    }

    if (e1.tick().lt(e2.tick())) {
        return e1 as ChordRest
    } else if (e1.tick().gt(e2.tick())) {
        return e2 as ChordRest
    }

    if (e1.isRest() || e2.isRest()) {
        return null
    }

    const c1 = e1 as Chord
    const c2 = e2 as Chord

    // c1->tick() == c2->tick()
    if (!c1.isGrace() && !c2.isGrace()) {
        // slur between two regular notes at the same tick
        // probably shouldn't happen but handle just in case
        return null
    } else if (c1.isGraceBefore() && !c2.isGraceBefore()) {
        return c1 // easy case: c1 first
    } else if (c1.isGraceAfter() && !c2.isGraceAfter()) {
        return c2 // easy case: c2 first
    } else if (c2.isGraceBefore() && !c1.isGraceBefore()) {
        return c2 // easy case: c2 first
    } else if (c2.isGraceAfter() && !c1.isGraceAfter()) {
        return c1 // easy case: c1 first
    } else {
        // both are grace before or both are grace after -> compare grace indexes
        // (note: higher means closer to the non-grace chord it is attached to)
        if ((c1.isGraceBefore() && c1.graceIndex() < c2.graceIndex())
            || (c1.isGraceAfter() && c1.graceIndex() > c2.graceIndex())) {
            return c1
        } else {
            return c2
        }
    }
}

//---------------------------------------------------------
//   slur handler -- prints <slur> tags
//---------------------------------------------------------

class SlurHandler {
    private m_slur: Array<Slur | null> = new Array<Slur | null>(MAX_NUMBER_LEVEL).fill(null)
    private m_started: boolean[] = new Array<boolean>(MAX_NUMBER_LEVEL).fill(false)

    //---------------------------------------------------------
    //   findSlur -- get index of slur in slur table
    //   return -1 if not found
    //---------------------------------------------------------

    private findSlur(s: Slur | null): number {
        for (let i = 0; i < MAX_NUMBER_LEVEL; ++i) {
            if (this.m_slur[i] === s) {
                return i
            }
        }
        return -1
    }

    //---------------------------------------------------------
    //   doSlurs
    //---------------------------------------------------------

    doSlurs(chordRest: ChordRest, notations: Notations, xml: XmlWriter): void {
        // loop over all slurs twice, first to handle the stops, then the starts
        for (let i = 0; i < 2; ++i) {
            // search for slur(s) starting or stopping at this chord
            for (const sp of chordRest.score()!.spanner()) {
                let tagName = 'slur'
                if (sp.generated() || !sp.isSlur()) {
                    continue
                }
                if (sp.isHammerOnPullOff() && sp.spannerSegments().length) {
                    const hopoSeg = sp.spannerSegments()[0] as unknown as HammerOnPullOffSegment
                    if (hopoSeg.hopoText().length) {
                        tagName = hopoSeg.hopoText()[0].isHammerOn() ? 'hammer-on' : 'pull-off'
                    }
                }
                if (chordRest === sp.startElement() || chordRest === sp.endElement()) {
                    const s = sp as unknown as Slur
                    const firstChordRest = findFirstChordRest(s)
                    if (firstChordRest) {
                        if (i === 0) {
                            // first time: do slur stops
                            if (firstChordRest !== chordRest) {
                                this.doSlurStop(s, notations, tagName, xml)
                            }
                        } else {
                            // second time: do slur starts
                            if (firstChordRest === chordRest) {
                                this.doSlurStart(s, notations, tagName, xml)
                            }
                        }
                    }
                }
            }
        }
    }

    //---------------------------------------------------------
    //   doSlurStart
    //---------------------------------------------------------

    private doSlurStart(s: Slur, notations: Notations, tagName: string, xml: XmlWriter): void {
        // only slurs can hold line styles
        const style = (tagName === 'slur')
        // check if on slur list (i.e. stop already seen)
        let i = this.findSlur(s)
        // compose tag
        tagName += ' type="start"'
        tagName += style ? slurTieLineStyle(s) : color2xml(s)
        tagName += slurTieBezier(s, true)

        if (i >= 0) {
            // remove from list and print start
            this.m_slur[i] = null
            this.m_started[i] = false
            notations.tag(xml, s)
            tagName += ` number="${i + 1}"`
            xml.tagRaw(tagName)
        } else {
            // find free slot to store it
            i = this.findSlur(null)
            if (i >= 0) {
                this.m_slur[i] = s
                this.m_started[i] = true
                notations.tag(xml, s)
                tagName += ` number="${i + 1}"`
                xml.tagRaw(tagName)
            }
        }
    }

    //---------------------------------------------------------
    //   doSlurStop
    //---------------------------------------------------------

    // Note: a slur may start in a higher voice in the same measure.
    // In that case it is not yet started (i.e. on the active slur list)
    // when doSlurStop() is executed. Handle this slur as follows:
    // - generate stop anyway and put it on the slur list
    // - doSlurStart() starts slur but doesn't store it

    private doSlurStop(s: Slur, notations: Notations, tagName: string, xml: XmlWriter): void {
        // check if on slur list
        let i = this.findSlur(s)
        if (i < 0) {
            // if not, find free slot to store it
            i = this.findSlur(null)
            if (i >= 0) {
                this.m_slur[i] = s
                this.m_started[i] = false
                notations.tag(xml, s)
                tagName += ` type="stop" number="${i + 1}"`
                tagName += slurTieBezier(s, false)
                xml.tagRaw(tagName)
            }
        } else {
            // found (already started), stop it and remove from list
            this.m_slur[i] = null
            this.m_started[i] = false
            notations.tag(xml, s)
            tagName += ` type="stop" number="${i + 1}"`
            tagName += slurTieBezier(s, false)
            xml.tagRaw(tagName)
        }
    }
}

//---------------------------------------------------------
//   glissando
//---------------------------------------------------------

// <notations>
//   <slide line-type="solid" number="1" type="start"/>
//   </notations>

// <notations>
//   <glissando line-type="wavy" number="1" type="start"/>
//   </notations>

function glissando(gli: Glissando, number: number, start: boolean, notations: Notations, xml: XmlWriter): void {
    let tagName = ''
    if (gli.glissandoType() === GlissandoType.STRAIGHT) {
        switch (gli.lineStyle()) {
        case LineType.SOLID:
            tagName = 'slide line-type="solid"'
            break
        case LineType.DASHED:
            tagName = 'slide line-type="dashed"'
            break
        case LineType.DOTTED:
            tagName = 'slide line-type="dotted"'
            break
        }
    } else {
        tagName = 'glissando line-type="wavy"'
    }
    tagName += ` number="${number}" type="${start ? 'start' : 'stop'}"`
    if (start) {
        tagName += color2xml(gli)
        tagName += ExportMusicXml.positioningAttributes(gli, start)
    }
    notations.tag(xml, gli)
    if (start && gli.showText() && gli.text()) {
        xml.tagRaw(tagName, gli.text())
    } else {
        xml.tagRaw(tagName)
    }
}

//---------------------------------------------------------
//   glissando handler -- prints <glissando> tags
//---------------------------------------------------------

class GlissandoHandler {
    private m_glissNote: Array<Note | null> = []
    private m_slideNote: Array<Note | null> = []

    constructor() {
        this.reset()
    }

    reset(): void {
        this.m_glissNote = new Array<Note | null>(MAX_NUMBER_LEVEL).fill(null)
        this.m_slideNote = new Array<Note | null>(MAX_NUMBER_LEVEL).fill(null)
    }

    //---------------------------------------------------------
    //   findNote -- get index of Note in note table for subtype type
    //   return -1 if not found
    //---------------------------------------------------------

    private findNote(note: Note | null, type: number): number {
        if (type !== 0 && type !== 1) {
            return -1
        }
        for (let i = 0; i < MAX_NUMBER_LEVEL; ++i) {
            if (type === 0 && this.m_slideNote[i] === note) {
                return i
            }
            if (type === 1 && this.m_glissNote[i] === note) {
                return i
            }
        }
        return -1
    }

    //---------------------------------------------------------
    //   doGlissandoStart
    //---------------------------------------------------------

    doGlissandoStart(gliss: Glissando, notations: Notations, xml: XmlWriter): void {
        const type = gliss.glissandoType()
        if (type !== GlissandoType.STRAIGHT && type !== GlissandoType.WAVY) {
            return
        }
        const note = gliss.startElement() as Note
        // check if on chord list
        let i = this.findNote(note, type)
        if (i >= 0) {
            // print error and remove from list
            if (type === GlissandoType.STRAIGHT) {
                this.m_slideNote[i] = null
            }
            if (type === GlissandoType.WAVY) {
                this.m_glissNote[i] = null
            }
        }
        // find free slot to store it
        i = this.findNote(null, type)
        if (i >= 0) {
            if (type === GlissandoType.STRAIGHT) {
                this.m_slideNote[i] = note
            }
            if (type === GlissandoType.WAVY) {
                this.m_glissNote[i] = note
            }
            glissando(gliss, i + 1, true, notations, xml)
        }
    }

    //---------------------------------------------------------
    //   doGlissandoStop
    //---------------------------------------------------------

    doGlissandoStop(gliss: Glissando, notations: Notations, xml: XmlWriter): void {
        const type = gliss.glissandoType()
        if (type !== GlissandoType.STRAIGHT && type !== GlissandoType.WAVY) {
            return
        }
        const note = gliss.startElement() as Note
        for (let i = 0; i < MAX_NUMBER_LEVEL; ++i) {
            if (type === GlissandoType.STRAIGHT && this.m_slideNote[i] === note) {
                this.m_slideNote[i] = null
                glissando(gliss, i + 1, false, notations, xml)
                return
            }
            if (type === GlissandoType.WAVY && this.m_glissNote[i] === note) {
                this.m_glissNote[i] = null
                glissando(gliss, i + 1, false, notations, xml)
                return
            }
        }
    }
}

// C++ DirectionsAnchor is not used by the export and not ported

//---------------------------------------------------------
// trill handling
//---------------------------------------------------------

// find all trills in this measure and this part

function findTrills(measure: Measure, strack: track_idx_t, etrack: track_idx_t, trillStart: TrillHash, trillStop: TrillHash): void {
    // loop over all spanners in this measure
    const stick = measure.tick()
    const etick = measure.endTick()
    for (const e of measure.score()!.spanner()) {
        const t = e.tick().ticks()
        if (t < stick.ticks() || t > etick.ticks()) {
            continue
        }
        if (e.isTrill() && strack <= e.track() && e.track() < etrack
            && e.tick().ge(measure.tick()) && e.tick().lt(measure.endTick())) {
            // a trill is found starting in this segment, trill end time is known
            // determine notes to write trill start and stop

            const tr = e as unknown as Trill
            const elem1 = tr.startElement()
            const elem2 = tr.endElement()

            if (elem1 && elem1.isChordRest() && elem2 && elem2.isChordRest()) {
                if (!trillStart.has(elem1 as ChordRest)) {
                    trillStart.set(elem1 as ChordRest, tr)
                }
                if (!trillStop.has(elem2 as ChordRest)) {
                    trillStop.set(elem2 as ChordRest, tr)
                }
            }
        }
    }
}

//---------------------------------------------------------
// helpers for ::calcDivisions
//---------------------------------------------------------

/** C++ static std::set<Fraction> fractions (the reduced fractions, keyed by their string) */
const fractions = new Map<string, Fraction>()

function addFraction(len: Fraction): void {
    const r = len.reduced()
    fractions.set(r.toString(), r)
}

//---------------------------------------------------------
// isTwoNoteTremolo - determine is chord is part of two note tremolo
//---------------------------------------------------------

function isTwoNoteTremolo(chord: Chord): boolean {
    return !!chord.tremoloTwoChord()
}

//---------------------------------------------------------
//  stretch
//---------------------------------------------------------

function stretch(score: Score, st: track_idx_t, tick: Fraction): Fraction {
    const staff = score.staff(track2staff(st))!
    return staff.timeStretch(tick)
}

//---------------------------------------------------------
//   writePageFormat
//---------------------------------------------------------

function writePageFormat(s: MStyle, xml: XmlWriter, conversion: number): void {
    xml.startElement('page-layout')

    xml.tag('page-height', s.styleD(Sid.pageHeight) * conversion)
    xml.tag('page-width', s.styleD(Sid.pageWidth) * conversion)

    let type = 'both'
    if (s.styleB(Sid.pageTwosided)) {
        type = 'even'
        xml.startElement('page-margins', [['type', type]])
        xml.tag('left-margin', s.styleD(Sid.pageEvenLeftMargin) * conversion)
        xml.tag('right-margin', s.styleD(Sid.pageOddLeftMargin) * conversion)
        xml.tag('top-margin', s.styleD(Sid.pageEvenTopMargin) * conversion)
        xml.tag('bottom-margin', s.styleD(Sid.pageEvenBottomMargin) * conversion)
        xml.endElement()
        type = 'odd'
    }
    xml.startElement('page-margins', [['type', type]])
    xml.tag('left-margin', s.styleD(Sid.pageOddLeftMargin) * conversion)
    xml.tag('right-margin', s.styleD(Sid.pageEvenLeftMargin) * conversion)
    xml.tag('top-margin', s.styleD(Sid.pageOddTopMargin) * conversion)
    xml.tag('bottom-margin', s.styleD(Sid.pageOddBottomMargin) * conversion)
    xml.endElement()

    xml.endElement()
}

//---------------------------------------------------------
//   defaults
//---------------------------------------------------------

// _spatium = DPMM * (millimeter * 10.0 / tenths);

function defaults(xml: XmlWriter, s: MStyle, millimeters: number, tenths: number): void {
    xml.startElement('defaults')
    {
        xml.startElement('scaling')
        xml.tag('millimeters', millimeters)
        xml.tag('tenths', tenths)
        xml.endElement()
    }

    if (s.styleB(Sid.concertPitch)) {
        xml.tag('concert-score')
    }

    writePageFormat(s, xml, INCH / millimeters * tenths)

    // when exporting only manual or no breaks, system-distance is not written at all
    if (s.styleB(Sid.dividerLeft) || s.styleB(Sid.dividerRight)) {
        xml.startElement('system-layout')
        xml.startElement('system-dividers')
        if (s.styleB(Sid.dividerLeft)) {
            xml.tag('left-divider', [['print-object', 'yes'],
                ['relative-x', s.styleS(Sid.dividerLeftX).val() * 10],
                ['relative-y', s.styleS(Sid.dividerLeftY).val() * 10]])
        } else {
            xml.tag('left-divider', [['print-object', 'no']])
        }
        if (s.styleB(Sid.dividerRight)) {
            xml.tag('right-divider', [['print-object', 'yes'],
                ['relative-x', s.styleS(Sid.dividerRightX).val() * 10],
                ['relative-y', s.styleS(Sid.dividerRightY).val() * 10]])
        } else {
            xml.tag('right-divider', [['print-object', 'no']])
        }
        xml.endElement()
        xml.endElement()
    }

    {
        xml.startElement('appearance')
        // line width values in tenth
        const lw = (type: string, sid: Sid): void => {
            xml.tag('line-width', [['type', type]], s.styleS(sid).val() * 10)
        }
        lw('light barline', Sid.barWidth)
        lw('heavy barline', Sid.endBarWidth)
        lw('beam', Sid.beamWidth)
        lw('bracket', Sid.bracketWidth)
        lw('dashes', Sid.lyricsDashLineThickness)
        lw('enclosure', Sid.staffTextFrameWidth)
        lw('ending', Sid.voltaLineWidth)
        lw('extend', Sid.lyricsLineThickness)
        lw('leger', Sid.ledgerLineWidth)
        lw('pedal', Sid.pedalLineWidth)
        lw('octave shift', Sid.ottavaLineWidth)
        lw('slur middle', Sid.slurMidWidth)
        lw('slur tip', Sid.slurEndWidth)
        lw('staff', Sid.staffLineWidth)
        lw('stem', Sid.stemWidth)
        lw('tie middle', Sid.tieMidWidth)
        lw('tie tip', Sid.tieEndWidth)
        lw('tuplet bracket', Sid.tupletBracketWidth)
        lw('wedge', Sid.hairpinLineWidth)
        // note size values in percent
        xml.tag('note-size', [['type', 'cue']], s.styleD(Sid.smallNoteMag) * 100)
        xml.tag('note-size', [['type', 'grace']], s.styleD(Sid.graceNoteMag) * 100)
        xml.tag('note-size', [['type', 'grace-cue']], s.styleD(Sid.graceNoteMag) * s.styleD(Sid.smallNoteMag) * 100)
        xml.endElement()
    }

    // font defaults
    // as MuseScore supports dozens of different styles, while MusicXML only has defaults
    // for music, words and lyrics, use Tid STAFF (typically used for words)
    // and LYRIC1 to get MusicXML defaults

    xml.tag('music-font', [['font-family', s.styleSt(Sid.musicalSymbolFont)]])
    xml.tag('word-font', [['font-family', s.styleSt(Sid.staffTextFontFace)], ['font-size', s.styleD(Sid.staffTextFontSize)]])
    xml.tag('lyric-font',
        [['font-family', s.styleSt(Sid.lyricsOddFontFace)], ['font-size', s.styleD(Sid.lyricsOddFontSize)]])
    xml.endElement()
}

//---------------------------------------------------------
//   formatForWords
//---------------------------------------------------------

function formatForWords(s: MStyle): CharFormat {
    const defFmt = new CharFormat()
    defFmt.setFontFamily(s.styleSt(Sid.staffTextFontFace))
    defFmt.setFontSize(s.styleD(Sid.staffTextFontSize))
    return defFmt
}

//---------------------------------------------------------
//   creditWords
//---------------------------------------------------------

function creditWords(xml: XmlWriter, s: MStyle, pageNr: number,
    x: number, y: number, just: string, val: string,
    words: readonly TextFragment[], creditType: string): void {
    // prevent incorrect MusicXML for empty text
    if (!words.length) {
        return
    }

    const mtf = s.styleSt(Sid.musicalTextFont)
    const defFmt = formatForWords(s)

    // export formatted
    xml.startElement('credit', [['page', pageNr]])
    if (creditType) {
        xml.tag('credit-type', creditType)
    }
    let attr = ` default-x="${numStr(x, 2)}"`
    attr += ` default-y="${numStr(y, 2)}"`
    attr += ' justify="' + just + '"'
    attr += ' valign="' + val + '"'
    const mttm = new MScoreTextToMusicXml('credit-words', attr, defFmt, mtf)
    mttm.writeTextFragments(words, xml)
    xml.endElement()
}

//---------------------------------------------------------
//   parentHeight
//---------------------------------------------------------

function parentHeight(element: EngravingItem): number {
    const parent = element.parentItem()

    if (!parent) {
        return 0
    }

    if (parent.isVBox()) {
        return parent.height()
    }

    return 0
}

//---------------------------------------------------------
//   tidToCreditType
//---------------------------------------------------------

function tidToCreditType(tid: TextStyleType): string {
    switch (tid) {
    case TextStyleType.COMPOSER:
        return 'composer'
    case TextStyleType.LYRICIST:
        return 'lyricist'
    case TextStyleType.SUBTITLE:
        return 'subtitle'
    case TextStyleType.TITLE:
        return 'title'
    default:
        return ''
    }
}

//---------------------------------------------------------
//   textAsCreditWords
//---------------------------------------------------------

function textAsCreditWords(expMxml: ExportMusicXml, xml: XmlWriter, s: MStyle, pageNr: number, text: Text): void {
    // determine page formatting
    const h = expMxml.getTenthsFromInches(s.styleD(Sid.pageHeight))
    const w = expMxml.getTenthsFromInches(s.styleD(Sid.pageWidth))
    const lm = expMxml.getTenthsFromInches(s.styleD(Sid.pageOddLeftMargin))
    const rm = expMxml.getTenthsFromInches(s.styleD(Sid.pageEvenLeftMargin))
    const ph = expMxml.getTenthsFromDots(parentHeight(text))

    let tx = w / 2
    let ty = h - expMxml.getTenthsFromDots(text.pagePos().y())

    const al = text.align()
    let just = ''
    let val = ''

    if (al.horizontal === AlignH.RIGHT) {
        just = 'right'
        tx = w - rm
    } else if (al.horizontal === AlignH.HCENTER) {
        just = 'center'
        // tx already set correctly
    } else {
        just = 'left'
        tx = lm
    }

    if (al.vertical === AlignV.BOTTOM) {
        val = 'bottom'
        ty -= ph
    } else if (al.vertical === AlignV.VCENTER) {
        val = 'middle'
        ty -= ph / 2
    } else if (al.vertical === AlignV.BASELINE) {
        val = 'baseline'
        ty -= ph / 2
    } else {
        val = 'top'
        // ty already set correctly
    }

    const creditType = tidToCreditType(text.textStyleType())

    creditWords(xml, s, pageNr, tx, ty, just, val, text.fragmentList(), creditType)
}

//---------------------------------------------------------
//   midipitch2xml
//---------------------------------------------------------

const alterTab = [0, 1, 0, 1, 0, 0, 1, 0, 1, 0, 1, 0]
const noteTab = ['C', 'C', 'D', 'D', 'E', 'F', 'F', 'G', 'G', 'A', 'A', 'B']

function midipitch2xml(pitch: number): { c: string; alter: number; octave: number } {
    // 60 = C 4
    return { c: noteTab[pitch % 12], alter: alterTab[pitch % 12], octave: Math.trunc(pitch / 12) - 1 }
}

//---------------------------------------------------------
//   pitch2xml
//---------------------------------------------------------

// TODO validation

function pitch2xml(note: Note): { s: string; alter: number; octave: number } {
    const st = note.staff()!
    const tick = note.tick()
    const instr = st.part()!.instrument(tick)
    const intvalChromatic = note.concertPitch() ? 0 : instr.transpose().chromatic

    const s = tpc2stepName(note.tpc())
    let alter = tpc2alterByKey(note.tpc(), Key.C)
    // note that pitch must be converted to concert pitch
    // in order to calculate the correct octave
    let octave = Math.trunc((note.pitch() - intvalChromatic - alter) / 12) - 1

    //
    // HACK:
    // On percussion clefs there is no relationship between
    // note->pitch() and note->line()
    // note->line() is determined by drumMap
    //
    const ct = st.clef(tick)
    if (ct === ClefType.PERC || ct === ClefType.PERC2) {
        alter = 0
        octave = Math.trunc(line2pitch(note.line(), ct, Key.C) / 12) - 1
    }

    // correct for ottava lines
    let ottava = 0
    switch (note.ppitch() - note.pitch()) {
    case 36: ottava = 3
        break
    case 24: ottava = 2
        break
    case 12: ottava = 1
        break
    case 0: ottava = 0
        break
    case -12: ottava = -1
        break
    case -24: ottava = -2
        break
    case -36: ottava = -3
        break
    default:
        break
    }
    octave += ottava

    return { s, alter, octave }
}

// unpitch2xml -- calculate display-step and display-octave for an unpitched note
// note:
// even though this produces the correct step/octave according to Recordare's tutorial
// Finale Notepad 2012 does not import a three line staff with percussion clef correctly
// Same goes for Sibelius 6 in case of three or five line staff with percussion clef

function unpitch2xml(note: Note): { s: string; octave: number } {
    const table1 = 'FEDCBAG'

    const tick = note.chord().tick()
    const st = note.staff()!
    const ct = st.clef(tick)

    let noteLine = note.line()
    if (noteLine === INVALID_LINE) {
        // Invisible staves are skipped by ModifyDom::cmdUpdateNotes(), so a percussion note on
        // one may never have had its display line computed; resolve it from the drumset instead
        const drumset = st.part()!.instrument(tick).drumset()
        noteLine = (drumset && drumset.isValid(note.pitch())) ? drumset.line(note.pitch()) : 0
    }

    // offset in lines between staff with current clef and with G clef
    const clefOffset = ClefInfo.pitchOffset(ct) - ClefInfo.pitchOffset(ClefType.G)
    // line note would be on on a five line staff with G clef
    // note top line is line 0, bottom line is line 8
    let line5g = noteLine - clefOffset
    // in MusicXML with percussion clef, step and octave are determined as if G clef is used
    // when stafflines is not equal to five, in MusicXML the bottom line is still E4.
    // in MuseScore assumes line 0 is F5
    // MS line numbers (top to bottom) plus correction to get lowest line at E4 (line 8)
    // 1 line staff: 0             -> correction 8
    // 3 line staff: 2, 4, 6       -> correction 2
    // 5 line staff: 0, 2, 4, 6, 8 -> correction 0
    // TODO handle other # staff lines ?
    if (st.lines(new Fraction(0, 1)) === 1) {
        line5g += 8
    }
    if (st.lines(new Fraction(0, 1)) === 3) {
        line5g += 2
    }
    // index in table1 to get step
    const stepIdx = (line5g + 700) % 7
    // get step
    const s = table1[stepIdx]
    // calculate octave, offset "3" correcting for the fact that an octave starts
    // with C instead of F
    const octave = Math.trunc((3 - line5g + 700) / 7) + 5 - 100
    return { s, octave }
}

//---------------------------------------------------------
//   tick2xml
//    set type + dots depending on tick len
//---------------------------------------------------------

function tick2xml(ticks: Fraction): { type: string; dots: number } {
    const t = new TDuration(ticks)
    let dots = t.dots()
    if (ticks.eq(new Fraction(0, 1))) {
        t.setType(DurationType.V_MEASURE)
        dots = 0
    }
    return { type: TConv.toXmlDurationType(t.type()), dots }
}

//---------------------------------------------------------
//   findVolta -- find volta starting in measure m
//---------------------------------------------------------

function findVolta(m: Measure, left: boolean, track: track_idx_t): Volta | null {
    const stick = m.tick()
    const etick = m.endTick()
    const spanners = m.score()!.spannerMap().findOverlapping(stick.ticks(), etick.ticks())
    for (const el of spanners) {
        if (!el.isVolta() || track2staff(el.track()) !== track2staff(track)) {
            continue
        }
        if (left && el.tick().eq(stick)) {
            return el as unknown as Volta
        }
        if (!left && el.tick2().eq(etick)) {
            return el as unknown as Volta
        }
    }
    return null
}

//---------------------------------------------------------
//   ending
//---------------------------------------------------------

function ending(xml: XmlWriter, v: Volta, left: boolean): void {
    let number = ''
    let type = ''
    for (const i of v.endings()) {
        if (number) {
            number += ', '
        }
        number += String(i)
    }
    if (left) {
        type = 'start'
    } else {
        const st = v.voltaType()
        switch (st) {
        case VoltaType.OPEN:
            type = 'discontinue'
            break
        case VoltaType.CLOSED:
            type = 'stop'
            break
        default:
            return
        }
    }
    let voltaXml = `ending number="${number}" type="${type}"`
    voltaXml += ExportMusicXml.positioningAttributes(v, left)
    if (left) {
        if (!v.visible()) {
            voltaXml += ' print-object="no"'
        }
        voltaXml += color2xml(v)
        xml.tagRaw(voltaXml, XmlWriter.xmlString(v.text()))
    } else {
        xml.tagRaw(voltaXml)
    }
}

//---------------------------------------------------------
//   shortBarlineStyle -- recognize normal but shorter barline styles
//---------------------------------------------------------

function shortBarlineStyle(bl: BarLine): string {
    if (bl.barLineType() === BarLineType.NORMAL && !bl.spanStaff()) {
        if (bl.spanTo() < 0) {
            // lowest point of barline above lowest staff line
            if (bl.spanFrom() < 0) {
                return 'tick' // highest point of barline above highest staff line
            } else {
                return 'short' // highest point of barline below highest staff line
            }
        }
    }

    return ''
}

//---------------------------------------------------------
//   normalBarlineStyle -- recognize other barline styles
//---------------------------------------------------------

function normalBarlineStyle(bl: BarLine): string {
    const bst = bl.barLineType()

    switch (bst) {
    case BarLineType.NORMAL:
        return 'regular'
    case BarLineType.DOUBLE:
        return 'light-light'
    case BarLineType.REVERSE_END:
        return 'heavy-light'
    case BarLineType.BROKEN:
        return 'dashed'
    case BarLineType.DOTTED:
        return 'dotted'
    case BarLineType.END:
    case BarLineType.END_REPEAT:
    case BarLineType.END_START_REPEAT:
        return 'light-heavy'
    case BarLineType.HEAVY:
        return 'heavy'
    case BarLineType.DOUBLE_HEAVY:
        return 'heavy-heavy'
    default:
        break
    }

    return ''
}

//---------------------------------------------------------
//   fermata - write a fermata
//---------------------------------------------------------

function fermata(a: Fermata, xml: XmlWriter): void {
    let tagName = 'fermata'
    tagName += ` type="${a.placement() === PlacementV.ABOVE ? 'upright' : 'inverted'}"`
    tagName += ExportMusicXml.fermataPosition(a)
    tagName += color2xml(a)
    const id = a.symId()
    if (id === SymId.fermataAbove || id === SymId.fermataBelow) {
        xml.tagRaw(tagName)
    } else if (id === SymId.fermataShortAbove || id === SymId.fermataShortBelow) {
        xml.tagRaw(tagName, 'angled')
    } else if (id === SymId.fermataLongAbove || id === SymId.fermataLongBelow) {
        xml.tagRaw(tagName, 'square')
    } else if (id === SymId.fermataVeryShortAbove || id === SymId.fermataVeryShortBelow) {
        xml.tagRaw(tagName, 'double-angled')
    } else if (id === SymId.fermataVeryLongAbove || id === SymId.fermataVeryLongBelow) {
        xml.tagRaw(tagName, 'double-square')
    } else if (id === SymId.fermataLongHenzeAbove || id === SymId.fermataLongHenzeBelow) {
        xml.tagRaw(tagName, 'double-dot')
    } else if (id === SymId.fermataShortHenzeAbove || id === SymId.fermataShortHenzeBelow) {
        xml.tagRaw(tagName, 'half-curve')
    } else if (id === SymId.curlewSign) {
        xml.tagRaw(tagName, 'curlew')
    }
}

//---------------------------------------------------------
//   barlineHasFermata -- search for fermata on barline
//---------------------------------------------------------

function barlineHasFermata(barline: BarLine | null, strack: track_idx_t, etrack: track_idx_t): boolean { // TODO: track
    const seg = barline ? barline.segment() : null
    if (seg) {
        for (const anno of seg.annotations()) {
            if (anno.isFermata() && strack <= anno.track() && anno.track() < etrack) {
                return true
            }
        }
    }

    return false
}

//---------------------------------------------------------
//   writeBarlineFermata -- write fermata on barline
//---------------------------------------------------------

function writeBarlineFermata(barline: BarLine | null, xml: XmlWriter, strack: track_idx_t, etrack: track_idx_t): void {
    const seg = barline ? barline.segment() : null
    if (seg) {
        for (const anno of seg.annotations()) {
            if (anno.isFermata() && strack <= anno.track() && anno.track() < etrack) {
                fermata(anno as Fermata, xml)
            }
        }
    }
}

//---------------------------------------------------------
//   calculateTimeDeltaInDivisions
//---------------------------------------------------------

function calculateTimeDeltaInDivisions(t1: Fraction, t2: Fraction, divisions: number): number {
    const resAsFraction = t1.minus(t2).times(4 * divisions)
    return resAsFraction.reduced().numerator()
}

//---------------------------------------------------------
//   calculateDurationInDivisions
//---------------------------------------------------------

function calculateDurationInDivisions(tick: Fraction, divisions: number): number {
    return calculateTimeDeltaInDivisions(tick, new Fraction(0, 1), divisions)
}

//---------------------------------------------------------
//   accSymId2alter
//---------------------------------------------------------

function accSymId2alter(id: SymId): number {
    switch (id) {
    case SymId.accidentalFlat: return -1
    case SymId.accidentalNatural: return 0
    case SymId.accidentalSharp: return 1
    case SymId.accidentalDoubleSharp: return 2
    case SymId.accidentalDoubleFlat: return -2
    case SymId.accidentalTripleSharp: return 3
    case SymId.accidentalTripleFlat: return -3
    case SymId.accidentalNaturalFlat: return -1
    case SymId.accidentalNaturalSharp: return 1
    case SymId.accidentalSharpSharp: return 2

    // Gould arrow quartertone
    case SymId.accidentalQuarterToneFlatArrowUp: return -0.5
    case SymId.accidentalThreeQuarterTonesFlatArrowDown: return -1.5
    case SymId.accidentalQuarterToneSharpNaturalArrowUp: return 0.5
    case SymId.accidentalQuarterToneFlatNaturalArrowDown: return -0.5
    case SymId.accidentalThreeQuarterTonesSharpArrowUp: return 1.5
    case SymId.accidentalQuarterToneSharpArrowDown: return 0.5
    case SymId.accidentalFiveQuarterTonesSharpArrowUp: return 2.5
    case SymId.accidentalThreeQuarterTonesSharpArrowDown: return 1.5
    case SymId.accidentalThreeQuarterTonesFlatArrowUp: return -1.5
    case SymId.accidentalFiveQuarterTonesFlatArrowDown: return -2.5
    case SymId.accidentalArrowDown: return -0.5
    case SymId.accidentalArrowUp: return 0.5

    // Stein-Zimmermann
    case SymId.accidentalQuarterToneFlatStein: return -0.5
    case SymId.accidentalThreeQuarterTonesFlatZimmermann: return -1.5
    case SymId.accidentalQuarterToneSharpStein: return 0.5
    case SymId.accidentalThreeQuarterTonesSharpStein: return 1.5

    // Arel-Ezgi-Uzdilek (AEU)
    case SymId.accidentalBuyukMucennebFlat: return -0.89
    case SymId.accidentalBakiyeFlat: return -0.44
    case SymId.accidentalKucukMucennebSharp: return 0.56
    case SymId.accidentalBuyukMucennebSharp: return 0.89

    // Persian
    case SymId.accidentalSori: return 0.33
    case SymId.accidentalKoron: return -0.67

    // Wyschnegradsky
    case SymId.accidentalWyschnegradsky10TwelfthsFlat: return -1.67
    case SymId.accidentalWyschnegradsky10TwelfthsSharp: return 1.67
    case SymId.accidentalWyschnegradsky11TwelfthsFlat: return -1.83
    case SymId.accidentalWyschnegradsky11TwelfthsSharp: return 1.83
    case SymId.accidentalWyschnegradsky1TwelfthsFlat: return -0.17
    case SymId.accidentalWyschnegradsky1TwelfthsSharp: return 0.17
    case SymId.accidentalWyschnegradsky2TwelfthsFlat: return -0.33
    case SymId.accidentalWyschnegradsky2TwelfthsSharp: return 0.33
    case SymId.accidentalWyschnegradsky3TwelfthsFlat: return -0.50
    case SymId.accidentalWyschnegradsky3TwelfthsSharp: return 0.50
    case SymId.accidentalWyschnegradsky4TwelfthsFlat: return -0.67
    case SymId.accidentalWyschnegradsky4TwelfthsSharp: return 0.67
    case SymId.accidentalWyschnegradsky5TwelfthsFlat: return -0.83
    case SymId.accidentalWyschnegradsky5TwelfthsSharp: return 0.83
    case SymId.accidentalWyschnegradsky6TwelfthsFlat: return -1
    case SymId.accidentalWyschnegradsky6TwelfthsSharp: return 1
    case SymId.accidentalWyschnegradsky7TwelfthsFlat: return -1.16
    case SymId.accidentalWyschnegradsky7TwelfthsSharp: return 1.16
    case SymId.accidentalWyschnegradsky8TwelfthsFlat: return -1.33
    case SymId.accidentalWyschnegradsky8TwelfthsSharp: return 1.33
    case SymId.accidentalWyschnegradsky9TwelfthsFlat: return -1.50
    case SymId.accidentalWyschnegradsky9TwelfthsSharp: return 1.50

    // the most important (Spartan) Sagittal accidentals
    case SymId.accSagittal5v7KleismaDown: return -0.06
    case SymId.accSagittal5v7KleismaUp: return 0.06
    case SymId.accSagittal5CommaDown: return -0.22
    case SymId.accSagittal5CommaUp: return 0.22
    case SymId.accSagittal7CommaDown: return -0.27
    case SymId.accSagittal7CommaUp: return 0.27
    case SymId.accSagittal25SmallDiesisDown: return -0.43
    case SymId.accSagittal25SmallDiesisUp: return 0.43
    case SymId.accSagittal35MediumDiesisDown: return -0.49
    case SymId.accSagittal35MediumDiesisUp: return 0.49
    case SymId.accSagittal11MediumDiesisDown: return -0.53
    case SymId.accSagittal11MediumDiesisUp: return 0.53
    case SymId.accSagittal11LargeDiesisDown: return -0.60
    case SymId.accSagittal11LargeDiesisUp: return 0.60
    case SymId.accSagittal35LargeDiesisDown: return -0.65
    case SymId.accSagittal35LargeDiesisUp: return 0.65
    case SymId.accSagittalFlat25SUp: return -0.71
    case SymId.accSagittalSharp25SDown: return 0.71
    case SymId.accSagittalFlat7CUp: return -0.86
    case SymId.accSagittalSharp7CDown: return 0.86
    case SymId.accSagittalFlat5CUp: return -0.92
    case SymId.accSagittalSharp5CDown: return 0.92
    case SymId.accSagittalFlat5v7kUp: return -1.08
    case SymId.accSagittalSharp5v7kDown: return 1.08
    case SymId.accSagittalFlat: return -1.14
    case SymId.accSagittalSharp: return 1.14

    // Turkish folk music accidentals
    case SymId.accidental1CommaFlat: return -0.22
    case SymId.accidental1CommaSharp: return 0.22
    case SymId.accidental2CommaFlat: return -0.44
    case SymId.accidental2CommaSharp: return 0.44
    case SymId.accidental3CommaFlat: return -0.67
    case SymId.accidental3CommaSharp: return 0.67
    case SymId.accidental4CommaFlat: return -0.89
    case SymId.accidental5CommaSharp: return 1.11
    default: return 0
    }
}

//---------------------------------------------------------
//   clef
//---------------------------------------------------------

interface MusicXmlClefInfo {
    type: ClefType
    sign: string
    octChng: number
}

// table must be in sync with enum ClefType in types.h
const CLEF_INFOS: readonly MusicXmlClefInfo[] = [
    { type: ClefType.G, sign: 'G', octChng: 0 },
    { type: ClefType.G15_MB, sign: 'G', octChng: -2 },
    { type: ClefType.G8_VB, sign: 'G', octChng: -1 },
    { type: ClefType.G8_VA, sign: 'G', octChng: 1 },
    { type: ClefType.G15_MA, sign: 'G', octChng: 2 },
    { type: ClefType.G8_VB_O, sign: 'G', octChng: -1 },
    { type: ClefType.G8_VB_P, sign: 'G', octChng: 0 },
    { type: ClefType.G_1, sign: 'G', octChng: 0 },

    { type: ClefType.C1, sign: 'C', octChng: 0 },
    { type: ClefType.C2, sign: 'C', octChng: 0 },
    { type: ClefType.C3, sign: 'C', octChng: 0 },
    { type: ClefType.C4, sign: 'C', octChng: 0 },
    { type: ClefType.C5, sign: 'C', octChng: 0 },

    { type: ClefType.C_19C, sign: 'G', octChng: 0 },

    { type: ClefType.C1_F18C, sign: 'C', octChng: 0 },
    { type: ClefType.C3_F18C, sign: 'C', octChng: 0 },
    { type: ClefType.C4_F18C, sign: 'C', octChng: 0 },
    { type: ClefType.C1_F20C, sign: 'C', octChng: 0 },
    { type: ClefType.C3_F20C, sign: 'C', octChng: 0 },
    { type: ClefType.C4_F20C, sign: 'C', octChng: 0 },

    { type: ClefType.F, sign: 'F', octChng: 0 },
    { type: ClefType.F15_MB, sign: 'F', octChng: -2 },
    { type: ClefType.F8_VB, sign: 'F', octChng: -1 },
    { type: ClefType.F_8VA, sign: 'F', octChng: 1 },
    { type: ClefType.F_15MA, sign: 'F', octChng: 2 },
    { type: ClefType.F_B, sign: 'F', octChng: 0 },
    { type: ClefType.F_C, sign: 'F', octChng: 0 },
    { type: ClefType.F_F18C, sign: 'F', octChng: 0 },
    { type: ClefType.F_19C, sign: 'F', octChng: 0 },

    { type: ClefType.PERC, sign: 'percussion', octChng: 0 },
    { type: ClefType.PERC2, sign: 'percussion', octChng: 0 },

    { type: ClefType.TAB, sign: 'TAB', octChng: 0 },
    { type: ClefType.TAB4, sign: 'TAB', octChng: 0 },
    { type: ClefType.TAB_SERIF, sign: 'TAB', octChng: 0 },
    { type: ClefType.TAB4_SERIF, sign: 'TAB', octChng: 0 },

    { type: ClefType.C4_8VB, sign: 'C', octChng: -1 },
    { type: ClefType.G8_VB_C, sign: 'G', octChng: -1 },
]

function findClefInfoByType(v: ClefType): MusicXmlClefInfo {
    return CLEF_INFOS.find(i => i.type === v) ?? { type: ClefType.INVALID, sign: '', octChng: 0 }
}

//---------------------------------------------------------
//   tupletNesting
//---------------------------------------------------------

/*
 * determine the tuplet nesting level for cr
 * 0 = not part of tuplet
 * 1 = part of a single tuplet
 * 2 = part of two nested tuplets
 * etc.
 */

function tupletNesting(cr: ChordRest): number {
    let el: DurationElement | null = cr.tuplet()
    let nesting = 0
    while (el) {
        nesting++
        el = el.tuplet()
    }
    return nesting
}

//---------------------------------------------------------
//   isSimpleTuplet
//---------------------------------------------------------

/*
 * determine if t is simple, i.e. all its children are chords or rests
 */

function isSimpleTuplet(t: Tuplet): boolean {
    if (t.tuplet()) {
        return false
    }
    for (const el of t.elements()) {
        if (!el.isChordRest()) {
            return false
        }
    }
    return true
}

//---------------------------------------------------------
//   isTupletStart
//---------------------------------------------------------

/*
 * determine if t is the starting element of a tuplet
 */

function isTupletStart(el: DurationElement): boolean {
    const t = el.tuplet()
    if (!t) {
        return false
    }
    return el === t.elements()[0]
}

//---------------------------------------------------------
//   isTupletStop
//---------------------------------------------------------

/*
 * determine if t is the stopping element of a tuplet
 */

function isTupletStop(el: DurationElement): boolean {
    const t = el.tuplet()
    if (!t) {
        return false
    }
    return el === t.elements()[t.elements().length - 1]
}

//---------------------------------------------------------
//   startTupletAtLevel
//---------------------------------------------------------

/*
 * return the tuplet starting at tuplet nesting level, if any
 */

function startTupletAtLevel(cr: DurationElement, level: number): Tuplet | null {
    let el: DurationElement | null = cr
    if (!el.tuplet()) {
        return null
    }
    for (let i = 0; i < level; ++i) {
        if (!isTupletStart(el!)) {
            return null
        }
        el = el!.tuplet()
    }
    return el as Tuplet | null
}

//---------------------------------------------------------
//   stopTupletAtLevel
//---------------------------------------------------------

/*
 * return the tuplet stopping at tuplet nesting level, if any
 */

function stopTupletAtLevel(cr: DurationElement, level: number): Tuplet | null {
    let el: DurationElement | null = cr
    if (!el.tuplet()) {
        return null
    }
    for (let i = 0; i < level; ++i) {
        if (!isTupletStop(el!)) {
            return null
        }
        el = el!.tuplet()
    }
    return el as Tuplet | null
}

//---------------------------------------------------------
//   tupletTypeAndDots
//---------------------------------------------------------

function tupletTypeAndDots(type: string, dots: number, xml: XmlWriter): void {
    xml.tag('tuplet-type', type)
    for (let i = 0; i < dots; ++i) {
        xml.tag('tuplet-dot')
    }
}

//---------------------------------------------------------
//   tupletActualAndNormal
//---------------------------------------------------------

function tupletActualAndNormal(t: Tuplet, xml: XmlWriter): void {
    xml.startElement('tuplet-actual')
    const tNumAttrs: Array<[string, string | number]> = []
    addColorAttr(t, tNumAttrs)
    xml.tag('tuplet-number', tNumAttrs, t.ratio().numerator())
    const { type: s, dots } = tick2xml(t.baseLen().ticks())
    tupletTypeAndDots(s, dots, xml)
    xml.endElement()
    xml.startElement('tuplet-normal')
    xml.tag('tuplet-number', tNumAttrs, t.ratio().denominator())
    tupletTypeAndDots(s, dots, xml)
    xml.endElement()
}

//---------------------------------------------------------
//   tupletStart
//---------------------------------------------------------

// LVIFIX: add placement to tuplet support
// <notations>
//   <tuplet type="start" placement="above" bracket="no"/>
// </notations>

function tupletStart(t: Tuplet, number: number, needActualAndNormal: boolean, notations: Notations, xml: XmlWriter): void {
    notations.tag(xml, t)
    let tupletTag = 'tuplet type="start"'
    if (!isSimpleTuplet(t)) {
        tupletTag += ` number="${number}"`
    }
    tupletTag += ' bracket='
    tupletTag += t.hasBracket() ? '"yes"' : '"no"'
    if (t.numberType() === TupletNumberType.SHOW_RELATION) {
        tupletTag += ' show-number="both"'
    } else if (t.numberType() === TupletNumberType.NO_TEXT) {
        tupletTag += ' show-number="none"'
    }
    if (t.direction() !== DirectionV.AUTO) {
        if (t.direction() === DirectionV.UP) {
            tupletTag += ' placement="above"'
        } else if (t.direction() === DirectionV.DOWN) {
            tupletTag += ' placement="below"'
        }
    }
    if (needActualAndNormal) {
        xml.startElementRaw(tupletTag)
        tupletActualAndNormal(t, xml)
        xml.endElement()
    } else {
        xml.tagRaw(tupletTag)
    }
}

//---------------------------------------------------------
//   tupletStop
//---------------------------------------------------------

function tupletStop(t: Tuplet, number: number, notations: Notations, xml: XmlWriter): void {
    notations.tag(xml, t)
    const tupletAttrs: Array<[string, string | number]> = [['type', 'stop']]
    if (!isSimpleTuplet(t)) {
        tupletAttrs.push(['number', number])
    }
    xml.tag('tuplet', tupletAttrs)
}

//---------------------------------------------------------
//   tupletStartStop
//---------------------------------------------------------

function tupletStartStop(cr: ChordRest, notations: Notations, xml: XmlWriter): void {
    const nesting = tupletNesting(cr)
    let doActualAndNormal = (nesting > 1)
    if (cr.isChord() && isTwoNoteTremolo(cr as Chord)) {
        doActualAndNormal = true
    }
    for (let level = nesting - 1; level >= 0; --level) {
        const startTuplet = startTupletAtLevel(cr, level + 1)
        if (startTuplet) {
            tupletStart(startTuplet, nesting - level, doActualAndNormal, notations, xml)
        }
        const stopTuplet = stopTupletAtLevel(cr, level + 1)
        if (stopTuplet) {
            tupletStop(stopTuplet, nesting - level, notations, xml)
        }
    }
}

//---------------------------------------------------------
//   writeAccidental
//---------------------------------------------------------

function writeAccidental(xml: XmlWriter, tagName: string, acc: Accidental | null): void {
    if (acc) {
        const s = accidentalType2MusicXmlString(acc.accidentalType())
        if (s) {
            let attrs: Array<[string, string | number]> = []
            if (s === 'other') {
                attrs = [['smufl', accidentalType2SmuflMusicXmlString(acc.accidentalType())]]
            }
            const tag = tagName
            if (acc.bracket() === AccidentalBracket.BRACKET) {
                if (acc.role() === AccidentalRole.USER) {
                    attrs.push(['editorial', 'yes'])
                }
                attrs.push(['bracket', 'yes'])
            } else if (acc.bracket() === AccidentalBracket.PARENTHESIS) {
                if (acc.role() === AccidentalRole.USER) {
                    attrs.push(['cautionary', 'yes'])
                }
                attrs.push(['parentheses', 'yes'])
            } else if (acc.role() === AccidentalRole.USER) { // no way to tell "cautionary" from "editorial"
                attrs.push(['cautionary', 'yes']) // so pick one
                attrs.push(['parentheses', 'no']) // but use neither parenthesis nor bracket ;-)
            }
            if (tagName === 'accidental-mark') {
                if (acc.placeAbove()) {
                    attrs.push(['placement', 'above'])
                } else if (acc.placeBelow()) {
                    attrs.push(['placement', 'below'])
                }
            }
            if (acc.isSmall()) {
                // only set if the accidental is smaller than the notehead
                const tiny = acc.note()!.isSmall() || acc.note()!.chord().isSmall()
                attrs.push(['size', tiny ? 'grace-cue' : 'cue'])
            }
            addColorAttr(acc, attrs)
            xml.tag(tag, attrs, s)
        }
    }
}

//---------------------------------------------------------
//   writeDisplayName
//---------------------------------------------------------

function writeDisplayName(xml: XmlWriter, partName: string): void {
    // TODO: add text style attributes
    let displayText = ''
    for (let i = 0; i < partName.length; ++i) {
        const ch = partName[i]
        if (ch !== '♭' && ch !== '♯') {
            displayText += ch
        } else {
            if (displayText) {
                xml.tag('display-text', displayText)
            }
            if (ch === '♭') {
                xml.tag('accidental-text', 'flat')
            } else if (ch === '♯') {
                xml.tag('accidental-text', 'sharp')
            }
            displayText = ''
        }
    }
    if (displayText) {
        xml.tag('display-text', displayText)
    }
}

//---------------------------------------------------------
//   wavyLineStart
//---------------------------------------------------------

function wavyLineStart(tr: Trill, number: number, notations: Notations, xml: XmlWriter): void {
    notations.tag(xml, tr, 'ornaments')
    switch (tr.trillType()) {
    case TrillType.TRILL_LINE:
        xml.tagRaw('trill-mark' + color2xml(tr))
        break
    case TrillType.UPPRALL_LINE:
        xml.tagRaw('other-ornament smufl="ornamentBottomLeftConcaveStroke"' + color2xml(tr))
        break
    case TrillType.DOWNPRALL_LINE:
        xml.tagRaw('other-ornament smufl="ornamentLeftVerticalStroke"' + color2xml(tr))
        break
    case TrillType.PRALLPRALL_LINE:
    default:
        break
    }
    let tagName = 'wavy-line type="start"'
    tagName += ` number="${number + 1}"`
    tagName += color2xml(tr)
    tagName += ExportMusicXml.positioningAttributes(tr, true)
    xml.tagRaw(tagName)
    writeAccidental(xml, 'accidental-mark', tr.accidental())
}

//---------------------------------------------------------
//   wavyLineStop
//---------------------------------------------------------

function wavyLineStop(tr: Trill, number: number, notations: Notations, xml: XmlWriter): void {
    notations.tag(xml, tr, 'ornaments')
    let trillXml = `wavy-line type="stop" number="${number + 1}"`
    trillXml += ExportMusicXml.positioningAttributes(tr, false)
    xml.tagRaw(trillXml)
}

//---------------------------------------------------------
//   tremoloSingleStartStop
//---------------------------------------------------------

function tremoloSingleStartStop(chord: Chord, notations: Notations, xml: XmlWriter): void {
    const st = chord.tremoloType()
    const tr: EngravingItem | null = chord.tremoloSingleChord() ?? chord.tremoloTwoChord()

    if (st !== TremoloType.INVALID_TREMOLO) {
        let count = 0
        let type = ''

        if (chord.tremoloChordType() === TremoloChordType.TremoloSingle) {
            if (st === TremoloType.BUZZ_ROLL) {
                type = 'unmeasured'
                count = 0
            } else {
                type = 'single'
                switch (st) {
                case TremoloType.R8: count = 1
                    break
                case TremoloType.R16: count = 2
                    break
                case TremoloType.R32: count = 3
                    break
                case TremoloType.R64: count = 4
                    break
                default:
                    break
                }
            }
        } else if (chord.tremoloChordType() === TremoloChordType.TremoloFirstChord) {
            type = 'start'
            switch (st) {
            case TremoloType.C8: count = 1
                break
            case TremoloType.C16: count = 2
                break
            case TremoloType.C32: count = 3
                break
            case TremoloType.C64: count = 4
                break
            default:
                break
            }
        } else if (chord.tremoloChordType() === TremoloChordType.TremoloSecondChord) {
            type = 'stop'
            switch (st) {
            case TremoloType.C8: count = 1
                break
            case TremoloType.C16: count = 2
                break
            case TremoloType.C32: count = 3
                break
            case TremoloType.C64: count = 4
                break
            default:
                break
            }
        }

        if (type && ((count > 0 && type !== 'unmeasured') || (count === 0 && type === 'unmeasured'))) {
            notations.tag(xml, tr!, 'ornaments')
            const attrs: Array<[string, string | number]> = [['type', type]]
            if (type !== 'stop') {
                addColorAttr(tr!, attrs)
            }
            xml.tag('tremolo', attrs, count)
        }
    }
}

//---------------------------------------------------------
//   fermatas
//---------------------------------------------------------

function fermatas(cra: readonly EngravingItem[], xml: XmlWriter, notations: Notations): void {
    for (const e of cra) {
        if (!e.isFermata()) {
            continue
        }
        notations.tag(xml, e)
        fermata(e as Fermata, xml)
    }
}

//---------------------------------------------------------
//   symIdToArtic
//---------------------------------------------------------

function symIdToArtic(sid: SymId): string[] {
    switch (sid) {
    case SymId.articAccentAbove:
    case SymId.articAccentBelow:
        return ['accent']
    case SymId.articStaccatoAbove:
    case SymId.articStaccatoBelow:
        return ['staccato']
    case SymId.articStaccatissimoAbove:
    case SymId.articStaccatissimoBelow:
    case SymId.articStaccatissimoWedgeAbove:
    case SymId.articStaccatissimoWedgeBelow:
        return ['staccatissimo']
    case SymId.articTenutoAbove:
    case SymId.articTenutoBelow:
        return ['tenuto']
    case SymId.articMarcatoAbove:
    case SymId.articMarcatoBelow:
        return ['strong-accent']
    case SymId.articTenutoStaccatoAbove:
    case SymId.articTenutoStaccatoBelow:
        return ['detached-legato']
    case SymId.articSoftAccentAbove:
    case SymId.articSoftAccentBelow:
        return ['soft-accent']
    case SymId.articSoftAccentStaccatoAbove:
    case SymId.articSoftAccentStaccatoBelow:
        return ['soft-accent', 'staccato']
    case SymId.articSoftAccentTenutoAbove:
    case SymId.articSoftAccentTenutoBelow:
        return ['soft-accent', 'tenuto']
    case SymId.articSoftAccentTenutoStaccatoAbove:
    case SymId.articSoftAccentTenutoStaccatoBelow:
        return ['soft-accent', 'detached-legato']
    case SymId.articStressAbove:
    case SymId.articStressBelow:
        return ['stress']
    case SymId.articUnstressAbove:
    case SymId.articUnstressBelow:
        return ['unstress']
    case SymId.articAccentStaccatoAbove:
    case SymId.articAccentStaccatoBelow:
        return ['accent', 'staccato']
    case SymId.articMarcatoStaccatoAbove:
    case SymId.articMarcatoStaccatoBelow:
        return ['strong-accent', 'staccato']
    case SymId.articMarcatoTenutoAbove:
    case SymId.articMarcatoTenutoBelow:
        return ['strong-accent', 'tenuto']
    case SymId.articTenutoAccentAbove:
    case SymId.articTenutoAccentBelow:
        return ['tenuto', 'accent']
    case SymId.articStaccatissimoStrokeAbove:
    case SymId.articStaccatissimoStrokeBelow:
        return ['spiccato']
    default:
        return [] // nothing
    }
}

//---------------------------------------------------------
//   symIdToOrnam
//---------------------------------------------------------

function symIdToOrnam(sid: SymId): string {
    switch (sid) {
    case SymId.ornamentTrill:
        return 'trill-mark'
    case SymId.ornamentTurn:
        return 'turn'
    case SymId.ornamentTurnInverted:
        return 'inverted-turn'
    case SymId.ornamentTurnSlash:
        return 'turn slash="yes"'
    case SymId.ornamentTurnUp:
        return 'vertical-turn'
    case SymId.ornamentTurnUpS:
        return 'inverted-vertical-turn'
    case SymId.ornamentMordent:
        return 'mordent'
    case SymId.ornamentShortTrill:
        return 'inverted-mordent'
    case SymId.ornamentTremblement:
        return 'inverted-mordent long="yes"'
    case SymId.ornamentPrallMordent:
        return 'mordent long="yes"'
    case SymId.ornamentUpPrall:
        return 'inverted-mordent long="yes" approach="below"'
    case SymId.ornamentPrecompMordentUpperPrefix:
        return 'inverted-mordent long="yes" approach="above"'
    case SymId.ornamentUpMordent:
        return 'mordent long="yes" approach="below"'
    case SymId.ornamentDownMordent:
        return 'mordent long="yes" approach="above"'
    case SymId.ornamentPrallDown:
        return 'inverted-mordent long="yes" departure="below"'
    case SymId.ornamentPrallUp:
        return 'inverted-mordent long="yes" departure="above"'
    case SymId.ornamentLinePrall:
        // MusicXML 3.0 did not distinguish between downprall and lineprall
        return 'inverted-mordent long="yes" approach="above"'
    case SymId.ornamentHaydn:
        return 'haydn'
    case SymId.ornamentPrecompSlide:
        return 'schleifer'
    default:
        // use other-ornament
        return `other-ornament smufl="${SymNames.nameForSymId(sid)}"`
    }
}

//---------------------------------------------------------
//   symIdToTechn
//---------------------------------------------------------

function symIdToTechn(sid: SymId): string {
    switch (sid) {
    case SymId.stringsUpBow:
        return 'up-bow'
    case SymId.stringsDownBow:
        return 'down-bow'
    case SymId.stringsHarmonic:
        return 'harmonic'
    case SymId.stringsThumbPosition:
    case SymId.stringsThumbPositionTurned:
        return 'thumb-position'
    case SymId.doubleTongueAbove:
    case SymId.doubleTongueBelow:
        return 'double-tongue'
    case SymId.tripleTongueAbove:
    case SymId.tripleTongueBelow:
        return 'triple-tongue'
    case SymId.brassMuteClosed:
        return 'stopped'
    case SymId.pluckedSnapPizzicatoAbove:
    case SymId.pluckedSnapPizzicatoBelow:
        return 'snap-pizzicato'
    case SymId.guitarLeftHandTapping:
        return 'tap hand="left"'
    case SymId.guitarRightHandTapping:
        return 'tap hand="right"'
    case SymId.keyboardPedalHeel1:
    case SymId.keyboardPedalHeel2:
    case SymId.keyboardPedalHeel3:
        return 'heel'
    case SymId.keyboardPedalToe1:
    case SymId.keyboardPedalToe2:
        return 'toe'
    case SymId.pluckedWithFingernails:
        return 'fingernails'
    case SymId.brassBend:
        return 'brass-bend'
    case SymId.brassFlip:
        return 'brass-flip'
    case SymId.brassSmear:
        return 'smear'
    case SymId.brassMuteOpen:
        return 'open'
    case SymId.brassMuteHalfClosed:
        return 'half-muted'
    case SymId.brassHarmonMuteClosed:
    case SymId.brassHarmonMuteStemHalfLeft:
    case SymId.brassHarmonMuteStemHalfRight:
    case SymId.brassHarmonMuteStemOpen:
        return 'harmon-mute'
    case SymId.windClosedHole:
    case SymId.windHalfClosedHole1:
    case SymId.windHalfClosedHole2:
    case SymId.windHalfClosedHole3:
    case SymId.windOpenHole:
        return 'hole'
    case SymId.guitarGolpe:
        return 'golpe'
    case SymId.handbellsBelltree:
        return 'belltree'
    case SymId.handbellsDamp3:
        return 'damp'
    case SymId.handbellsEcho1:
        return 'echo'
    case SymId.handbellsGyro:
        return 'gyro'
    case SymId.handbellsHandMartellato:
        return 'hand martellato'
    case SymId.handbellsMalletLft:
        return 'mallet lift'
    case SymId.handbellsMalletBellSuspended:
        return `stopped smufl="${SymNames.nameForSymId(sid)}"`
    case SymId.handbellsMalletBellOnTable:
        return 'mallet table'
    case SymId.handbellsMartellato:
        return 'martellato'
    case SymId.handbellsMartellatoLift:
        return 'martellato lift'
    case SymId.handbellsMutedMartellato:
        return 'muted martellato'
    case SymId.handbellsPluckLift:
        return 'pluck lift'
    case SymId.handbellsSwing:
        return 'swing'
    case SymId.guitarClosePedal:
    case SymId.pictOpenRimShot:
        return `stopped smufl="${SymNames.nameForSymId(sid)}"`
    case SymId.guitarHalfOpenPedal:
    case SymId.pictHalfOpen1:
    case SymId.pictHalfOpen2:
        return `half-muted smufl="${SymNames.nameForSymId(sid)}"`
    case SymId.guitarOpenPedal:
    case SymId.pictOpen:
        return `open smufl="${SymNames.nameForSymId(sid)}"`
    default:
        return '' // nothing
    }
}

//---------------------------------------------------------
//   writeChordLines
//---------------------------------------------------------

function writeChordLines(chord: Chord, xml: XmlWriter, notations: Notations): void {
    for (const e of chord.el()) {
        if (e.isChordLine()) {
            const cl = e as ChordLine
            let subtype = ''
            switch (cl.chordLineType()) {
            case ChordLineType.FALL:
                subtype = 'falloff'
                break
            case ChordLineType.DOIT:
                subtype = 'doit'
                break
            case ChordLineType.PLOP:
                subtype = 'plop'
                break
            case ChordLineType.SCOOP:
                subtype = 'scoop'
                break
            default:
                break
            }
            if (subtype) {
                subtype += color2xml(cl)
                if (cl.isStraight()) {
                    subtype += ' line-shape="straight"'
                }
                if (cl.isWavy()) {
                    subtype += ' line-type="wavy"'
                }
                notations.tag(xml, cl, 'articulations')
                xml.tagRaw(subtype)
            }
        }
    }
}

//---------------------------------------------------------
//   writeBreathMark
//---------------------------------------------------------

function writeBreathMark(breath: Breath | null, xml: XmlWriter, notations: Notations): void {
    if (breath) {
        let tagName = ''
        let type = ''

        notations.tag(xml, breath, 'articulations')
        if (breath.isCaesura()) {
            tagName = 'caesura'
            switch (breath.symId()) {
            case SymId.caesuraCurved:
                type = 'curved'
                break
            case SymId.caesuraShort:
                type = 'short'
                break
            case SymId.caesuraThick:
                type = 'thick'
                break
            case SymId.caesuraSingleStroke:
            case SymId.chantCaesura:
                type = 'single'
                break
            case SymId.caesura:
            default:
                // type = 'normal'; // is correct too, but see below
            }
        } else {
            tagName = 'breath-mark'
            switch (breath.symId()) {
            case SymId.breathMarkTick:
                type = 'tick'
                break
            case SymId.breathMarkUpbow:
                type = 'upbow'
                break
            case SymId.breathMarkSalzedo:
                type = 'salzedo'
                break
            case SymId.breathMarkComma:
            default:
                type = 'comma'
            }
        }
        tagName += color2xml(breath)
        tagName += ExportMusicXml.positioningAttributes(breath)
        if (breath.placement() === PlacementV.BELOW) {
            tagName += ' placement="below"'
        } else if (ExportMusicXml.configuration().exportMu3Compat()) {
            // MuseScore versions prior to 4.3 otherwise default to below on import
            tagName += ' placement="above"'
        }

        if (breath.isCaesura() && (!type || ExportMusicXml.configuration().exportMu3Compat())) {
            // for backwards compatibility, as 3.6.2 and earlier can't import those special caesuras,
            // but reports corruption on all subsequent measures and imports them entirely empty.
            xml.tagRaw(tagName)
        } else {
            xml.tagRaw(tagName, type)
        }
    }
}

//---------------------------------------------------------
//   arpeggiate
//---------------------------------------------------------

// <notations>
//   <arpeggiate direction="up"/>
//   </notations>

function arpeggiate(arp: Arpeggio, front: boolean, back: boolean, xml: XmlWriter, notations: Notations, arps: ArpeggioMap,
    spanArp = false): void {
    let found = false
    let arpNo = 1

    // Number arpeggios spanning multiple voices correctly
    const foundArps = arps.values(arp.tick().ticks())
    for (const arpDesc of foundArps) {
        if (arpDesc.arp === arp) {
            found = true
            arpNo = arpDesc.no
        } else {
            arpNo = Math.max(arpNo, arpDesc.no) + 1
        }
    }

    if (!found && spanArp) {
        return
    }

    let tagName = ''
    switch (arp.arpeggioType()) {
    case ArpeggioType.NORMAL:
        notations.tag(xml, arp)
        tagName = 'arpeggiate number="' + arpNo + '"'
        break
    case ArpeggioType.UP: // fall through
    case ArpeggioType.UP_STRAIGHT: // not supported by MusicXML, export as normal arpeggio
        notations.tag(xml, arp)
        tagName = 'arpeggiate direction="up" number="' + arpNo + '"'
        break
    case ArpeggioType.DOWN: // fall through
    case ArpeggioType.DOWN_STRAIGHT: // not supported by MusicXML, export as normal arpeggio
        notations.tag(xml, arp)
        tagName = 'arpeggiate direction="down" number="' + arpNo + '"'
        break
    case ArpeggioType.BRACKET:
        if (front) {
            notations.tag(xml, arp)
            tagName = 'non-arpeggiate type="bottom" number="' + arpNo + '"'
        }
        if (back) {
            notations.tag(xml, arp)
            tagName = 'non-arpeggiate type="top" number="' + arpNo + '"'
        }
        break
    default:
        break
    }

    if (tagName) {
        tagName += color2xml(arp)
        tagName += ExportMusicXml.positioningAttributes(arp)
        xml.tagRaw(tagName)
        if (!found) {
            arps.insert(arp.tick().ticks(), new MusicXmlArpeggioDesc(arp, arpNo))
        }
    }
}

//---------------------------------------------------------
//   determineTupletNormalTicks
//---------------------------------------------------------

/**
 Determine the ticks in the normal type for the tuplet \a chord.
 This is non-zero only if chord if part of a tuplet containing
 different length duration elements.
 TODO determine how to handle baselen with dots and verify correct behaviour.
 TODO verify if baseLen should always be correctly set
      (it seems after MusicXMLimport this is not the case)
 */

function determineTupletNormalTicks(t: Tuplet | null): number {
    if (!t) {
        return 0
    }
    const elements = t.elements()
    for (let i = 1; i < elements.length; ++i) {
        if (!elements[0].ticks().eq(elements[i].ticks())) {
            return t.baseLen().ticks().ticks()
        }
    }
    if (elements.length !== t.ratio().numerator()) {
        return t.baseLen().ticks().ticks()
    }
    return 0
}

//---------------------------------------------------------
//   beamFanAttribute
//---------------------------------------------------------

function beamFanAttribute(b: Beam): string {
    const epsilon = 0.1

    let fan = ''
    if ((b.growRight() - b.growLeft() > epsilon)) {
        fan = 'accel'
    }

    if ((b.growLeft() - b.growRight() > epsilon)) {
        fan = 'rit'
    }

    if (fan) {
        return ` fan="${fan}"`
    }

    return ''
}

//---------------------------------------------------------
//   writeBeam
//---------------------------------------------------------

//  beaming
//    <beam number="1">start</beam>
//    <beam number="1">end</beam>
//    <beam number="1">continue</beam>
//    <beam number="1">backward hook</beam>
//    <beam number="1">forward hook</beam>

function writeBeam(xml: XmlWriter, cr: ChordRest, b: Beam): void {
    const elements = b.elements()
    const idx = elements.indexOf(cr)
    if (idx === -1) {
        return
    }
    let blp = -1 // beam level previous chord or rest
    let blc = -1 // beam level current chord or rest
    let bln = -1 // beam level next chord or rest
    let bmc = BeamMode.AUTO // beam mode current chord or rest
    let bmn = BeamMode.AUTO // beam mode next chord or rest
    // find beam level previous chord or rest
    for (let i = idx - 1; blp === -1 && i >= 0; --i) {
        const crst = elements[i]
        blp = crst.beams()
    }
    // find beam level current chord or rest
    blc = cr.beams()
    bmc = cr.beamMode()
    // find beam level next chord or rest
    for (let i = idx + 1; bln === -1 && i < elements.length; ++i) {
        const crst = elements[i]
        bln = crst.beams()
        bmn = crst.beamMode()
    }
    // find beam type and write
    for (let i = 1; i <= blc; ++i) {
        let text = ''
        // TODO: correctly handle Beam::Mode::AUTO
        // when equivalent to BEGIN32 or BEGIN64
        if ((blp < i && bln >= i)
            || (bmc === BeamMode.BEGIN16 && i > 1)
            || (bmc === BeamMode.BEGIN32 && i > 2)) {
            text = 'begin'
        } else if (blp < i && bln < i) {
            if (bln > 0) {
                text = 'forward hook'
            } else if (blp > 0) {
                text = 'backward hook'
            }
        } else if ((blp >= i && bln < i)
                   || (bmn === BeamMode.BEGIN16 && i > 1)
                   || (bmn === BeamMode.BEGIN32 && i > 2)) {
            text = 'end'
        } else if (blp >= i && bln >= i) {
            text = 'continue'
        }
        if (text) {
            let tag = 'beam'
            tag += ` number="${i}"`
            if (text === 'begin') {
                tag += beamFanAttribute(b)
                tag += color2xml(b)
            }
            xml.tagRaw(tag, text)
        }
    }
}

//---------------------------------------------------------
//   instrId
//---------------------------------------------------------

function instrId(partNr: number, instrNr: number): string {
    return `id="P${partNr}-I${instrNr}"`
}

//---------------------------------------------------------
//   isNoteheadParenthesis
//---------------------------------------------------------

function isNoteheadParenthesis(symbol: MSymbol): boolean {
    const sym = symbol.sym()
    return sym === SymId.noteheadParenthesisLeft || sym === SymId.noteheadParenthesisRight
}

//---------------------------------------------------------
//   writeNotehead
//---------------------------------------------------------

function writeNotehead(xml: XmlWriter, note: Note): void {
    let noteheadTagname = 'notehead'
    let noteheadValue = ''
    if (color2xml(note)) {
        noteheadTagname += color2xml(note)
        noteheadValue = 'normal'
    }
    if ((note.getProperty(Pid.HAS_PARENTHESES) as ParenthesesMode) !== ParenthesesMode.NONE) {
        noteheadTagname += ' parentheses="yes"'
        noteheadValue = 'normal'
    }
    if (note.headType() === NoteHeadType.HEAD_QUARTER) {
        noteheadTagname += ' filled="yes"'
    } else if ((note.headType() === NoteHeadType.HEAD_HALF) || (note.headType() === NoteHeadType.HEAD_WHOLE)) {
        noteheadTagname += ' filled="no"'
    }
    if (!note.visible() && (!note.staffType() || !note.staffType()!.isTabStaff())) {
        // The notehead is invisible but other parts of the note might
        // still be visible so don't export <note print-object="no">.
        noteheadValue = 'none'
    } else if (note.headScheme() === NoteHeadScheme.HEAD_SHAPE_NOTE_4) {
        const degree = tpc2degree(note.tpc(), note.staff()!.key(note.tick()))
        switch (degree) {
        case 0:
        case 3:
            noteheadValue = note.chord().up() ? 'fa up' : 'fa'
            break
        case 1:
        case 4:
            noteheadValue = 'so'
            break
        case 2:
        case 5:
            noteheadValue = 'la'
            break
        case 6:
            noteheadValue = 'mi'
            break
        }
    } else if (note.headScheme() === NoteHeadScheme.HEAD_SHAPE_NOTE_7_AIKIN
               || note.headScheme() === NoteHeadScheme.HEAD_SHAPE_NOTE_7_FUNK
               || note.headScheme() === NoteHeadScheme.HEAD_SHAPE_NOTE_7_WALKER) {
        const degree = tpc2degree(note.tpc(), note.staff()!.key(note.tick()))
        switch (degree) {
        case 0:
            noteheadValue = 'do'
            break
        case 1:
            noteheadValue = 're'
            break
        case 2:
            noteheadValue = 'mi'
            break
        case 3:
            noteheadValue = note.chord().up() ? 'fa up' : 'fa'
            break
        case 4:
            noteheadValue = 'so'
            break
        case 5:
            noteheadValue = 'la'
            break
        case 6:
            noteheadValue = 'ti'
            break
        }
    } else if (note.headGroup() === NoteHeadGroup.HEAD_SLASH) {
        noteheadValue = 'slash'
    } else if (note.headGroup() === NoteHeadGroup.HEAD_TRIANGLE_UP) {
        noteheadValue = 'triangle'
    } else if (note.headGroup() === NoteHeadGroup.HEAD_DIAMOND) {
        noteheadValue = 'diamond'
    } else if (note.headGroup() === NoteHeadGroup.HEAD_PLUS) {
        noteheadValue = 'cross'
    } else if (note.headGroup() === NoteHeadGroup.HEAD_CROSS) {
        noteheadValue = 'x'
    } else if (note.headGroup() === NoteHeadGroup.HEAD_CIRCLED) {
        noteheadValue = 'circled'
    } else if (note.headGroup() === NoteHeadGroup.HEAD_XCIRCLE) {
        noteheadValue = 'circle-x'
    } else if (note.headGroup() === NoteHeadGroup.HEAD_TRIANGLE_DOWN) {
        noteheadValue = 'inverted triangle'
    } else if (note.headGroup() === NoteHeadGroup.HEAD_SLASHED1) {
        noteheadValue = 'slashed'
    } else if (note.headGroup() === NoteHeadGroup.HEAD_SLASHED2) {
        noteheadValue = 'back slashed'
    } else if (note.headGroup() === NoteHeadGroup.HEAD_DO) {
        noteheadValue = 'do'
    } else if (note.headGroup() === NoteHeadGroup.HEAD_RE) {
        noteheadValue = 're'
    } else if (note.headGroup() === NoteHeadGroup.HEAD_MI) {
        noteheadValue = 'mi'
    } else if (note.headGroup() === NoteHeadGroup.HEAD_FA && !note.chord().up()) {
        noteheadValue = 'fa'
    } else if (note.headGroup() === NoteHeadGroup.HEAD_FA && note.chord().up()) {
        noteheadValue = 'fa up'
    } else if (note.headGroup() === NoteHeadGroup.HEAD_LA) {
        noteheadValue = 'la'
    } else if (note.headGroup() === NoteHeadGroup.HEAD_TI) {
        noteheadValue = 'ti'
    } else if (note.headGroup() === NoteHeadGroup.HEAD_SOL) {
        noteheadValue = 'so'
    } else if (note.headGroup() !== NoteHeadGroup.HEAD_NORMAL) {
        const noteheadName = SymNames.nameForSymId(note.noteHead())
        noteheadTagname += ` smufl="${noteheadName}"`
        noteheadValue = 'other'
    } else if (note.headType() !== NoteHeadType.HEAD_AUTO) {
        noteheadValue = 'normal'
    }
    if (noteheadValue) {
        xml.tagRaw(noteheadTagname, noteheadValue)
    }

    if (note.headScheme() === NoteHeadScheme.HEAD_PITCHNAME
        || note.headScheme() === NoteHeadScheme.HEAD_PITCHNAME_GERMAN
        || note.headScheme() === NoteHeadScheme.HEAD_SOLFEGE
        || note.headScheme() === NoteHeadScheme.HEAD_SOLFEGE_FIXED) {
        const noteheadName = SymNames.nameForSymId(note.noteHead())
        const m = /^note([A-Z][a-z]*)(Sharp|Flat)?/.exec(noteheadName)
        // String::search(re, { 1, 2 }, SkipEmptyParts)
        const matches = m ? [m[1], m[2]].filter(s => !!s) : []
        if (matches.length) {
            xml.startElement('notehead-text')
            xml.tag('display-text', matches[0])
            if (matches.length > 1) {
                xml.tag('accidental-text', matches[1].toLowerCase())
            }
            xml.endElement()
        }
    }
}

//---------------------------------------------------------
//   writeGuitarBend
//---------------------------------------------------------

function writeGuitarBend(xml: XmlWriter, notations: Notations, note: Note): void {
    if (note.bendBack()) {
        const bend = note.bendBack()!
        if (bend.bendType() === GuitarBendType.PRE_BEND || bend.bendType() === GuitarBendType.GRACE_NOTE_BEND) {
            const bendAttrs: Array<[string, string | number]> = []
            notations.tag(xml, bend, 'technical')
            bendAttrs.push(['first-beat', bend.startTimeFactor() * 100])
            bendAttrs.push(['last-beat', bend.endTimeFactor() * 100])
            addColorAttr(bend, bendAttrs)
            xml.startElement('bend', bendAttrs)
            xml.tag('bend-alter', numStr(-0.5 * bend.bendAmountInQuarterTones(), 2))
            xml.tag('pre-bend')
            xml.endElement()
        }
    }
    if (note.bendFor()) {
        const bend = note.bendFor()!
        if (bend.bendType() === GuitarBendType.BEND || bend.bendType() === GuitarBendType.SLIGHT_BEND) {
            notations.tag(xml, bend, 'technical')
            const bendAttrs: Array<[string, string | number]> = []
            bendAttrs.push(['first-beat', bend.startTimeFactor() * 100])
            bendAttrs.push(['last-beat', bend.endTimeFactor() * 100])
            addColorAttr(bend, bendAttrs)
            xml.startElement('bend', bendAttrs)
            xml.tag('bend-alter', numStr(0.5 * bend.bendAmountInQuarterTones(), 2))
            xml.endElement()
        }
    }
    // TODO(port): tremolo bars (TremoloBar is not ported): <bend><bend-alter/><with-bar/></bend>
}

//---------------------------------------------------------
//   writeFingering
//---------------------------------------------------------

function writeFingering(xml: XmlWriter, notations: Notations, note: Note): void {
    for (const e of note.el()) {
        if (e.isFingering()) {
            const f = e as unknown as TextBase
            notations.tag(xml, e, 'technical')
            const t = MScoreTextToMusicXml.toPlainText(f.xmlText())
            let attr = ''
            if (!f.isStyled(Pid.PLACEMENT)) {
                attr += placement2xml(e)
            }
            if (!f.isStyled(Pid.FONT_FACE)) {
                attr += ` font-family="${f.getProperty(Pid.FONT_FACE) as string}"`
            }
            if (!f.isStyled(Pid.FONT_SIZE)) {
                attr += ` font-size="${argD(f.getProperty(Pid.FONT_SIZE) as number)}"`
            }
            if (!f.isStyled(Pid.FONT_STYLE)) {
                attr += fontStyleToXML(f.getProperty(Pid.FONT_STYLE) as FontStyle, false)
            }
            attr += color2xml(f)
            attr += ExportMusicXml.positioningAttributes(f)

            if (f.textStyleType() === TextStyleType.RH_GUITAR_FINGERING) {
                xml.tagRaw('pluck' + attr, t)
            } else if (f.textStyleType() === TextStyleType.LH_GUITAR_FINGERING) {
                xml.tagRaw('fingering' + attr, t)
            } else if (f.textStyleType() === TextStyleType.FINGERING) {
                // for generic fingering, try to detect plucking
                // (backwards compatibility with MuseScore 1.x)
                // p, i, m, a, c represent the plucking finger
                if (t === 'p' || t === 'i' || t === 'm' || t === 'a' || t === 'c') {
                    xml.tagRaw('pluck' + attr, t)
                } else {
                    xml.tagRaw('fingering' + attr, t)
                }
            } else if (f.textStyleType() === TextStyleType.STRING_NUMBER) {
                // C++ String::toInt(&ok)
                const ok = /^\s*[+-]?\d+\s*$/.test(t)
                const i = ok ? parseInt(t, 10) : 0
                if (ok) {
                    if (i === 0) {
                        xml.tagRaw('open-string' + attr)
                    } else if (i > 0) {
                        xml.tagRaw('string' + attr, t)
                    }
                }
            }
        } else {
            // TODO
        }
    }
}

//---------------------------------------------------------
//   writeNotationSymbols
//---------------------------------------------------------

function writeNotationSymbols(xml: XmlWriter, notations: Notations, elist: readonly EngravingItem[], excludeParentheses: boolean): void {
    for (const e of elist) {
        if (!e.isSymbol()) {
            continue
        }

        const symbol = e as unknown as MSymbol

        if (excludeParentheses && isNoteheadParenthesis(symbol)) {
            // Already handled when writing notehead properties.
            continue
        }

        notations.tag(xml, symbol)
        xml.tag('other-notation', [['type', 'single'], ['smufl', symbol.symName()]])
    }
}

//---------------------------------------------------------
//   tremoloCorrection
//---------------------------------------------------------

// duration correction for two note tremolo
function tremoloCorrection(note: Note): number {
    let tremCorr = 1
    if (isTwoNoteTremolo(note.chord())) {
        tremCorr = 2
    }
    return tremCorr
}

//---------------------------------------------------------
//   isSmallNote
//---------------------------------------------------------

function isSmallNote(note: Note): boolean {
    return note.isSmall() || note.chord().isSmall()
}

//---------------------------------------------------------
//   isCueNote
//---------------------------------------------------------

function isCueNote(note: Note): boolean {
    return isSmallNote(note) && !note.play()
}

//---------------------------------------------------------
//   timeModification
//---------------------------------------------------------

function timeModification(tuplet: Tuplet | null, tremolo = 1): Fraction {
    let actNotes = tremolo
    let nrmNotes = 1
    let t = tuplet

    while (t) {
        // cannot use Fraction::operator*() as it contains a reduce(),
        // which would change a 6:4 tuplet into 3:2
        actNotes *= t.ratio().numerator()
        nrmNotes *= t.ratio().denominator()
        t = t.tuplet()
    }

    return new Fraction(actNotes, nrmNotes)
}

//---------------------------------------------------------
//   writeType
//---------------------------------------------------------

function writeType(xml: XmlWriter, note: Note): void {
    const ratio = timeModification(note.chord().tuplet())

    const strActFraction = note.chord().globalTicks()
    const tt = strActFraction.times(ratio).times(tremoloCorrection(note))
    const { type: s, dots } = tick2xml(tt)

    // small notes are indicated by size=cue, but for grace and cue notes this is implicit
    if (isSmallNote(note) && !isCueNote(note) && !note.chord().isGrace()) {
        xml.tag('type', [['size', 'cue']], s)
    } else if (isSmallNote(note) && !isCueNote(note) && note.chord().isGrace()) {
        xml.tag('type', [['size', 'grace-cue']], s)
    } else {
        xml.tag('type', s)
    }

    if (!note.dots().length) {
        for (let ni = dots; ni > 0; --ni) {
            xml.tag('dot')
        }
    }
}

//---------------------------------------------------------
//   writeTimeModification
//---------------------------------------------------------

function writeTimeModification(xml: XmlWriter, tuplet: Tuplet | null, tremolo = 1): void {
    const ratio = timeModification(tuplet, tremolo)
    if (!ratio.eq(new Fraction(1, 1))) {
        const actNotes = ratio.numerator()
        const nrmNotes = ratio.denominator()

        const nrmTicks = determineTupletNormalTicks(tuplet)
        xml.startElement('time-modification')
        xml.tag('actual-notes', actNotes)
        xml.tag('normal-notes', nrmNotes)
        if (nrmTicks > 0) {
            const { type: nrmType, dots: nrmDots } = tick2xml(Fraction.fromTicks(nrmTicks))
            if (nrmType) {
                xml.tag('normal-type', nrmType)
                for (let ni = nrmDots; ni > 0; ni--) {
                    xml.tag('normal-dot')
                }
            }
        }
        xml.endElement()
    }
}

//---------------------------------------------------------
//   writePitch
//---------------------------------------------------------

function writePitch(xml: XmlWriter, note: Note, useDrumset: boolean): void {
    // step / alter / octave
    let step = ''
    let alter = 0
    let octave = 0
    if (!useDrumset) {
        ({ s: step, alter, octave } = pitch2xml(note))
    } else {
        ({ s: step, octave } = unpitch2xml(note))
    }
    xml.startElement(useDrumset ? 'unpitched' : 'pitch')
    xml.tag(useDrumset ? 'display-step' : 'step', step)
    // Check for microtonal accidentals and overwrite "alter" tag
    const acc = note.accidental()
    let microtonalAlter = 0.0
    if (acc) {
        switch (acc.accidentalType()) {
        case AccidentalType.MIRRORED_FLAT: microtonalAlter = -0.5
            break
        case AccidentalType.SHARP_SLASH: microtonalAlter = 0.5
            break
        case AccidentalType.MIRRORED_FLAT2: microtonalAlter = -1.5
            break
        case AccidentalType.SHARP_SLASH4: microtonalAlter = 1.5
            break
        default: break
        }
    }
    // Override accidental with explicit note tuning
    const tuning = note.tuning()
    if (!RealIsNull(tuning)) {
        microtonalAlter = tuning / 100.0
    }
    if (alter || microtonalAlter) {
        xml.tag('alter', alter + microtonalAlter)
    }
    xml.tag(useDrumset ? 'display-octave' : 'octave', octave)
    xml.endElement()
}

//---------------------------------------------------------
//   directionTag
//---------------------------------------------------------

function directionTag(xml: XmlWriter, attr: Attributes, el: EngravingItem | null = null): void {
    attr.doAttr(xml, false)
    let tagName = 'direction'
    if (el) {
        tagName += placement2xml(el)
        if (el.systemFlag() && !ExportMusicXml.configuration().exportMu3Compat()) {
            tagName += ' system="only-top"'
        }
    }
    xml.startElementRaw(tagName)
}

//---------------------------------------------------------
//   directionETag
//---------------------------------------------------------

function directionETag(xml: XmlWriter, staff: staff_idx_t, offset = 0): void {
    if (offset) {
        xml.tag('offset', [['sound', 'yes']], offset)
    }
    if (staff) {
        xml.tag('staff', staff)
    }
    xml.endElement()
}

//---------------------------------------------------------
//   partGroupStart
//---------------------------------------------------------

function partGroupStart(xml: XmlWriter, number: number, bracket: BracketItem, barlineSpan: boolean, groupTime: boolean): void {
    xml.startElement('part-group', [['type', 'start'], ['number', number]])
    let br = ''
    switch (bracket.bracketType()) {
    case BracketType.NO_BRACKET:
        br = 'none'
        break
    case BracketType.NORMAL:
        br = 'bracket'
        break
    case BracketType.BRACE:
        br = 'brace'
        break
    case BracketType.LINE:
        br = 'line'
        break
    case BracketType.SQUARE:
        br = 'square'
        break
    default:
        break
    }
    if (br) {
        let tag = 'group-symbol'
        tag += color2xml(bracket)
        xml.tagRaw(tag, br)
    }
    if (barlineSpan) {
        xml.tag('group-barline', 'yes')
    }
    if (groupTime) {
        xml.tag('group-time')
    }
    xml.endElement()
}

//---------------------------------------------------------
//   findMetronome
//---------------------------------------------------------

/**
 * C++ static indexOf(src, re, from, m): for each match of re in src (from the start), the position of the matched
 * text at or after from; the first one found
 */
function indexOfRe(src: string, re: RegExp, from: number): { pos: number; len: number } {
    const g = new RegExp(re.source, 'g')
    let m: RegExpExecArray | null
    while ((m = g.exec(src)) !== null) {
        if (m[0].length === 0) {
            g.lastIndex++
        }
        const pos = src.indexOf(m[0], from)
        if (pos !== -1) {
            return { pos, len: m[0].length }
        }
    }
    return { pos: nidx, len: 0 }
}

function findMetronome(list: readonly TextFragment[],
    wordsLeft: TextFragment[], // words left of metronome
    wordsRight: TextFragment[], // words right of metronome
): { found: boolean; hasParen: boolean; metroLeft: string; metroRight: string } {
    const words = MScoreTextToMusicXml.toPlainTextPlusSymbols(list)
    let hasParen = false
    let metroLeft = '' // left part of metronome
    let metroRight = '' // right part of metronome
    const notFound = { found: false, hasParen, metroLeft, metroRight }

    const { pos: pos1, len: len1 } = TempoText.findTempoDuration(words)
    if (pos1 === -1) {
        return notFound
    }

    let metroPos = pos1
    let metroLen = len1
    metroLeft = words.substr(pos1, len1)

    const equationRegEx = /[ \t\n\v\f\r]*=[ \t\n\v\f\r]*/
    const { pos: posEq, len: lenEq } = indexOfRe(words, equationRegEx, pos1 + len1)

    if (posEq !== nidx && posEq === pos1 + len1) {
        const sAfterEq = words.substring(posEq + lenEq)
        let { pos: pos3, len: len3 } = TempoText.findTempoDuration(sAfterEq)
        if (pos3 === -1) {
            // did not find note, try to find a number
            const numberRegEx = /\d+([,.]{1}\d+)?/
            const r = indexOfRe(sAfterEq, numberRegEx, 0)
            pos3 = r.pos
            if (pos3 !== 0) {
                pos3 = -1
            } else {
                len3 = r.len
            }
        }
        if (pos3 === 0) {
            metroRight = sAfterEq.substr(0, len3)
            metroLen = len1 + lenEq + len3
        } else {
            return { found: false, hasParen, metroLeft, metroRight }
        }
    }

    if (metroPos > 0 && words[metroPos - 1] === '(') {
        if (words.length > metroPos + metroLen && words[metroPos + metroLen] === ')') {
            hasParen = true
            metroPos -= 1
            metroLen += 2
        }
    }

    // calculate starting position corrected for surrogate pairs
    // (which were ignored by toPlainTextPlusSymbols())
    let corrPos = metroPos
    for (let i = 0; i < metroPos; ++i) {
        const c = words.charCodeAt(i)
        if (c >= 0xD800 && c <= 0xDBFF) {
            --corrPos
        }
    }
    metroPos = corrPos

    const mid: TextFragment[] = [] // not used
    MScoreTextToMusicXml.split(list, metroPos, metroLen, wordsLeft, mid, wordsRight)
    return { found: true, hasParen, metroLeft, metroRight }
}

//---------------------------------------------------------
//   beatUnit
//---------------------------------------------------------

function beatUnit(xml: XmlWriter, dur: TDuration): void {
    let dots = dur.dots()
    xml.tag('beat-unit', TConv.toXmlDurationType(dur.type()))
    while (dots > 0) {
        xml.tag('beat-unit-dot')
        --dots
    }
}

//---------------------------------------------------------
//   wordsMetronome
//---------------------------------------------------------

function wordsMetronome(xml: XmlWriter, s: MStyle, text: TextBase, offset: number): void {
    const list = text.fragmentList()
    const wordsLeft: TextFragment[] = [] // words left of metronome
    const wordsRight: TextFragment[] = [] // words right of metronome

    // set the default words format
    const mtf = s.styleSt(Sid.musicalTextFont)
    const defFmt = formatForWords(s)

    const r = findMetronome(list, wordsLeft, wordsRight)
    if (r.found) {
        if (wordsLeft.length > 0) {
            xml.startElement('direction-type')
            const attr = ExportMusicXml.positioningAttributes(text)
            const mttm = new MScoreTextToMusicXml('words', attr, defFmt, mtf)
            mttm.writeTextFragments(wordsLeft, xml)
            xml.endElement()
        }

        xml.startElement('direction-type')
        let tagName = `metronome parentheses="${r.hasParen ? 'yes' : 'no'}"`
        tagName += color2xml(text)
        tagName += ExportMusicXml.positioningAttributes(text)
        if (!text.visible()) {
            tagName += ' print-object="no"'
        }
        xml.startElementRaw(tagName)
        let dur = TempoText.findTempoDuration(r.metroLeft).dur
        beatUnit(xml, dur)

        if (r.metroRight) {
            const r2 = TempoText.findTempoDuration(r.metroRight)
            dur = r2.dur
            if (r2.pos !== -1) {
                beatUnit(xml, dur)
            } else {
                xml.tag('per-minute', r.metroRight)
            }
        }

        xml.endElement()
        xml.endElement()

        if (wordsRight.length > 0) {
            xml.startElement('direction-type')
            const attr = ExportMusicXml.positioningAttributes(text)
            const mttm = new MScoreTextToMusicXml('words', attr, defFmt, mtf)
            mttm.writeTextFragments(wordsRight, xml)
            xml.endElement()
        }
    } else {
        xml.startElement('direction-type')
        let attr = ''
        attr += frame2xml(text)
        attr += color2xml(text)
        attr += ExportMusicXml.positioningAttributes(text)
        const mttm = new MScoreTextToMusicXml('words', attr, defFmt, mtf)
        mttm.writeTextFragments(text.fragmentList(), xml)
        xml.endElement()
    }

    if (offset) {
        xml.tag('offset', [['sound', 'yes']], offset)
    }
}

//---------------------------------------------------------
//   getImageInfo
//---------------------------------------------------------

function getImageInfo(isi: ImageStoreItem): { source: string; type: string } {
    let source = isi.hashName()
    const suffix = isi.type().toLowerCase()
    let type = ''

    if (suffix === 'svg' || suffix === 'svgz') {
        type = 'image/svg+xml'
    } else if (suffix === 'png') {
        type = 'image/png'
    } else if (suffix === 'jpg' || suffix === 'jpeg') {
        type = 'image/jpeg'
    } else if (suffix === 'gif') {
        type = 'image/gif'
    } else if (suffix === 'bmp') {
        type = 'image/bmp'
    } else if (suffix === 'tif' || suffix === 'tiff') {
        type = 'image/tiff'
    }

    if (!type) {
        const ba = isi.buffer()
        if (ba.length >= 4) {
            if (ba[0] === 0x89 && ba[1] === 0x50 && ba[2] === 0x4E && ba[3] === 0x47) {
                type = 'image/png'
                if (!suffix) {
                    source += '.png'
                }
            } else if (ba[0] === 0xFF && ba[1] === 0xD8 && ba[2] === 0xFF) {
                type = 'image/jpeg'
                if (!suffix) {
                    source += '.jpg'
                }
            } else if (ba[0] === 0x47 && ba[1] === 0x49 && ba[2] === 0x46 && ba[3] === 0x38) {
                type = 'image/gif'
                if (!suffix) {
                    source += '.gif'
                }
            } else if (ba[0] === 0x42 && ba[1] === 0x4D) {
                type = 'image/bmp'
                if (!suffix) {
                    source += '.bmp'
                }
            } else if ((ba[0] === 0x49 && ba[1] === 0x49 && ba[2] === 0x2A && ba[3] === 0x00)
                       || (ba[0] === 0x4D && ba[1] === 0x4D && ba[2] === 0x00 && ba[3] === 0x2A)) {
                type = 'image/tiff'
                if (!suffix) {
                    source += '.tif'
                }
            } else if (ba[0] === 0x3C && (ba[1] === 0x3F || ba[1] === 0x73)) {
                type = 'image/svg+xml'
                if (!suffix) {
                    source += '.svg'
                }
            }
        }
    }

    if (!type) {
        type = 'application/octet-stream'
    }
    return { source, type }
}

//---------------------------------------------------------
//   findInString
//---------------------------------------------------------

// find the longest first match of dynList's dynamic text in s
// used by the MusicXML export to correctly export dynamics embedded
// in spanner begin- or endtexts
// return match's position and length and the dynamic type

function findDynamicInString(s: string): { index: number; length: number; type: string } {
    let length = 0
    let type = ''
    let matchIndex = nidx
    const n = DynamicType.LAST - 1

    // for all dynamics, find their text in s
    for (let i = 0; i < n; ++i) {
        const t = i as DynamicType
        const dynamicText = Dynamic.dynamicText(t)
        const dynamicLength = dynamicText.length
        // note: skip entries with empty text
        if (dynamicLength > 0) {
            const index = s.indexOf(dynamicText)
            if (index !== -1) {
                // found a match, accept it if
                // - it is the first one
                // - or it starts a the same index but is longer ("pp" versus "p")
                if (matchIndex === nidx || (index === matchIndex && dynamicLength > length)) {
                    matchIndex = index
                    length = dynamicLength
                    type = TConv.toXmlDynamicType(t)
                }
            }
        }
    }

    return { index: matchIndex, length, type }
}

//---------------------------------------------------------
//   writeHairpinText
//---------------------------------------------------------

function writeHairpinText(xml: XmlWriter, tlb: TextLineBase, isStart = true): void {
    let text = isStart ? tlb.beginText() : tlb.endText()
    while (text) {
        const r = findDynamicInString(text)
        let dynamicPosition = r.index
        const dynamicLength = r.length
        const dynamicsType = r.type
        if (dynamicPosition === nidx || dynamicPosition > 0) {
            // text remaining and either no dynamic of not at front of text
            xml.startElement('direction-type')
            let tag = 'words'
            tag += ` font-family="${tlb.getProperty(isStart ? Pid.BEGIN_FONT_FACE : Pid.END_FONT_FACE) as string}"`
            tag += ` font-size="${argD(tlb.getProperty(isStart ? Pid.BEGIN_FONT_SIZE : Pid.END_FONT_SIZE) as number)}"`
            tag += fontStyleToXML(tlb.getProperty(isStart ? Pid.BEGIN_FONT_STYLE : Pid.END_FONT_STYLE) as FontStyle)
            tag += color2xml(tlb)
            tag += ExportMusicXml.positioningAttributes(tlb, isStart)
            xml.tagRaw(tag, dynamicPosition === nidx ? text : text.substring(0, dynamicPosition))
            xml.endElement()
            if (dynamicPosition === nidx) {
                text = ''
            } else if (dynamicPosition > 0) {
                text = text.substring(dynamicPosition)
                dynamicPosition = 0
            }
        }
        if (dynamicPosition === 0) {
            // dynamic at front of text
            xml.startElement('direction-type')
            let tag = 'dynamics'
            tag += color2xml(tlb)
            tag += ExportMusicXml.positioningAttributes(tlb, isStart)
            xml.startElementRaw(tag)
            xml.tagRaw(dynamicsType)
            xml.endElement()
            xml.endElement()
            text = text.substring(dynamicLength)
        }
    }
}

//---------------------------------------------------------
//   writeWordsAndSymbolsXml
//   Writes a string that may contain <sym>...</sym> elements as words and symbol elements.
//---------------------------------------------------------

function writeWordsAndSymbolsXml(xml: XmlWriter, words: string, attrs: string): void {
    // Write symbols as separate elements, the rest as words.
    const symRegex = /<sym>([^<>]+)<\/sym>/g
    let lastPos = 0
    let foundSym = false
    let m: RegExpExecArray | null
    while ((m = symRegex.exec(words)) !== null) {
        foundSym = true
        const matchPos = m.index
        const matchLen = m[0].length
        // Text before <sym>
        if (matchPos > lastPos) {
            const before = words.substring(lastPos, matchPos)
            if (before.trim()) {
                xml.tagRaw('words' + attrs, before.trim())
            }
        }
        const symName = m[1]
        if (symName.trim()) {
            xml.tagRaw('symbol' + attrs, symName.trim())
        }
        lastPos = matchPos + matchLen
    }
    // Text after last <sym>
    if (foundSym && lastPos < words.length) {
        const after = words.substring(lastPos)
        if (after.trim()) {
            xml.tagRaw('words' + attrs, after.trim())
        }
    }
    // If no <sym> found
    if (!foundSym) {
        xml.tagRaw('words' + attrs, words)
    }
}

//---------------------------------------------------------
//   directionJump -- write jump
//---------------------------------------------------------

// LVIFIX: TODO coda and segno should be numbered uniquely

function directionJump(xml: XmlWriter, jp: Jump): void {
    const jtp = jp.jumpType()
    let words = ''
    let sound = ''
    let isDaCapo = false
    let isDalSegno = false
    if (jtp === JumpType.DC) {
        words = jp.xmlText() ? jp.xmlText() : 'D.C.'
        isDaCapo = true
    } else if (jtp === JumpType.DC_AL_FINE) {
        words = jp.xmlText() ? jp.xmlText() : 'D.C. al Fine'
        isDaCapo = true
    } else if (jtp === JumpType.DC_AL_CODA) {
        words = jp.xmlText() ? jp.xmlText() : 'D.C. al Coda'
        isDaCapo = true
    } else if (jtp === JumpType.DS_AL_CODA) {
        words = jp.xmlText() ? jp.xmlText() : 'D.S. al Coda'
        isDalSegno = true
    } else if (jtp === JumpType.DS_AL_FINE) {
        words = jp.xmlText() ? jp.xmlText() : 'D.S. al Fine'
        isDalSegno = true
    } else if (jtp === JumpType.DS) {
        words = 'D.S.'
        isDalSegno = true
    } else {
        words = jp.xmlText()
        if (jp.jumpTo() === 'start') {
            isDaCapo = true
        } else {
            isDalSegno = true
        }
    }

    if (isDaCapo) {
        sound = 'dacapo="yes"'
    } else if (isDalSegno) {
        if (!jp.xmlText()) {
            sound = 'dalsegno="1"'
        } else {
            sound = 'dalsegno="' + jp.jumpTo() + '"'
        }
    }

    if (ExportMusicXml.canWrite(jp) && words) {
        xml.startElement('direction', [['placement', TConv.toXmlPlacementV(jp.placement())]])
        xml.startElement('direction-type')
        let attrs = color2xml(jp)
        attrs += ExportMusicXml.positioningAttributes(jp)
        writeWordsAndSymbolsXml(xml, words, attrs)
        xml.endElement()
        if (sound) {
            xml.tagRaw('sound ' + sound)
        }
        xml.endElement()
    } else if (sound) {
        xml.tagRaw('sound ' + sound)
    }
}

//---------------------------------------------------------
//   getEffectiveMarkerType
//---------------------------------------------------------

function getEffectiveMarkerType(m: Marker, jumps: readonly Jump[]): MarkerType {
    let mtp = m.markerType()

    if (mtp !== MarkerType.USER) {
        return mtp
    }

    // Try to guess marker type from its usage in jumps.
    const label = m.label()

    for (const j of jumps) {
        let guessedMarkerType: MarkerType = mtp

        if (j.jumpTo() === label) {
            guessedMarkerType = MarkerType.SEGNO
        } else if (j.playUntil() === label) {
            guessedMarkerType = !j.continueAt() ? MarkerType.FINE : MarkerType.TOCODA
        } else if (j.continueAt() === label) {
            guessedMarkerType = MarkerType.CODA
        }

        if (guessedMarkerType !== mtp) {
            if (mtp !== MarkerType.USER) {
                // Type guesses differ for different jump elements.
                return MarkerType.USER
            }
            mtp = guessedMarkerType
        }
    }

    return mtp
}

//---------------------------------------------------------
//   findCodaLabel
//---------------------------------------------------------

function findCodaLabel(jumps: readonly Jump[], toCodaLabel: string): string {
    for (const j of jumps) {
        if (j.playUntil() === toCodaLabel) {
            return j.continueAt()
        }
    }

    return ''
}

//---------------------------------------------------------
//   directionMarker -- write marker
//---------------------------------------------------------

function directionMarker(xml: XmlWriter, m: Marker, jumps: readonly Jump[]): void {
    const mtp = getEffectiveMarkerType(m, jumps)
    let words = ''
    let smufl = ''
    let type = ''
    let sound = ''

    switch (mtp) {
    case MarkerType.VARCODA:
    case MarkerType.CODA:
    case MarkerType.CODETTA:
        if (mtp === MarkerType.VARCODA) {
            smufl = 'codaSquare'
        }
        type = 'coda'
        if (!m.label()) {
            sound = 'coda="1"'
        } else {
            sound = 'coda="' + m.label() + '"'
        }
        break
    case MarkerType.VARSEGNO:
    case MarkerType.SEGNO:
        if (mtp === MarkerType.VARSEGNO) {
            smufl = 'segnoSerpent1'
        }
        type = 'segno'
        if (!m.label()) {
            sound = 'segno="1"'
        } else {
            sound = 'segno="' + m.label() + '"'
        }
        break
    case MarkerType.FINE:
        words = m.xmlText()
        sound = 'fine="yes"'
        break
    case MarkerType.TOCODA:
    case MarkerType.TOCODASYM:
    case MarkerType.DA_CODA:
    case MarkerType.DA_DBLCODA: {
        if (!m.xmlText()) {
            words = 'To Coda'
        } else {
            words = m.xmlText()
        }
        const codaLabel = findCodaLabel(jumps, m.label())
        if (!codaLabel) {
            sound = 'tocoda="1"'
        } else {
            sound = 'tocoda="' + codaLabel + '"'
        }
        break
    }
    case MarkerType.USER:
        break
    }

    if (ExportMusicXml.canWrite(m) && (words || type)) {
        xml.startElement('direction', [['placement', TConv.toXmlPlacementV(m.placement())]])
        xml.startElement('direction-type')
        let attrs = color2xml(m)
        attrs += ExportMusicXml.positioningAttributes(m)
        if (smufl) {
            attrs += ` smufl="${smufl}"`
        }
        if (type) {
            xml.tagRaw(type + attrs)
        }
        if (words) {
            writeWordsAndSymbolsXml(xml, words, attrs)
        }
        xml.endElement()
        if (sound) {
            xml.tagRaw('sound ' + sound)
        }
        xml.endElement()
    } else if (sound) {
        xml.tagRaw('sound ' + sound)
    }
}

//---------------------------------------------------------
//  findTrackForAnnotations
//---------------------------------------------------------

// An annotation is attached to the staff, with track set
// to the lowest track in the staff. Find a track for it
// (the lowest track in this staff that has a chord or rest)

function findTrackForAnnotations(track: track_idx_t, seg: Segment | null): track_idx_t {
    if (!seg || !(seg.isChordRestType() || seg.isTimeTickType())) {
        return nidx
    }

    const staff = Math.trunc(track / VOICES)
    const strack = staff * VOICES // start track of staff containing track
    const etrack = strack + VOICES // end track of staff containing track + 1

    for (let i = strack; i < etrack; i++) {
        if (seg.element(i)) {
            return i
        }
    }

    return nidx
}

//---------------------------------------------------------
//  measureRepeat -- write measure-repeat
//---------------------------------------------------------

function measureRepeat(xml: XmlWriter, attr: Attributes, m: Measure, partIndex: number): void {
    const part = m.score()!.parts()[partIndex]
    const scoreRelStaff = m.score()!.staffIdxOfPart(part)
    for (let i = 0; i < part.nstaves(); ++i) {
        const staffIdx = scoreRelStaff + i
        const styleAttrs: Array<[string, string | number]> = []
        if (part.nstaves() > 1) {
            styleAttrs.push(['number', i + 1])
        }
        const prev = m.prevMeasure()
        if (m.isMeasureRepeatGroup(staffIdx)
            && (!prev || !prev.isMeasureRepeatGroup(staffIdx)
                || (m.measureRepeatNumMeasures(staffIdx) !== prev.measureRepeatNumMeasures(staffIdx)))) {
            attr.doAttr(xml, true)
            addColorAttr(m.measureRepeatElement(staffIdx)!, styleAttrs)
            xml.startElement('measure-style', styleAttrs)
            const numMeasures = m.measureRepeatNumMeasures(staffIdx)
            if (numMeasures > 1) {
                // slashes == numMeasures for everything MuseScore currently supports
                xml.tag('measure-repeat', [['slashes', numMeasures], ['type', 'start']], numMeasures)
            } else {
                // no need to include slashes
                xml.tag('measure-repeat', [['type', 'start']], numMeasures)
            }
            xml.endElement()
        } else if (
            // no longer in measure repeats
            prev && ((prev.isMeasureRepeatGroup(staffIdx) && !m.isMeasureRepeatGroup(staffIdx))
                     // or still in measure repeats, but now of different duration
                     || (prev.measureRepeatElement(staffIdx) && m.measureRepeatElement(staffIdx)
                         && (m.measureRepeatNumMeasures(staffIdx) !== prev.measureRepeatNumMeasures(staffIdx))))) {
            attr.doAttr(xml, true)
            xml.startElement('measure-style', styleAttrs)
            xml.tag('measure-repeat', [['type', 'stop']], '')
            xml.endElement()
        }
    }
}

//---------------------------------------------------------
//  measureStyle -- write measure-style
//---------------------------------------------------------

// this is done at the first measure of a multimeasure rest
// note: for a normal measure, mmRest1 is the measure itself,
// for a multi-measure rest, it is the replacing measure

function measureStyle(xml: XmlWriter, attr: Attributes, m: Measure, partIndex: number): void {
    const mmR1 = m.coveringMMRestOrThis()
    if (m !== mmR1 && m === mmR1.mmRestFirst()) {
        attr.doAttr(xml, true)
        xml.startElement('measure-style')
        let multiRestTag = 'multiple-rest'
        if (m.score()!.style().styleB(Sid.oldStyleMultiMeasureRests)) {
            if (mmR1.mmRestCount() <= m.score()!.style().styleI(Sid.mmRestOldStyleMaxMeasures)) {
                multiRestTag += ' use-symbols="yes"'
            } else {
                multiRestTag += ' use-symbols="no"'
            }
        }
        xml.tagRaw(multiRestTag, mmR1.mmRestCount())
        xml.endElement()
    } else {
        // measure repeat can only possibly be present if mmrest was not
        measureRepeat(xml, attr, m, partIndex)
    }
}

//---------------------------------------------------------
//  commonAnnotations
//---------------------------------------------------------

function commonAnnotations(exp: ExportMusicXml, e: EngravingItem, sstaff: staff_idx_t): boolean {
    if (!ExportMusicXml.canWrite(e)) {
        // write only tempo and swing
        if (e.isTempoText()) {
            exp.tempoSound(e as TempoText)
        } else if (e.isSystemText()) {
            const text = e as unknown as StaffTextBase
            if (text.swing()) {
                exp.swingSound(text, true)
            }
        }
        return false
    }

    // note: the instrument change details are handled in ExportMusicXml::writeMeasureTracks,
    // optionally writing the associated staff text is done below
    if (e.isTempoText()) {
        exp.tempoText(e as TempoText, sstaff)
    } else if (e.isPlayTechAnnotation()) {
        exp.playText(e as unknown as PlayTechAnnotation, sstaff)
    } else if (e.isCapo() || e.isStringTunings() || e.isStaffText() || e.isTripletFeel() || e.isText()
               || e.isExpression() || (e.isInstrumentChange() && e.visible()) || e.isSticking()) {
        exp.words(e as unknown as TextBase, sstaff)
    } else if (e.isDynamic()) {
        exp.dynamic(e as unknown as Dynamic, sstaff)
    } else if (e.isHarpPedalDiagram()) {
        exp.harpPedals(e as unknown as HarpPedalDiagram, sstaff)
    } else if (e.isRehearsalMark()) {
        exp.rehearsal(e as unknown as RehearsalMark, sstaff)
    } else if (e.isImage()) {
        exp.image(e as unknown as Image, sstaff)
    } else if (e.isSystemText()) {
        exp.systemText(e as unknown as StaffTextBase, sstaff)
    }

    return true
}

//---------------------------------------------------------
//  annotations
//---------------------------------------------------------

// Only handle common annotations, others are handled elsewhere

function annotations(exp: ExportMusicXml, strack: track_idx_t, etrack: track_idx_t, track: track_idx_t, sstaff: staff_idx_t, seg: Segment): void {
    for (const e of seg.annotations()) {
        let wtrack = nidx // track to write annotation

        if (strack <= e.track() && e.track() < etrack) {
            wtrack = findTrackForAnnotations(e.track(), seg)
        }

        if (track === wtrack) {
            if (commonAnnotations(exp, e, sstaff)) {
                // already handled
            }
        }
    }
}

//---------------------------------------------------------
//  harmonies
//---------------------------------------------------------

/*
 * Helper method to export harmonies and chord diagrams for a single segment.
 */

function segmentHarmonies(exp: ExportMusicXml, track: track_idx_t, seg: Segment, offset: Fraction): void {
    const diagrams = seg.findAnnotations(ElementType.FRET_DIAGRAM, track, track)
    const harmonies = seg.findAnnotations(ElementType.HARMONY, track, track)

    for (const d of diagrams) {
        const diagram = d as unknown as FretDiagram
        const harmony = diagram.harmony()
        if (harmony) {
            exp.harmony(harmony, diagram, offset)
        } else if (harmonies.length) {
            const defaultHarmony = harmonies[harmonies.length - 1]
            exp.harmony(defaultHarmony as unknown as Harmony, diagram, offset)
            harmonies.pop()
        } else {
            // Found a fret diagram with no harmony, ignore
        }
    }

    for (const h of harmonies) {
        exp.harmony(h as unknown as Harmony, null, offset)
    }
}

/*
 * Write harmonies and fret diagrams that are attached to chords or rests.
 *
 * There are fondamental differences between the ways Musescore and MusicXML handle harmonies (Chord symbols)
 * and fretboard diagrams.
 *
 * In MuseScore, the Harmony element is now a child of FretboardDiagram BUT in previous versions,
 * both elements were independant siblings so we have to handle both cases.
 * In MusicXML, fretboard diagram is always contained in a harmony element.
 *
 * In MuseScore, Harmony elements are not always linked to notes, and each Harmony will be contained
 * in a `ChordRest` Segment.
 * In MusicXML, those successive Harmony elements must be exported before the note with different offsets.
 *
 * Edge cases that we simply cannot handle:
 *  - as of MusicXML 3.1, there is no way to represent a diagram without an associated chord symbol,
 * so when we encounter such an object in MuseScore, we simply cannot export it.
 *  - If a ChordRest segment contans a FretboardDiagram with no harmonies and several different Harmony siblings,
 * we simply have to pick a random one to export.
 */

function harmonies(exp: ExportMusicXml, track: track_idx_t, seg: Segment): void {
    let offset = new Fraction(0, 1)
    segmentHarmonies(exp, track, seg, offset)

    // Edge case: find remaining `harmony` elements.
    // Suppose you have one single whole note in the measure but several chord symbols.
    // In MuseScore, each `Harmony` object will be stored in a `ChordRest` Segment that contains
    // no other Chords.
    // But in MusicXML, you are supposed to output all `harmony` elements before the first `note`,
    // with different `offset` parameters.
    //
    // That's why we need to explore the remaining segments to find
    // `Harmony` and `FretDiagram` elements in Segments without Chords and output them now.
    for (let seg1 = seg.next(); seg1; seg1 = seg1.next()) {
        if (!seg1.isChordRestType()) {
            continue
        }

        const el1 = seg1.element(track)
        if (el1) { // found a ChordRest, next harmony will be attached to this one
            break
        }
        offset = seg1.tick().minus(seg.tick())
        segmentHarmonies(exp, track, seg1, offset)
    }
}

//---------------------------------------------------------
//   Write MusicXML
//
// Writes the portion within the <figure> tag.
//
// NOTE: Both MuseScore and MusicXML provide two ways of altering the (temporal) length of a
// figured bass object: extension lines and duration. The convention is that an EXTENSION is
// used if the figure lasts LONGER than the note (i.e., it "extends" to the following notes),
// whereas DURATION is used if the figure lasts SHORTER than the note (e.g., when notating a
// figure change under a note). However, MuseScore does not restrict durations in this way,
// allowing them to act as extensions themselves. As a result, a few more branches are
// required in the decision tree to handle everything correctly.
//---------------------------------------------------------

//---------------------------------------------------------
//   Convert Modifier to MusicXML prefix/suffix
//---------------------------------------------------------

function Modifier2MusicXml(prefix: FiguredBassModifier): string {
    switch (prefix) {
    case FiguredBassModifier.NONE: return ''
    case FiguredBassModifier.DOUBLEFLAT: return 'flat-flat'
    case FiguredBassModifier.FLAT: return 'flat'
    case FiguredBassModifier.NATURAL: return 'natural'
    case FiguredBassModifier.SHARP: return 'sharp'
    case FiguredBassModifier.DOUBLESHARP: return 'double-sharp'
    case FiguredBassModifier.CROSS: return 'cross'
    case FiguredBassModifier.BACKSLASH: return 'backslash'
    case FiguredBassModifier.SLASH: return 'slash'
    case FiguredBassModifier.NUMOF: return '' // prevent gcc "‘FBINumOfAccid’ not handled in switch" warning
    }
    return ''
}

function writeMusicXmlFiguredBassItem(item: FiguredBassItem, xml: XmlWriter, isOriginalFigure: boolean, crEndTick: number, fbEndTick: number): void {
    xml.startElement('figure')

    // The first figure of each group is the "original" figure. Practically, it is one inserted manually
    // by the user, rather than automatically by the "duration" extend method.
    if (isOriginalFigure) {
        const strPrefix = Modifier2MusicXml(item.prefix())
        if (strPrefix) {
            xml.tag('prefix', strPrefix)
        }
        if (item.digit() !== FBIDigitNone) {
            xml.tag('figure-number', item.digit())
        }
        const strSuffix = Modifier2MusicXml(item.suffix())
        if (strSuffix) {
            xml.tag('suffix', strSuffix)
        }

        // Check if the figure ends before or at the same time as the current note. Otherwise, the figure
        // extends to the next note, and so carries an extension type "start" by definition.
        if (fbEndTick <= crEndTick) {
            if (item.contLine() === FiguredBassContLine.SIMPLE) {
                xml.tag('extend', [['type', 'stop']])
            } else if (item.contLine() === FiguredBassContLine.EXTENDED) {
                const hasFigure = (!!strPrefix || item.digit() !== FBIDigitNone || !!strSuffix)
                if (hasFigure) {
                    xml.tag('extend', [['type', 'start']])
                } else {
                    xml.tag('extend', [['type', 'continue']])
                }
            }
        } else {
            xml.tag('extend', [['type', 'start']])
        }
    } else {
        // If the figure is not "original", it must have been created using the "duration" feature of figured bass.
        // In other words, the original figure belongs to a previous note rather than the current note.
        if (crEndTick < fbEndTick) {
            xml.tag('extend', [['type', 'continue']])
        } else {
            xml.tag('extend', [['type', 'stop']])
        }
    }
    xml.endElement()
}

function writeMusicXmlFiguredBass(item: FiguredBass, xml: XmlWriter, isOriginalFigure: boolean, crEndTick: number, fbEndTick: number,
    writeDuration: boolean, divisions: number): void {
    let attrs: Array<[string, string | number]> = []
    if (item.hasParentheses()) { // C++ FiguredBass::parenthesesMode()
        attrs = [['parentheses', 'yes']]
    }
    if (item.placeAbove()) {
        attrs.push(['placement', 'above'])
    }
    addColorAttr(item, attrs)
    if (!item.visible()) {
        attrs.push(['print-object', 'no'])
    }
    xml.startElement('figured-bass', attrs)
    for (const fbItem of item.items()) {
        writeMusicXmlFiguredBassItem(fbItem, xml, isOriginalFigure, crEndTick, fbEndTick)
    }
    if (writeDuration) {
        xml.tag('duration', calculateDurationInDivisions(item.ticks(), divisions))
    }
    xml.endElement()
}

//---------------------------------------------------------
//  figuredBass
//---------------------------------------------------------

function figuredBass(xml: XmlWriter, strack: track_idx_t, etrack: track_idx_t, track: track_idx_t, cr: ChordRest, fbMap: FigBassMap,
    divisions: number): void {
    const seg = cr.segment()!
    if (seg.segmentType() === SegmentType.ChordRest) {
        for (const e of seg.annotations()) {
            let wtrack = nidx // track to write annotation

            if (strack <= e.track() && e.track() < etrack) {
                wtrack = findTrackForAnnotations(e.track(), seg)
            }

            if (track === wtrack) {
                if (e.isFiguredBass()) {
                    let fb = e as unknown as FiguredBass
                    if (!fb.items().length) {
                        continue
                    }
                    const extend = fb.ticks().gt(cr.actualTicks())
                    if (extend) {
                        if (!fbMap.has(strack)) {
                            fbMap.set(strack, fb)
                        }
                    } else {
                        fbMap.delete(strack)
                    }
                    const crEndTick = cr.endTick()
                    const fbEndTick = fb.segment()!.tick().plus(fb.ticks())
                    const writeDuration = fb.ticks().lt(cr.actualTicks())
                    writeMusicXmlFiguredBass(fb, xml, true, crEndTick.ticks(), fbEndTick.ticks(),
                        writeDuration, divisions)
                    // Check for changing figures under a single note (each figure stored in a separate segment)
                    for (let segNext = seg.next(); segNext && segNext.element(track) === null; segNext = segNext.next()) {
                        for (const annot of segNext.annotations()) {
                            if (annot.isFiguredBass() && annot.track() === track) {
                                fb = annot as unknown as FiguredBass
                                writeMusicXmlFiguredBass(fb, xml, true, 0, 0, true, divisions)
                            }
                        }
                    }
                    // no extend can be pending
                    return
                }
            }
        }
        // check for extend pending
        if (fbMap.has(strack)) {
            const fb = fbMap.get(strack)!
            const crEndTick = cr.endTick()
            const fbEndTick = fb.segment()!.tick().plus(fb.ticks())
            const writeDuration = fb.ticks().lt(cr.actualTicks())
            if (cr.tick().lt(fbEndTick)) {
                writeMusicXmlFiguredBass(fb, xml, false, crEndTick.ticks(), fbEndTick.ticks(), writeDuration, divisions)
            }
            if (fbEndTick.le(crEndTick)) {
                fbMap.delete(strack)
            }
        }
    }
}

//---------------------------------------------------------
//  spannerStart
//---------------------------------------------------------

// for each spanner start:
// find start track
// find stop track
// if stop track < start track
//   get data from list of already stopped spanners
// else
//   calculate data
// write start if in right track

function spannerStart(exp: ExportMusicXml, strack: track_idx_t, etrack: track_idx_t, track: track_idx_t, sstaff: staff_idx_t, seg: Segment): void {
    if (seg.isChordRestType() || seg.isTimeTickType()) {
        const stick = seg.tick()
        for (const e of exp.score().spanner()) {
            if (e.tick().ticks() !== stick.ticks()) {
                continue
            }

            if (!ExportMusicXml.canWrite(e)) {
                continue
            }

            let wtrack = nidx // track to write spanner
            if (strack <= e.track() && e.track() < etrack) {
                wtrack = findTrackForAnnotations(e.track(), seg)
            }

            if (track === wtrack) {
                switch (e.type()) {
                case ElementType.HAIRPIN:
                    exp.hairpin(e as unknown as Hairpin, sstaff, seg.tick())
                    break
                case ElementType.OTTAVA:
                    exp.ottava(e as unknown as Ottava, sstaff, seg.tick())
                    break
                case ElementType.PEDAL:
                    exp.pedal(e as unknown as Pedal, sstaff, seg.tick())
                    break
                case ElementType.TEXTLINE:
                case ElementType.LET_RING:
                case ElementType.GRADUAL_TEMPO_CHANGE:
                case ElementType.PALM_MUTE:
                case ElementType.WHAMMY_BAR:
                case ElementType.RASGUEADO:
                case ElementType.HARMONIC_MARK:
                case ElementType.PICK_SCRAPE:
                    exp.textLine(e as unknown as TextLineBase, sstaff, seg.tick())
                    break
                case ElementType.TRILL:
                    // ignore (written as <note><notations><ornaments><wavy-line>)
                    break
                case ElementType.SLUR:
                    // ignore (written as <note><notations><slur>)
                    break
                default:
                    break
                }
            }
        } // for
    }
}

//---------------------------------------------------------
//  spannerStop
//---------------------------------------------------------

// called after writing each chord or rest to check if a spanner must be stopped
// loop over all spanners and find spanners in strack ending at tick2
// note that more than one voice may contains notes ending at tick2,
// remember which spanners have already been stopped (the "stopped" set)

function spannerStop(exp: ExportMusicXml, strack: track_idx_t, etrack: track_idx_t, tick2: Fraction, sstaff: staff_idx_t,
    stopped: Set<Spanner>): void {
    for (const e of exp.score().spanner()) {
        if (!ExportMusicXml.canWrite(e)) {
            continue
        }

        if (!e.tick2().eq(tick2) || e.track() < strack || e.track() >= etrack) {
            continue
        }

        if (!stopped.has(e)) {
            stopped.add(e)
            switch (e.type()) {
            case ElementType.HAIRPIN:
                exp.hairpin(e as unknown as Hairpin, sstaff, new Fraction(-1, 1))
                break
            case ElementType.OTTAVA:
                exp.ottava(e as unknown as Ottava, sstaff, new Fraction(-1, 1))
                break
            case ElementType.PEDAL:
                exp.pedal(e as unknown as Pedal, sstaff, new Fraction(-1, 1))
                break
            case ElementType.TEXTLINE:
            case ElementType.LET_RING:
            case ElementType.GRADUAL_TEMPO_CHANGE:
            case ElementType.PALM_MUTE:
            case ElementType.WHAMMY_BAR:
            case ElementType.RASGUEADO:
            case ElementType.HARMONIC_MARK:
            case ElementType.PICK_SCRAPE:
                exp.textLine(e as unknown as TextLineBase, sstaff, new Fraction(-1, 1))
                break
            case ElementType.TRILL:
                // ignore (written as <note><notations><ornaments><wavy-line>
                break
            case ElementType.SLUR:
                // ignore (written as <note><notations><slur>)
                break
            default:
                break
            }
        }
    } // for
}

//---------------------------------------------------------
//  findPartGroupNumber
//---------------------------------------------------------

function findPartGroupNumber(partGroupEnd: readonly number[]): number {
    // find part group number
    for (let number = 0; number < MAX_PART_GROUPS; ++number) {
        if (partGroupEnd[number] === -1) {
            return number
        }
    }
    return MAX_PART_GROUPS
}

//---------------------------------------------------------
//  scoreInstrument
//---------------------------------------------------------

function scoreInstrument(xml: XmlWriter, partNr: number, instrNr: number, instrName: string, instr: Instrument | null = null): void {
    xml.startElementRaw(`score-instrument ${instrId(partNr, instrNr)}`)
    xml.tag('instrument-name', instrName)
    if (instr && instr.musicXmlId() && !MScore.testMode) {
        xml.tag('instrument-sound', instr.musicXmlId())
    }
    xml.endElement()
}

//---------------------------------------------------------
//  midiInstrument
//---------------------------------------------------------

function midiInstrument(xml: XmlWriter, partNr: number, instrNr: number,
    instr: Instrument, score: Score, unpitched = 0): void {
    xml.startElementRaw(`midi-instrument ${instrId(partNr, instrNr)}`)
    const midiChannel = score.masterScore().midiChannel(instr.channel(0)!.channel())
    if (midiChannel >= 0 && midiChannel < 16) {
        xml.tag('midi-channel', midiChannel + 1)
    }
    const midiProgram = instr.channel(0)!.program()
    if (midiProgram >= 0 && midiProgram < 128) {
        xml.tag('midi-program', midiProgram + 1)
    }
    if (unpitched > 0) {
        xml.tag('midi-unpitched', unpitched)
    }
    xml.tag('volume', (instr.channel(0)!.volume() / 127.0) * 100) //percent
    xml.tag('pan', cInt(((instr.channel(0)!.pan() - 63.5) / 63.5) * 90)) //-90 hard left, +90 hard right      xml.etag();
    xml.endElement()
}

//---------------------------------------------------------
//  initInstrMap
//---------------------------------------------------------

/**
 Initialize the Instrument* to number map for a Part
 Used to generate instrument numbers for a multi-instrument part
 */

function initInstrMap(im: MusicXmlInstrumentMap, il: Iterable<Instrument>): void {
    im.clear()
    for (const instr of il) {
        if (!im.has(instr)) {
            im.set(instr, im.size)
        }
    }
}

//---------------------------------------------------------
//  initReverseInstrMap
//---------------------------------------------------------

/**
 Initialize the number t Instrument* map for a Part
 Used to iterate in sequence over instrument numbers for a multi-instrument part
 */

function initReverseInstrMap(im: MusicXmlInstrumentMap): Array<[number, Instrument]> {
    const rim: Array<[number, Instrument]> = []
    for (const [instr, instNr] of im) {
        rim.push([instNr, instr])
    }
    rim.sort((a, b) => a[0] - b[0])
    return rim
}

//---------------------------------------------------------
//  hasPageBreak
//---------------------------------------------------------

function lastMeasureBase(system: System | null): MeasureBase | null {
    let mb: MeasureBase | null = null
    if (system) {
        const measures = system.measures()
        if (!measures.length) {
            return null
        }
        mb = measures[measures.length - 1]
    }
    return mb
}

//---------------------------------------------------------
//  hasPageBreak
//---------------------------------------------------------

function hasPageBreak(system: System | null): boolean {
    let mb: MeasureBase | null = null
    if (system) {
        const measures = system.measures()
        if (!measures.length) {
            return false
        }
        mb = measures[measures.length - 1]
    }

    return !!mb && mb.pageBreak()
}

//---------------------------------------------------------
//  findPitchesUsed
//---------------------------------------------------------

/**
 Find the set of pitches actually used in a part.
 */

function addChordPitchesToSet(c: Chord, set: Set<number>): void {
    for (const note of c.notes()) {
        set.add(note.pitch())
    }
}

function findPitchesUsed(part: Part, set: Set<number>): void {
    const strack = part.startTrack()
    const etrack = part.endTrack()

    // loop over all chords in the part
    for (let mb = part.score()!.measures().first(); mb; mb = mb.next()) {
        if (!mb.isMeasure()) {
            continue
        }
        const m = mb as Measure
        for (let st = strack; st < etrack; ++st) {
            for (let seg = m.first(); seg; seg = seg.next()) {
                const el = seg.element(st)
                if (!el) {
                    continue
                }
                if (el.isChord()) {
                    // add grace and non-grace note pitches to the result set
                    const c = el as Chord
                    if (c) {
                        for (const g of c.graceNotesBefore()) {
                            addChordPitchesToSet(g, set)
                        }
                        addChordPitchesToSet(c, set)
                        for (const g of c.graceNotesAfter()) {
                            addChordPitchesToSet(g, set)
                        }
                    }
                }
            }
        }
    }
}

//---------------------------------------------------------
//  partList
//---------------------------------------------------------

/**
 Write the part list to \a xml.
 */

function partList(xml: XmlWriter, score: Score, instrMap: MusicXmlInstrumentMap): void {
    const parts = score.parts()
    const longInstrumentColor = score.style().styleV(Sid.longInstrumentColor) as Color
    const shortInstrumentColor = score.style().styleV(Sid.shortInstrumentColor) as Color
    let hiddenInstrName = score.style().styleB(Sid.hideInstrumentNameIfOneInstrument) && parts.length === 1

    xml.startElement('part-list')
    let staffCount = 0 // count sum of # staves in parts
    const groupTime = (score.style().styleV(Sid.timeSigPlacement) as TimeSigPlacement) === TimeSigPlacement.ACROSS_STAVES
    const partGroupEnd = new Array<number>(MAX_PART_GROUPS).fill(-1) // staff where part group ends (bracketSpan is in staves, not parts)
    for (let idx = 0; idx < parts.length; ++idx) {
        const part = parts[idx]
        let bracketFound = false
        // handle brackets
        for (let i = 0; i < part.nstaves(); i++) {
            const st = part.staff(i)
            if (st) {
                for (let j = 0; j < st.bracketLevels() + 1; j++) {
                    if (st.bracketType(j) !== BracketType.NO_BRACKET) {
                        bracketFound = true
                        if (i === 0) {
                            // OK, found bracket in first staff of part
                            // filter out implicit brackets
                            if (!(st.bracketSpan(j) === part.nstaves()
                                  && st.bracketType(j) === BracketType.BRACE)) {
                                // filter out brackets starting in the last part
                                // as they cannot span multiple parts
                                if (idx < parts.length - 1) {
                                    // add others
                                    const number = findPartGroupNumber(partGroupEnd)
                                    if (number < MAX_PART_GROUPS) {
                                        const bi = st.brackets()[j]
                                        partGroupStart(xml, number + 1, bi, st.barLineSpan(), groupTime)
                                        partGroupEnd[number] = staffCount + st.bracketSpan(j)
                                    }
                                }
                            }
                        } else {
                            // bracket in other staff not supported in MusicXML
                        }
                    }
                }
            }
        }
        // handle bracket none
        if (!bracketFound && part.nstaves() > 1) {
            const number = findPartGroupNumber(partGroupEnd)
            if (number < MAX_PART_GROUPS) {
                const bi = new BracketItem(scoreDummy(score))
                partGroupStart(xml, number + 1, bi, false, groupTime)
                partGroupEnd[number] = idx + part.nstaves()
            }
        }

        xml.startElementRaw(`score-part id="P${idx + 1}"`)
        initInstrMap(instrMap, part.instruments().values())
        const acc = /[♭♯]/
        const longInstrumentAttributes: Array<[string, string | number]> = []
        const shortInstrumentAttributes: Array<[string, string | number]> = []
        // by default export the parts long name as part-name
        let partName = part.longName()
        // use the track name if no part long name
        if (!partName) {
            partName = part.partName()
            if (partName) {
                hiddenInstrName = true
            }
        }
        if (hiddenInstrName) {
            longInstrumentAttributes.push(['print-object', 'no'])
            shortInstrumentAttributes.push(['print-object', 'no'])
        }
        if (!longInstrumentColor.equals(defaultColor())) {
            longInstrumentAttributes.push(['color', colorToString(longInstrumentColor)])
        }
        xml.tag('part-name', longInstrumentAttributes,
            MScoreTextToMusicXml.toPlainText(partName).replaceAll('♭', 'b').replaceAll('♯', '#'))
        if (acc.test(partName)) {
            xml.startElement('part-name-display', longInstrumentAttributes)
            writeDisplayName(xml, partName)
            xml.endElement()
        }
        if (part.shortName()) {
            if (!shortInstrumentColor.equals(defaultColor())) {
                shortInstrumentAttributes.push(['color', colorToString(shortInstrumentColor)])
            }
            xml.tag('part-abbreviation', shortInstrumentAttributes,
                MScoreTextToMusicXml.toPlainText(part.shortName()).replaceAll('♭', 'b').replaceAll('♯', '#'))
            if (acc.test(part.shortName())) {
                xml.startElement('part-abbreviation-display', shortInstrumentAttributes)
                writeDisplayName(xml, part.shortName())
                xml.endElement()
            }
        }

        if (part.instrument().useDrumset()) {
            const drumset = part.instrument().drumset()!
            const pitches = new Set<number>()
            findPitchesUsed(part, pitches)
            for (let i = 0; i < 128; ++i) {
                const di = drumset.drum(i)
                if (di.notehead !== NoteHeadGroup.HEAD_INVALID) {
                    scoreInstrument(xml, idx + 1, i + 1, di.name)
                } else if (pitches.has(i)) {
                    scoreInstrument(xml, idx + 1, i + 1, `Instrument ${i + 1}`)
                }
            }
            const midiPort = part.midiPort() + 1
            if (midiPort >= 1 && midiPort <= 16) {
                xml.tag('midi-device', [['port', midiPort]], '')
            }

            for (let i = 0; i < 128; ++i) {
                const di = drumset.drum(i)
                if (di.notehead !== NoteHeadGroup.HEAD_INVALID || pitches.has(i)) {
                    midiInstrument(xml, idx + 1, i + 1, part.instrument(), score, i + 1)
                }
            }
        } else {
            const rim = initReverseInstrMap(instrMap)

            for (const [instrNr, instr] of rim) {
                scoreInstrument(xml, idx + 1, instrNr + 1,
                    MScoreTextToMusicXml.toPlainText(instr.trackName()),
                    instr)
            }

            for (const [instNr, instr] of rim) {
                let midiPort = part.midiPort() + 1
                if (instr.channels().length > 0) {
                    midiPort = score.masterScore().midiMapping()[instr.channel(0)!.channel()].port() + 1
                }
                if (midiPort >= 1 && midiPort <= 16) {
                    xml.tagRaw(`midi-device ${instrId(idx + 1, instNr + 1)} port="${midiPort}"`, '')
                } else {
                    xml.tagRaw(`midi-device ${instrId(idx + 1, instNr + 1)}`, '')
                }
                midiInstrument(xml, idx + 1, instNr + 1, instr, score)
            }
        }

        xml.endElement()
        staffCount += part.nstaves()
        for (let i = MAX_PART_GROUPS - 1; i >= 0; i--) {
            const end = partGroupEnd[i]
            if (end >= 0) {
                if (staffCount >= end) {
                    xml.tag('part-group', [['type', 'stop'], ['number', i + 1]])
                    partGroupEnd[i] = -1
                }
            }
        }
    }
    xml.endElement()
}

//---------------------------------------------------------
//  tickIsInMiddleOfMeasure
//---------------------------------------------------------

function tickIsInMiddleOfMeasure(ti: Fraction, m: Measure): boolean {
    return !ti.eq(m.tick()) && !ti.eq(m.endTick())
}

//---------------------------------------------------------
//  clampMusicXmlOctave
//---------------------------------------------------------

/**
 Clamps octave to min and max value as per MusicXML Schema
 */

function clampMusicXmlOctave(octave: number): number {
    return Math.min(Math.max(octave, 0), 9)
}

//---------------------------------------------------------
//  writeStaffDetails
//---------------------------------------------------------

/**
 Write the staff details for \a part to \a xml.
 */

function writeStaffDetails(xml: XmlWriter, part: Part, hiddenStaves: readonly number[]): void {
    const instrument = part.instrument()
    const staves = part.nstaves()
    const zero = new Fraction(0, 1)

    // staff details
    for (let i = 0; i < staves; i++) {
        const st = part.staff(i)!
        const mag = st.staffMag(zero)
        let hidden = false
        if (!st.show()) {
            hidden = true
        } else {
            for (const staffIdx of hiddenStaves) {
                if (i === staffIdx) {
                    hidden = true
                }
            }
        }
        const lineColor = st.staffType(zero)!.color() // C++ Staff::color(tick)
        const invis = st.isLinesInvisible(zero)
        const needsLineDetails = invis || !lineColor.equals(defaultColor())
        if (st.lines(zero) !== 5 || st.isTabStaff(zero) || !RealIsEqual(mag, 1.0)
            || hidden || needsLineDetails) {
            const attributes: Array<[string, string | number]> = []
            if (staves > 1) {
                attributes.push(['number', i + 1])
            }
            if (st.isTabStaff(zero) && !st.staffType(zero)!.useNumbers()) {
                attributes.push(['show-frets', 'letters'])
            }
            if (hidden) {
                attributes.push(['print-object', 'no'])
                if (st.cutaway()) {
                    attributes.push(['print-spacing', 'yes'])
                }
            }

            xml.startElement('staff-details', attributes)

            if (i > 0 && st.links() && st.links()!.includes(part.staff(i - 1)!)) {
                xml.tag('staff-type', 'alternate')
            }

            xml.tag('staff-lines', st.lines(zero))
            if (needsLineDetails) {
                for (let lineIdx = 0; lineIdx < st.lines(zero); ++lineIdx) {
                    let ld = `line-detail line="${lineIdx + 1}"`
                    if (!lineColor.equals(defaultColor())) {
                        ld += ` color="${colorToString(lineColor)}"`
                    }
                    if (invis) {
                        ld += ' print-object="no"'
                    }
                    xml.tagRaw(ld)
                }
            }

            if (st.isTabStaff(zero) && instrument.stringData()) {
                const l = instrument.stringData().stringList()
                for (let ii = 0; ii < l.length; ii++) {
                    const { c: step, alter, octave } = midipitch2xml(l[ii].pitch)
                    xml.startElement('staff-tuning', [['line', ii + 1]])
                    xml.tag('tuning-step', step)
                    if (alter) {
                        xml.tag('tuning-alter', alter)
                    }
                    xml.tag('tuning-octave', clampMusicXmlOctave(octave))
                    xml.endElement()
                }
            }

            const lineDistance = st.lineDistance(zero)
            const needWriteLineDistance = !RealIsEqual(lineDistance, 1.0)
            const needWriteMag = !RealIsEqual(mag, 1.0)
            if (needWriteLineDistance || needWriteMag) {
                const scaleAttributes: Array<[string, string | number]> = []
                if (needWriteMag) {
                    scaleAttributes.push(['scaling', mag * 100])
                }
                xml.elementAttrsBody('staff-size', scaleAttributes, mag * lineDistance * 100)
            }

            xml.endElement()
        }
    }
}

//---------------------------------------------------------
//  annotationsWithoutNote
//---------------------------------------------------------

/**
 Write the annotations that could not be attached to notes.
 */

function annotationsWithoutNote(exp: ExportMusicXml, strack: track_idx_t, staves: number, measure: Measure): void {
    for (let segment = measure.first(); segment; segment = segment.next()) {
        if (segment.segmentType() === SegmentType.ChordRest) {
            for (const element of segment.annotations()) {
                if (!element.isFiguredBass() && !element.isHarmony()) { // handled elsewhere
                    if (!ExportMusicXml.canWrite(element)) {
                        continue
                    }
                    const wtrack = findTrackForAnnotations(element.track(), segment) // track to write annotation
                    if (strack <= element.track() && element.track() < (strack + VOICES * staves) && wtrack === nidx) {
                        commonAnnotations(exp, element, staves > 1 ? 1 : 0)
                    }
                }
            }
        }
    }
}

//---------------------------------------------------------
//  findLastSystemWithMeasures
//---------------------------------------------------------

function findLastSystemWithMeasures(page: Page): System | null {
    for (let i = page.systems().length - 1; i >= 0; --i) {
        const s = page.systems()[i]
        const m = s.firstMeasure()
        if (m) {
            return s
        }
    }
    return null
}

//---------------------------------------------------------
//  isFirstMeasureInSystem
//---------------------------------------------------------

function isFirstMeasureInSystem(measure: Measure): boolean {
    const system = measure.coveringMMRestOrThis().system()!
    const firstMeasureInSystem = system.firstMeasure()!
    const realFirstMeasureInSystem = firstMeasureInSystem.isMMRest() ? firstMeasureInSystem.mmRestFirst() : firstMeasureInSystem
    return measure === realFirstMeasureInSystem
}

//---------------------------------------------------------
//  isFirstMeasureInLastSystem
//---------------------------------------------------------

function isFirstMeasureInLastSystem(measure: Measure): boolean {
    const system = measure.coveringMMRestOrThis().system()!
    const page = system.page()!

    /*
     Notes on multi-measure rest handling:
     Function mmRest1() returns either the measure itself (if not part of multi-measure rest)
     or the replacing multi-measure rest measure.
     Using this is required as a measure that is covered by a multi-measure rest has no system.
     Furthermore, the first measure in a system starting with a multi-measure rest is the a multi-
     measure rest itself instead of the first covered measure.
     */

    const lastSystem = findLastSystemWithMeasures(page)
    if (!lastSystem) {
        return false // degenerate case: no system with measures found
    }
    const firstMeasureInLastSystem = lastSystem.firstMeasure()!
    const realFirstMeasureInLastSystem
        = firstMeasureInLastSystem.isMMRest() ? firstMeasureInLastSystem.mmRestFirst() : firstMeasureInLastSystem
    return measure === realFirstMeasureInLastSystem
}

//---------------------------------------------------------
//  systemHasMeasures
//---------------------------------------------------------

function systemHasMeasures(system: System): boolean {
    return !!system.firstMeasure()
}

//---------------------------------------------------------
//  findTextFramesToWriteAsWordsAbove
//---------------------------------------------------------

function findTextFramesToWriteAsWordsAbove(measure: Measure): TBox[] {
    const system = measure.coveringMMRestOrThis().system()!
    const page = system.page()!
    const systemIndex = page.systems().indexOf(system)
    const tboxes: TBox[] = []
    if (isFirstMeasureInSystem(measure)) {
        for (let idx = systemIndex - 1; idx >= 0 && !systemHasMeasures(page.system(idx)); --idx) {
            const sys = page.system(idx)
            for (const mb of sys.measures()) {
                if (mb.isTBox()) {
                    const tbox = mb as unknown as TBox
                    tboxes.unshift(tbox)
                }
            }
        }
    }
    return tboxes
}

//---------------------------------------------------------
//  findTextFramesToWriteAsWordsBelow
//---------------------------------------------------------

function findTextFramesToWriteAsWordsBelow(measure: Measure): TBox[] {
    const system = measure.coveringMMRestOrThis().system()!
    const page = system.page()!
    const systemIndex = page.systems().indexOf(system)
    const tboxes: TBox[] = []
    if (isFirstMeasureInLastSystem(measure)) {
        for (let idx = systemIndex + 1; idx < page.systems().length /* && !systemHasMeasures(page->system(idx))*/;
            ++idx) {
            const sys = page.system(idx)
            for (const mb of sys.measures()) {
                if (mb.isTBox()) {
                    const tbox = mb as unknown as TBox
                    tboxes.unshift(tbox)
                }
            }
        }
    }
    return tboxes
}

//---------------------------------------------------------
//  findJumpElements
//---------------------------------------------------------

function findJumpElements(score: Score): Jump[] {
    const jumps: Jump[] = []

    for (let m = score.first(); m; m = m.next()) {
        for (const e of m.el()) {
            if (e.isJump()) {
                jumps.push(e as unknown as Jump)
            }
        }
    }

    return jumps
}

//---------------------------------------------------------
//   writeMusicXml (FretDiagram)
//---------------------------------------------------------

function writeMusicXmlFretDiagram(item: FretDiagram, xml: XmlWriter): void {
    const frameAttrs: Array<[string, string | number]> = []
    addColorAttr(item, frameAttrs)
    xml.startElement('frame', frameAttrs)
    xml.tag('frame-strings', item.strings())
    xml.tag('frame-frets', item.frets())
    if (item.fretOffset() > 0) {
        xml.tag('first-fret', item.fretOffset() + 1)
    }

    for (let i = 0; i < item.strings(); ++i) {
        const mxmlString = item.strings() - i

        let bStarts: number[] = []
        let bEnds: number[] = []
        for (const [fret, b] of item.barres()) {
            if (!b.exists()) {
                continue
            }

            if (b.startString === i) {
                bStarts.push(fret)
            } else if (b.endString === i || (b.endString === -1 && mxmlString === 1)) {
                bEnds.push(fret)
            }
        }

        if (item.marker(i).exists() && item.marker(i).mtype === FretMarkerType.CIRCLE) {
            xml.startElement('frame-note')
            xml.tag('string', mxmlString)
            xml.tag('fret', '0')
            xml.endElement()
        }
        // Markers may exists alongside with dots
        // Write dots
        for (const d of item.dot(i)) {
            if (!d.exists() || d.dtype === FretDotType.CROSS) {
                continue
            }
            xml.startElement('frame-note')
            xml.tag('string', mxmlString)
            xml.tag('fret', d.fret + item.fretOffset())
            // TODO: write fingerings

            // Also write barre if it starts at this dot
            if (bStarts.includes(d.fret)) {
                xml.tag('barre', [['type', 'start']])
                bStarts = bStarts.filter(f => f !== d.fret)
            }
            if (bEnds.includes(d.fret)) {
                xml.tag('barre', [['type', 'stop']])
                bEnds = bEnds.filter(f => f !== d.fret)
            }
            xml.endElement()
        }

        // Write unwritten barres
        for (const j of bStarts) {
            xml.startElement('frame-note')
            xml.tag('string', mxmlString)
            xml.tag('fret', j + item.fretOffset())
            xml.tag('barre', [['type', 'start']])
            xml.endElement()
        }

        for (const j of bEnds) {
            xml.startElement('frame-note')
            xml.tag('string', mxmlString)
            xml.tag('fret', j + item.fretOffset())
            xml.tag('barre', [['type', 'stop']])
            xml.endElement()
        }
    }

    xml.endElement()
}

//---------------------------------------------------------
//   ExportMusicXml
//---------------------------------------------------------

export class ExportMusicXml {
    private static s_configuration = new MusicXmlConfiguration()

    /** C++ GlobalInject<IMusicXmlConfiguration> configuration */
    static configuration(): MusicXmlConfiguration { return ExportMusicXml.s_configuration }
    static setConfiguration(c: MusicXmlConfiguration): void { ExportMusicXml.s_configuration = c }

    private m_score: Score
    private m_xml = new XmlWriter()
    private m_sh = new SlurHandler()
    private m_gh = new GlissandoHandler()
    private m_tick: Fraction
    private m_attr = new Attributes()
    private m_brackets: Array<TextLineBase | null> = new Array<TextLineBase | null>(MAX_NUMBER_LEVEL).fill(null)
    private m_dashes: Array<TextLineBase | null> = new Array<TextLineBase | null>(MAX_NUMBER_LEVEL).fill(null)
    private m_hairpins: Array<Hairpin | null> = new Array<Hairpin | null>(MAX_NUMBER_LEVEL).fill(null)
    private m_ottavas: Array<Ottava | null> = new Array<Ottava | null>(MAX_NUMBER_LEVEL).fill(null)
    private m_trills: Array<Trill | null> = new Array<Trill | null>(MAX_NUMBER_LEVEL).fill(null)
    private m_jumpElements: Jump[] = []
    private m_measArpeggios = new ArpeggioMap()
    private m_div = 0
    private m_millimeters = 0.0
    private m_tenths = 0
    private m_tboxesAboveWritten = false
    private m_tboxesBelowWritten = false
    private m_hiddenStaves: number[] = []
    private m_trillStart: TrillHash = new Map()
    private m_trillStop: TrillHash = new Map()
    private m_instrMap: MusicXmlInstrumentMap = new Map()
    private m_currPlayTechnique: PlayingTechniqueType = PlayingTechniqueType.Undefined
    private m_isMxl = false

    constructor(s: Score) {
        this.m_score = s
        this.m_tick = new Fraction(0, 1)
        this.m_div = 1
        this.m_tenths = 40
        this.m_millimeters = this.m_score.style().spatium() * this.m_tenths / (10 * DPMM)
    }

    score(): Score { return this.m_score }
    setMxl(v: boolean): void { this.m_isMxl = v }
    tick(): Fraction { return this.m_tick }

    //---------------------------------------------------------
    //   positioningAttributes
    //   According to the specs (common.dtd), all direction-type and note elements must be relative to the measure
    //   while all other elements are relative to their position or the nearest note.
    //---------------------------------------------------------

    static positioningAttributes(el: EngravingItem, isSpanStart = true): string {
        if (!ExportMusicXml.configuration().exportLayout()) {
            return ''
        }

        let def = new PointF()
        let rel = new PointF()
        const spatium = Math.fround(el.spatium())

        const span = el.isSLine() ? el as unknown as SLine : null

        if (span && !span.segmentsEmpty()) {
            if (isSpanStart) {
                const seg = span.frontSegment() as unknown as LineSegment
                const offset = seg.offset()
                const p = seg.pos()
                rel.setX(offset.x())
                def.setY(p.y())
            } else {
                const seg = span.backSegment() as unknown as LineSegment
                const userOff = seg.offset() // This is the offset accessible from the inspector
                const userOff2 = seg.userOff2() // Offset of the actual dragged anchor, which doesn't affect the inspector offset

                // For an SLine, the actual offset equals the sum of userOff and userOff2,
                // as userOff moves the SLine as a whole
                rel.setX(userOff.x() + userOff2.x())

                // Following would probably required for non-horizontal SLines:
                //defaultY = pos.y() + pos2.y();
            }
        } else {
            def = el.ldata().pos() // Note: for some elements, Finale Notepad seems to work slightly better w/o default-x
            rel = el.offset().clone()
        }

        return positionToString(def, rel, spatium)
    }

    //---------------------------------------------------------
    //   calcDivMoveToTick
    //---------------------------------------------------------

    private calcDivMoveToTick(t: Fraction, stretch: Fraction = new Fraction(1, 1)): void {
        const stretchedTick = t.plus(stretch.times(this.tick().minus(t)))
        if (t.lt(this.tick())) {
            addFraction(stretchedTick.minus(t))
        } else if (t.gt(this.tick())) {
            addFraction(t.minus(stretchedTick))
        }
        this.m_tick = t
    }

    //---------------------------------------------------------
    //  calcDivisions
    //---------------------------------------------------------

    // Loop over all voices in all staves and determine a suitable value for divisions.
    // All parts are taken into account, a global divisions value results.

    // Length of time in MusicXML is expressed in "units", which should allow expressing all time values
    // as an integral number of units. Divisions contains the number of units in a quarter note.
    // Compute divisions by finding all fractions used to move through the score in MusicXML
    // and computing the least common multiple of these fractions numerator and of fraction 1/4.

    private calcDivisions(): void {
        // init
        fractions.clear()

        const il = this.m_score.parts()

        for (let idx = 0; idx < il.length; ++idx) {
            const part = il[idx]
            this.m_tick = new Fraction(0, 1)

            const staves = part.nstaves()
            const strack = this.m_score.staffIdxOfPart(part) * VOICES
            const etrack = strack + staves * VOICES

            for (let mb = this.m_score.measures().first(); mb; mb = mb.next()) {
                if (!mb.isMeasure()) {
                    continue
                }
                const m = mb as Measure

                for (let st = strack; st < etrack; ++st) {
                    for (let seg = m.first(); seg; seg = seg.next()) {
                        for (const e of seg.annotations()) {
                            if (e.track() === st && e.isFiguredBass()) {
                                const fb = e as unknown as FiguredBass
                                addFraction(stretch(this.m_score, st, m.tick()).times(fb.ticks()))
                            }
                        }

                        const el = seg.element(st)
                        if (!el) {
                            continue
                        }

                        // must ignore start repeat to prevent spurious backup/forward
                        if (el.isBarLine() && (el as BarLine).barLineType() === BarLineType.START_REPEAT) {
                            continue
                        }

                        if (!this.m_tick.eq(seg.tick())) {
                            this.calcDivMoveToTick(seg.tick(), stretch(this.m_score, st, m.tick()))
                        }

                        if (el.isChordRest()) {
                            let l = (el as ChordRest).actualTicks()
                            if (el.isChord()) {
                                if (isTwoNoteTremolo(el as Chord)) {
                                    l = l.times(new Fraction(1, 2))
                                }
                            }
                            addFraction(stretch(this.m_score, st, m.tick()).times(l))
                            this.m_tick = this.m_tick.plus(l)
                        }
                    }
                }
                // move to end of measure (in case of incomplete last voice)
                this.calcDivMoveToTick(m.endTick(), stretch(this.m_score, etrack - 1, m.tick()))
            }
        }

        // compute divisions
        let divisions = 4 // ensure divisions > 0 for half and whole note
        for (const f of fractions.values()) {
            divisions = lcm(divisions, f.denominator())
        }
        divisions = Math.trunc(divisions / 4)

        this.m_div = divisions
    }

    //---------------------------------------------------------
    //   credits
    //---------------------------------------------------------

    credits(xml: XmlWriter): void {
        // find the vboxes in every page and write their elements as credit-words
        for (const page of this.m_score.pages()) {
            const pageIdx = this.m_score.pageIdx(page)
            for (const system of page.systems()) {
                for (const mb of system.measures()) {
                    if (mb.isVBox()) {
                        for (const element of mb.el()) {
                            if (element.isText()) {
                                const text = element as unknown as Text
                                textAsCreditWords(this, xml, this.m_score.style(), pageIdx + 1, text)
                            }
                        }
                    }
                }
            }
        }

        // put copyright at the bottom center of every page
        // note: as the copyright metatag contains plain text, special XML characters must be escaped
        // determine page formatting
        const rights = this.m_score.metaTag('copyright')
        if (rights) {
            const style = this.m_score.style()
            const bm = this.getTenthsFromInches(style.styleD(Sid.pageOddBottomMargin))
            const w = this.getTenthsFromInches(style.styleD(Sid.pageWidth))
            const f = new TextFragment(XmlWriter.xmlString(rights))
            f.changeFormat(FormatId.FontFamily, style.styleSt(Sid.footerFontFace))
            f.changeFormat(FormatId.FontSize, style.styleD(Sid.footerFontSize))
            const list = [f]
            for (let pageIdx = 0; pageIdx < this.m_score.npages(); ++pageIdx) {
                creditWords(xml, style, pageIdx + 1, w / 2, bm, 'center', 'bottom', list, 'rights')
            }
        }
    }

    //---------------------------------------------------------
    //   barlineLeft -- search for and handle barline left
    //---------------------------------------------------------

    private barlineLeft(m: Measure, track: track_idx_t): void {
        const rs = m.repeatStart()
        const volta = findVolta(m, true, track)
        if (!rs && !volta) {
            return
        }
        this.m_attr.doAttr(this.m_xml, false)
        this.m_xml.startElement('barline', [['location', 'left']])
        if (rs) {
            this.m_xml.tag('bar-style', 'heavy-light')
        }
        if (volta) {
            ending(this.m_xml, volta, true)
        }
        if (rs) {
            const attrs: Array<[string, string | number]> = [['direction', 'forward']]
            if (this.m_score.style().styleB(Sid.repeatBarTips)) {
                attrs.push(['winged', 'curved'])
            }
            this.m_xml.tag('repeat', attrs)
        }
        this.m_xml.endElement()
    }

    //---------------------------------------------------------
    //   barlineMiddle -- handle barline middle
    //---------------------------------------------------------

    private barlineMiddle(bl: BarLine): void {
        const vis = bl.visible()
        const shortStyle = shortBarlineStyle(bl)
        const normalStyle = normalBarlineStyle(bl)
        let barStyle = ''
        if (!vis) {
            barStyle = 'none'
        } else if (shortStyle) {
            barStyle = shortStyle
        } else {
            barStyle = normalStyle
        }

        if (barStyle) {
            this.m_xml.startElement('barline', [['location', 'middle']])
            this.m_xml.tag('bar-style', barStyle)
            this.m_xml.endElement()
        }
    }

    //---------------------------------------------------------
    //   fermataPosition -  return fermata y position as MusicXML string
    //---------------------------------------------------------

    static fermataPosition(fermata: Fermata): string {
        let res = ''

        if (ExportMusicXml.configuration().exportLayout()) {
            const SPATIUM2TENTHS = 10
            const EPSILON = 0.01
            const spatium = fermata.spatium()
            const defY = -1 * SPATIUM2TENTHS * fermata.ldata().pos().y() / spatium
            const relY = -1 * SPATIUM2TENTHS * fermata.offset().y() / spatium

            if (Math.abs(defY) >= EPSILON) {
                res += ` default-y="${numStr(defY, 2)}"`
            }
            if (Math.abs(relY) >= EPSILON) {
                res += ` relative-y="${numStr(relY, 2)}"`
            }
        }

        return res
    }

    //---------------------------------------------------------
    //   barlineRight -- search for and handle barline right
    //---------------------------------------------------------

    private barlineRight(m: Measure, strack: track_idx_t, etrack: track_idx_t): void {
        const mmR1 = m.coveringMMRestOrThis() // the multi measure rest this measure is covered by
        const mmRLst = mmR1.isMMRest() ? mmR1.mmRestLast() : null // last measure of replaced sequence of empty measures
        // note: use barlinetype as found in multi measure rest for last measure of replaced sequence
        const bst = m === mmRLst ? mmR1.endBarLineType() : m.endBarLineType()
        const visible = m.endBarLineVisible()
        let color = ''

        const needBarStyle = (bst !== BarLineType.NORMAL && bst !== BarLineType.START_REPEAT) || !visible
        const volta = findVolta(m, false, strack)
        // detect short and tick barlines
        let special = ''
        const bl = m.endBarLine()
        if (bl) {
            color = color2xml(bl)
            if (bst === BarLineType.NORMAL && !bl.spanStaff()) {
                if (bl.spanFrom() === BARLINE_SPAN_TICK1_FROM && bl.spanTo() === BARLINE_SPAN_TICK1_TO) {
                    special = 'tick'
                }
                if (bl.spanFrom() === BARLINE_SPAN_TICK2_FROM && bl.spanTo() === BARLINE_SPAN_TICK2_TO) {
                    special = 'tick'
                }
                if (bl.spanFrom() === BARLINE_SPAN_SHORT1_FROM && bl.spanTo() === BARLINE_SPAN_SHORT1_TO) {
                    special = 'short'
                }
                if (bl.spanFrom() === BARLINE_SPAN_SHORT2_FROM && bl.spanTo() === BARLINE_SPAN_SHORT2_FROM) {
                    special = 'short'
                }
            }
        }

        // check fermata
        // no need to take mmrest into account, MS does not create mmrests for measure with fermatas
        const hasFermata = barlineHasFermata(m.endBarLine(), strack, etrack)

        if (!needBarStyle && !volta && !special && !hasFermata && !color) {
            return
        }

        this.m_xml.startElement('barline', [['location', 'right']])
        let tagName = 'bar-style'
        tagName += color
        if (needBarStyle) {
            if (!visible) {
                this.m_xml.tagRaw(tagName, 'none')
            } else {
                switch (bst) {
                case BarLineType.DOUBLE:
                    this.m_xml.tagRaw(tagName, 'light-light')
                    break
                case BarLineType.REVERSE_END:
                    this.m_xml.tagRaw(tagName, 'heavy-light')
                    break
                case BarLineType.BROKEN:
                    this.m_xml.tagRaw(tagName, 'dashed')
                    break
                case BarLineType.DOTTED:
                    this.m_xml.tagRaw(tagName, 'dotted')
                    break
                case BarLineType.END:
                case BarLineType.END_REPEAT:
                case BarLineType.END_START_REPEAT:
                    this.m_xml.tagRaw(tagName, 'light-heavy')
                    break
                case BarLineType.HEAVY:
                    this.m_xml.tagRaw(tagName, 'heavy')
                    break
                case BarLineType.DOUBLE_HEAVY:
                    this.m_xml.tagRaw(tagName, 'heavy-heavy')
                    break
                default:
                    break
                }
            }
        } else if (special) {
            this.m_xml.tagRaw(tagName, special)
        } else if (color) {
            this.m_xml.tagRaw(tagName, 'regular')
        }

        writeBarlineFermata(m.endBarLine(), this.m_xml, strack, etrack)

        if (volta) {
            ending(this.m_xml, volta, false)
        }

        if (bst === BarLineType.END_REPEAT || bst === BarLineType.END_START_REPEAT) {
            const attrs: Array<[string, string | number]> = [['direction', 'backward']]
            if (m.repeatCount() > 2) {
                attrs.push(['times', m.repeatCount()])
            }
            if (this.m_score.style().styleB(Sid.repeatBarTips)) {
                attrs.push(['winged', 'curved'])
            }
            this.m_xml.tag('repeat', attrs)
        }

        this.m_xml.endElement()
    }

    //---------------------------------------------------------
    //   moveToTick
    //---------------------------------------------------------

    moveToTick(t: Fraction, stretch: Fraction = new Fraction(1, 1)): void {
        const stretchedTick = t.plus(stretch.times(this.tick().minus(t)))
        if (t.lt(this.m_tick)) {
            this.m_attr.doAttr(this.m_xml, false)
            this.m_xml.startElement('backup')
            this.m_xml.tag('duration', calculateTimeDeltaInDivisions(stretchedTick, t, this.m_div))
            this.m_xml.endElement()
        } else if (t.gt(this.m_tick)) {
            this.m_attr.doAttr(this.m_xml, false)
            this.m_xml.startElement('forward')
            this.m_xml.tag('duration', calculateTimeDeltaInDivisions(t, stretchedTick, this.m_div))
            this.m_xml.endElement()
        }
        this.m_tick = t
    }

    moveToTickIfNeed(t: Fraction, track: track_idx_t, measureTick: Fraction): void {
        if (!this.m_tick.eq(t)) {
            this.m_attr.doAttr(this.m_xml, false)
            this.moveToTick(t, stretch(this.m_score, track, measureTick))
        }
    }

    //---------------------------------------------------------
    //   timesig
    //---------------------------------------------------------

    private timesig(tsig: TimeSig, staff: staff_idx_t): void {
        const st = tsig.timeSigType()
        const ts = tsig.sig()
        const z = ts.numerator()
        const n = ts.denominator()
        const ns = tsig.numeratorString()
        const ds = tsig.denominatorString()

        this.m_attr.doAttr(this.m_xml, true)
        let attrs: Array<[string, string | number]> = []
        if (st === TimeSigType.FOUR_FOUR) {
            attrs = [['symbol', 'common']]
        } else if (st === TimeSigType.ALLA_BREVE) {
            attrs = [['symbol', 'cut']]
        } else if (ns && !ds) {
            attrs = [['symbol', 'single-number']]
        }
        if (staff) {
            attrs.push(['number', staff])
        }

        if (!tsig.visible() || !tsig.showOnThisStaff()
            || (tsig.staff() && !tsig.staff()!.staffType(tsig.tick())!.genTimesig())) {
            attrs.push(['print-object', 'no'])
        }

        addColorAttr(tsig, attrs)

        this.m_xml.startElement('time', attrs)

        if (ns) {
            this.m_xml.tag('beats', ns)
        } else {
            this.m_xml.tag('beats', z)
        }
        if (ds) {
            this.m_xml.tag('beat-type', ds)
        } else {
            this.m_xml.tag('beat-type', n)
        }
        this.m_xml.endElement()
    }

    //---------------------------------------------------------
    //   keysig
    //---------------------------------------------------------

    private keysig(ks: KeySig, ct: ClefType, staff: staff_idx_t = 0): void {
        const table2 = 'CDEFGAB'
        const po = ClefInfo.pitchOffset(ct) // actually 7 * oct + step for topmost staff line

        const attrs: Array<[string, string | number]> = []
        if (staff) {
            attrs.push(['number', staff])
        }
        if (!ks.visible() || (ks.staff() && ks.staff()!.isTabStaff(new Fraction(0, 1)))) {
            attrs.push(['print-object', 'no'])
        }
        addColorAttr(ks, attrs)

        this.m_attr.doAttr(this.m_xml, true)
        this.m_xml.startElement('key', attrs)

        //! NOTE It looks like there is some kind of problem here,
        //! layout data should not be used to write to a file or export
        const ldata = ks.ldata()
        const keysyms = ldata.keySymbols
        if (ks.isCustom() && !ks.isAtonal() && keysyms.length > 0) {
            // non-traditional key signature
            // MusicXML order is left-to-right order, while KeySims in keySymbols()
            // are in insertion order -> sorting required

            // first put the KeySyms in a map (std::map<double, KeySym>: the first one per position)
            const map = new Map<number, typeof keysyms[number]>()
            for (const ksym of keysyms) {
                if (!map.has(ksym.xPos)) {
                    map.set(ksym.xPos, ksym)
                }
            }
            // then write them (automatically sorted on key)
            for (const xPos of [...map.keys()].sort((a, b) => a - b)) {
                const ksym = map.get(xPos)!
                const step = (po - ksym.line) % 7
                this.m_xml.tag('key-step', table2[step])
                this.m_xml.tag('key-alter', accSymId2alter(ksym.sym))
                let accidentalAttrs: Array<[string, string | number]> = []
                const s = accSymId2MusicXmlString(ksym.sym)
                if (s === 'other') {
                    accidentalAttrs = [['smufl', accSymId2SmuflMusicXmlString(ksym.sym)]]
                }
                this.m_xml.tag('key-accidental', accidentalAttrs, s)
            }
        } else {
            // traditional key signature
            this.m_xml.tag('fifths', ks.key())
            switch (ks.mode()) {
            case KeyMode.NONE: this.m_xml.tag('mode', 'none')
                break
            case KeyMode.MAJOR: this.m_xml.tag('mode', 'major')
                break
            case KeyMode.MINOR: this.m_xml.tag('mode', 'minor')
                break
            case KeyMode.DORIAN: this.m_xml.tag('mode', 'dorian')
                break
            case KeyMode.PHRYGIAN: this.m_xml.tag('mode', 'phrygian')
                break
            case KeyMode.LYDIAN: this.m_xml.tag('mode', 'lydian')
                break
            case KeyMode.MIXOLYDIAN: this.m_xml.tag('mode', 'mixolydian')
                break
            case KeyMode.AEOLIAN: this.m_xml.tag('mode', 'aeolian')
                break
            case KeyMode.IONIAN: this.m_xml.tag('mode', 'ionian')
                break
            case KeyMode.LOCRIAN: this.m_xml.tag('mode', 'locrian')
                break
            case KeyMode.UNKNOWN: // fall thru
            default:
                if (ks.isCustom()) {
                    this.m_xml.tag('mode', 'none')
                }
            }
        }
        this.m_xml.endElement()
    }

    //---------------------------------------------------------
    //   clef
    //---------------------------------------------------------

    private clef(staff: staff_idx_t, ct: ClefType, extraAttributes = ''): void {
        let tagName = 'clef'
        if (staff) {
            tagName += ` number="${staff}"`
        }
        tagName += extraAttributes
        this.m_attr.doAttr(this.m_xml, true)
        this.m_xml.startElementRaw(tagName)

        const info = findClefInfoByType(ct)

        const line = ClefInfo.line(ct)
        this.m_xml.tag('sign', info.sign)
        if ((info.sign !== 'percussion') && (info.sign !== 'TAB')) {
            this.m_xml.tag('line', line)
        }
        if (info.octChng) {
            this.m_xml.tag('clef-octave-change', info.octChng)
        }
        this.m_xml.endElement()
    }

    //---------------------------------------------------------
    //   findTrill -- get index of trill in trill table
    //   return -1 if not found
    //---------------------------------------------------------

    private findTrill(tr: Trill | null): number {
        for (let i = 0; i < MAX_NUMBER_LEVEL; ++i) {
            if (this.m_trills[i] === tr) {
                return i
            }
        }
        return -1
    }

    //---------------------------------------------------------
    //   wavyLineStartStop
    //---------------------------------------------------------

    private wavyLineStartStop(cr: ChordRest, notations: Notations, trillStart: TrillHash, trillStop: TrillHash): void {
        if (trillStart.has(cr) && trillStop.has(cr)) {
            const tr = trillStart.get(cr)!
            const n = this.findTrill(null)
            if (n >= 0) {
                wavyLineStart(tr, n, notations, this.m_xml)
                wavyLineStop(tr, n, notations, this.m_xml)
            }
        } else {
            if (trillStop.has(cr)) {
                const tr = trillStop.get(cr)!
                let n = this.findTrill(tr)
                if (n >= 0) {
                    // trill stop after trill start
                    this.m_trills[n] = null
                } else {
                    // trill stop before trill start
                    n = this.findTrill(null)
                    if (n >= 0) {
                        this.m_trills[n] = tr
                    }
                }
                if (n >= 0) {
                    wavyLineStop(tr, n, notations, this.m_xml)
                }
                trillStop.delete(cr)
            }
            if (trillStart.has(cr)) {
                const tr = trillStart.get(cr)!
                let n = this.findTrill(tr)
                if (n >= 0) {
                    // wavyLineStartStop error
                } else {
                    n = this.findTrill(null)
                    if (n >= 0) {
                        this.m_trills[n] = tr
                        wavyLineStart(tr, n, notations, this.m_xml)
                    }
                    trillStart.delete(cr)
                }
            }
        }
    }

    //---------------------------------------------------------
    //   chordAttributes
    //---------------------------------------------------------

    private chordAttributes(chord: Chord, notations: Notations, trillStart: TrillHash, trillStop: TrillHash): void {
        if (!chord.isGrace()) {
            const fl: EngravingItem[] = []
            for (const e of chord.segment()!.annotations()) {
                if (e.track() === chord.track() && e.isFermata()) {
                    fl.push(e)
                }
            }
            fermatas(fl, this.m_xml, notations)
        }

        const na = chord.articulations()
        // first the attributes whose elements are children of <articulations>
        for (const a of na) {
            const sid = a.symId()
            const mxmlArtics = symIdToArtic(sid)

            for (let mxmlArtic of mxmlArtics) {
                if (mxmlArtic === 'strong-accent') {
                    if (a.up()) {
                        mxmlArtic += ' type="up"'
                    } else {
                        mxmlArtic += ' type="down"'
                    }
                } else if (a.anchor() !== ArticulationAnchor.AUTO) {
                    if (a.anchor() === ArticulationAnchor.TOP) {
                        mxmlArtic += ' placement="above"'
                    } else {
                        mxmlArtic += ' placement="below"'
                    }
                }
                mxmlArtic += color2xml(a)
                mxmlArtic += ExportMusicXml.positioningAttributes(a)

                notations.tag(this.m_xml, a, 'articulations')
                this.m_xml.tagRaw(mxmlArtic)
            }
        }

        writeBreathMark(chord.hasBreathMark(), this.m_xml, notations)
        writeChordLines(chord, this.m_xml, notations)

        notations.closeContainer(this.m_xml) // end articulations tag

        // then the attributes whose elements are children of <ornaments>
        for (const art of na) {
            if (!art.isOrnament()) {
                continue
            }
            const ornam = art as unknown as Ornament
            const sid = ornam.symId()
            let mxmlOrnam = symIdToOrnam(sid)

            let placement = ''
            if (!ornam.isStyled(Pid.ARTICULATION_ANCHOR) && ornam.anchor() !== ArticulationAnchor.AUTO) {
                placement = (ornam.anchor() === ArticulationAnchor.BOTTOM ? 'below' : 'above')
            }
            if (placement) {
                mxmlOrnam += ` placement="${placement}"`
            }
            mxmlOrnam += color2xml(ornam)

            notations.tag(this.m_xml, ornam, 'ornaments')
            this.m_xml.tagRaw(mxmlOrnam)
            for (const accidental of ornam.accidentalsAboveAndBelow()) {
                writeAccidental(this.m_xml, 'accidental-mark', accidental)
            }
        }
        tremoloSingleStartStop(chord, notations, this.m_xml)
        this.wavyLineStartStop(chord, notations, trillStart, trillStop)
        notations.closeContainer(this.m_xml) // end ornaments tag

        // and finally the attributes whose elements are children of <technical>
        for (const a of na) {
            const sid = a.symId()
            let placement = ''

            if (!a.isStyled(Pid.ARTICULATION_ANCHOR) && a.anchor() !== ArticulationAnchor.AUTO) {
                placement = (a.anchor() === ArticulationAnchor.BOTTOM) ? 'below' : 'above'
            } else if (!a.isStyled(Pid.DIRECTION) && a.direction() !== DirectionV.AUTO) {
                // direction = (a.direction() === DirectionV.DOWN) ? 'down' : 'up' (not used)
            }

            let mxmlTechn = symIdToTechn(sid)
            if (mxmlTechn) {
                notations.tag(this.m_xml, a, 'technical')
                mxmlTechn += color2xml(a)
                mxmlTechn += ExportMusicXml.positioningAttributes(a)
                if (placement) {
                    mxmlTechn += ` placement="${placement}"`
                }
                if (sid === SymId.stringsHarmonic) {
                    this.m_xml.startElementRaw(mxmlTechn)
                    this.m_xml.tag('natural')
                    this.m_xml.endElement()
                } else if (sid === SymId.handbellsMalletBellSuspended) {
                    // special case for mallet bell suspended
                    this.m_xml.tagRaw(mxmlTechn)
                } else if (SymNames.nameForSymId(sid).startsWith('handbells')) {
                    let handbell = 'handbell'
                    handbell += color2xml(a)
                    handbell += ExportMusicXml.positioningAttributes(a)
                    if (placement) {
                        handbell += ` placement="${placement}"`
                    }
                    this.m_xml.tagRaw(handbell, symIdToTechn(sid))
                } else if (mxmlTechn.startsWith('harmon')) {
                    this.m_xml.startElementRaw(mxmlTechn)
                    let location: Array<[string, string | number]> = []
                    let harmonClosedValue = ''
                    switch (sid) {
                    case SymId.brassHarmonMuteClosed:
                        harmonClosedValue = 'yes'
                        break
                    case SymId.brassHarmonMuteStemOpen:
                        harmonClosedValue = 'no'
                        break
                    default:
                        harmonClosedValue = 'half'
                        location = [['location', (sid === SymId.brassHarmonMuteStemHalfLeft) ? 'left' : 'right']]
                        break
                    }
                    this.m_xml.tag('harmon-closed', location, harmonClosedValue)
                    this.m_xml.endElement()
                } else if (mxmlTechn.startsWith('hole')) {
                    this.m_xml.startElementRaw(mxmlTechn)
                    let location: Array<[string, string | number]> = []
                    let holeClosedValue = ''
                    switch (sid) {
                    case SymId.windClosedHole:
                        holeClosedValue = 'yes'
                        break
                    case SymId.windOpenHole:
                        holeClosedValue = 'no'
                        break
                    default:
                        holeClosedValue = 'half'
                        location = [['location', (sid === SymId.windHalfClosedHole1) ? 'right' : 'bottom']]
                        break
                    }
                    this.m_xml.tag('hole-closed', location, holeClosedValue)
                    this.m_xml.endElement()
                } else {
                    this.m_xml.tagRaw(mxmlTechn)
                }
            } else if (a.isTapping()) {
                const tap = a as unknown as Tapping
                notations.tag(this.m_xml, a, 'technical')
                mxmlTechn = 'tap'
                if (tap.hand() !== TappingHand.INVALID) {
                    mxmlTechn += ` hand="${TConv.toXmlTappingHand(tap.hand())}"`
                }
                mxmlTechn += color2xml(a)
                mxmlTechn += ExportMusicXml.positioningAttributes(a)
                if (placement) {
                    mxmlTechn += ` placement="${placement}"`
                }
                this.m_xml.tagRaw(mxmlTechn)
            }
        }

        // write all remaining articulations as other-articulation
        for (const a of na) {
            const sid = a.symId()
            const articText = TConv.toXmlArticulationTextType(a.textType())
            if (!symIdToArtic(sid).length
                && !symIdToTechn(sid)
                && !a.isOrnament() && !a.isTapping()
                && !isLaissezVibrer(sid)) {
                let otherArtic = 'other-articulation'
                otherArtic += color2xml(a)
                otherArtic += ExportMusicXml.positioningAttributes(a)
                if (a.anchor() !== ArticulationAnchor.AUTO) {
                    if (a.anchor() === ArticulationAnchor.TOP) {
                        otherArtic += ' placement="above"'
                    } else {
                        otherArtic += ' placement="below"'
                    }
                }
                const articGlyph = SymNames.nameForSymId(sid)
                if (articGlyph) {
                    otherArtic += ` smufl="${articGlyph}"`
                }
                if (articGlyph || articText) {
                    notations.tag(this.m_xml, a, 'articulations')
                    this.m_xml.tagRaw(otherArtic, articText)
                    notations.etag(this.m_xml)
                }
            }
        }
    }

    //---------------------------------------------------------
    //   elementPosition
    //---------------------------------------------------------

    private static elementPosition(expMxml: ExportMusicXml, elm: EngravingItem): string {
        let res = ''

        if (ExportMusicXml.configuration().exportLayout()) {
            const pageHeight = expMxml.getTenthsFromInches(expMxml.score().style().styleD(Sid.pageHeight))

            const meas = elm.findMeasure()
            if (!meas) {
                return res
            }

            const measureX = expMxml.getTenthsFromDots(meas.pagePos().x())
            const measureY = pageHeight - expMxml.getTenthsFromDots(meas.pagePos().y())
            const noteX = expMxml.getTenthsFromDots(elm.pagePos().x())
            const noteY = pageHeight - expMxml.getTenthsFromDots(elm.pagePos().y())

            res += ` default-x="${numStr(noteX - measureX, 2)}"`
            res += ` default-y="${numStr(noteY - measureY, 2)}"`
        }

        return res
    }

    //---------------------------------------------------------
    //   chord
    //---------------------------------------------------------

    /**
     Write \a chord on \a staff with lyriclist \a ll.

     For a single-staff part, \a staff equals zero, suppressing the <staff> element.
     */

    private chord(chord: Chord, staff: staff_idx_t, ll: readonly Lyrics[], useDrumset: boolean): void {
        const part = chord.score()!.staff(Math.trunc(chord.track() / VOICES))!.part()!
        const partNr = this.m_score.parts().indexOf(part)
        const instNr = this.m_instrMap.get(part.instrument(this.m_tick)) ?? -1
        const nl = chord.notes()
        const grace = chord.isGrace()
        if (!grace) {
            this.m_tick = this.m_tick.plus(chord.actualTicks())
        }

        for (const note of nl) {
            this.m_attr.doAttr(this.m_xml, false)
            let noteTag = 'note'

            noteTag += ExportMusicXml.elementPosition(this, note)

            const velo = note.userVelocity()
            if (velo !== 0) {
                noteTag += ` dynamics="${numStr(velo * 100.0 / 90.0, 2)}"`
            }

            this.m_xml.startElementRaw(noteTag)

            if (grace) {
                if (note.chord().showStemSlash()) {
                    this.m_xml.tag('grace', [['slash', 'yes']])
                } else {
                    this.m_xml.tag('grace')
                }
            }
            if (isCueNote(note)) {
                this.m_xml.tag('cue')
            }
            if (note !== nl[0]) {
                this.m_xml.tag('chord')
            }

            writePitch(this.m_xml, note, useDrumset)

            // duration
            if (!grace) {
                this.m_xml.tag('duration', calculateDurationInDivisions(chord.globalTicks(), this.m_div))
            }

            if (!isCueNote(note)) {
                if (note.tieBackNonPartial()) {
                    this.m_xml.tag('tie', [['type', 'stop']])
                }
                if (note.tieForNonPartial()) {
                    this.m_xml.tag('tie', [['type', 'start']])
                }
            }

            // instrument for multi-instrument or unpitched parts
            if (!useDrumset) {
                if (this.m_instrMap.size > 1 && instNr >= 0) {
                    this.m_xml.tagRaw(`instrument ${instrId(partNr + 1, instNr + 1)}`)
                }
            } else {
                this.m_xml.tagRaw(`instrument ${instrId(partNr + 1, note.pitch() + 1)}`)
            }

            // voice
            // for a single-staff part, staff is 0, which needs to be corrected
            // to calculate the correct voice number
            let voice = (staff - 1) * VOICES + note.chord().voice() + 1
            if (staff === 0) {
                voice += VOICES
            }

            this.m_xml.tag('voice', voice)

            writeType(this.m_xml, note)
            for (const dot of note.dots()) {
                let dotTag = 'dot'
                if (note.userDotPosition() !== DirectionV.AUTO) {
                    if (note.dotPosition() === DirectionV.UP) {
                        dotTag += ' placement="above"'
                    } else {
                        dotTag += ' placement="below"'
                    }
                }
                dotTag += color2xml(dot)
                dotTag += ExportMusicXml.elementPosition(this, dot)
                this.m_xml.tagRaw(dotTag)
            }
            writeAccidental(this.m_xml, 'accidental', note.accidental())
            writeTimeModification(this.m_xml, note.chord().tuplet(), tremoloCorrection(note))

            // no stem for whole notes and beyond
            const stem = note.chord().stem()
            if (chord.noStem() || chord.measure()!.stemless(chord.staffIdx()) || (chord.stem() && !chord.stem()!.visible())) {
                this.m_xml.tag('stem', 'none')
            } else if (stem) {
                let stemTag = 'stem'
                stemTag += color2xml(stem)
                this.m_xml.tagRaw(stemTag, note.chord().up() ? 'up' : 'down')
            }

            writeNotehead(this.m_xml, note)

            // LVIFIX: check move() handling
            if (staff) {
                this.m_xml.tag('staff', staff + note.chord().staffMove())
            }

            if (note === nl[0] && chord.beam()) {
                writeBeam(this.m_xml, chord, chord.beam()!)
            }

            const notations = new Notations()

            const tieBack = note.tieBack()
            if (tieBack) {
                notations.tag(this.m_xml, tieBack)
                this.m_xml.tag('tied', [['type', 'stop']])
            }

            const laissezVib = note.laissezVib()
            if (laissezVib) {
                notations.tag(this.m_xml, laissezVib)
                const rest = slurTieLineStyle(laissezVib)
                this.m_xml.tagRaw(`tied type="let-ring"${rest}`)
            }

            const tieFor = note.tieFor()
            if (tieFor && !laissezVib) {
                notations.tag(this.m_xml, tieFor)
                const rest = slurTieLineStyle(tieFor)
                this.m_xml.tagRaw(`tied type="start"${rest}`)
            }

            if (note === nl[0]) {
                if (!grace) {
                    tupletStartStop(chord, notations, this.m_xml)
                }

                this.m_sh.doSlurs(chord, notations, this.m_xml)

                this.chordAttributes(chord, notations, this.m_trillStart, this.m_trillStop)
            }

            writeFingering(this.m_xml, notations, note)
            writeNotationSymbols(this.m_xml, notations, note.el(), true)

            // write tablature string / fret
            if (chord.staff() && chord.staff()!.isTabStaff(new Fraction(0, 1))) {
                if (note.fret() >= 0 && note.string() >= 0) {
                    notations.tag(this.m_xml, note, 'technical')
                    this.m_xml.tag('string', note.string() + 1)
                    this.m_xml.tag('fret', note.fret())
                }
            }

            writeGuitarBend(this.m_xml, notations, note)
            notations.closeContainer(this.m_xml) // end technical tag

            if (chord.arpeggio()) {
                arpeggiate(chord.arpeggio() as Arpeggio, note === nl[0], note === nl[nl.length - 1], this.m_xml, notations, this.m_measArpeggios)
            } else if (chord.spanArpeggio()) {
                arpeggiate(chord.spanArpeggio() as Arpeggio, note === nl[0], note === nl[nl.length - 1], this.m_xml, notations,
                    this.m_measArpeggios, /*spanArp=*/ true)
            }
            for (const spanner of note.spannerFor()) {
                if (spanner.isGlissando()) {
                    this.m_gh.doGlissandoStart(spanner as unknown as Glissando, notations, this.m_xml)
                }
            }
            for (const spanner of note.spannerBack()) {
                if (spanner.isGlissando()) {
                    this.m_gh.doGlissandoStop(spanner as unknown as Glissando, notations, this.m_xml)
                }
            }
            notations.etag(this.m_xml)
            // write lyrics (only for first note)
            if (!grace && (note === nl[0])) {
                this.lyrics(ll, chord.track())
            }
            this.m_xml.endElement()
        }
    }

    //---------------------------------------------------------
    //   rest
    //---------------------------------------------------------

    /**
     Write \a rest on \a staff.

     For a single-staff part, \a staff equals zero, suppressing the <staff> element.
     */

    private rest(rest: Rest, staff: staff_idx_t, ll: readonly Lyrics[]): void {
        const table2 = 'CDEFGAB'
        this.m_attr.doAttr(this.m_xml, false)

        let noteTag = 'note'
        noteTag += color2xml(rest)
        noteTag += ExportMusicXml.elementPosition(this, rest)
        if (!rest.visible()
            || (rest.staff() && rest.staff()!.staffType(rest.tick())!.isTabStaff()
                && !rest.staff()!.staffType(rest.tick())!.showRests())) {
            noteTag += ' print-object="no"'
        }
        this.m_xml.startElementRaw(noteTag)

        let yOffsSt = 0
        let oct = 0
        let stp = 0
        const clef = rest.staff()!.clef(rest.tick())
        let po = ClefInfo.pitchOffset(clef)

        // Determine y position, but leave at zero in case of tablature staff
        // as no display-step or display-octave should be written for a tablature staff,

        if (clef !== ClefType.TAB && clef !== ClefType.TAB_SERIF && clef !== ClefType.TAB4 && clef !== ClefType.TAB4_SERIF) {
            const yOffsSp = -2 * rest.offset().y() / rest.spatium() // positive = up, one spatium is two pitches
            yOffsSt = Math.trunc(yOffsSp > 0.0 ? yOffsSp + 0.5 : yOffsSp - 0.5) // same rounded to int

            po -= 4 // pitch middle staff line (two lines times two steps lower than top line)
            po += yOffsSt // rest "pitch"
            po -= 7 // correct octave
            // at this point:
            // C0 (lowest value allowed in MusicXML) has po == 0   (y offset = 17 (treble clef) 11 (bass clef))
            // B9 (highest value allowed in MusicXML) has po == 69 (y offset = -17.5 (treble clef) -23.5 (bass clef))

            po = Math.min(Math.max(po, 0), 69)
            oct = Math.trunc(po / 7) // octave (MusicXML spec: must be 0..9, C4 is middle C)
            stp = po % 7 // step (must be 0..6, as display-step must be A..G)
        }

        let restTag = 'rest'
        const d = rest.durationType()
        if (d.isMeasure()) {
            restTag += ' measure="yes"'
        }
        // Either <rest/>
        // or <rest><display-step>F</display-step><display-octave>5</display-octave></rest>
        if (yOffsSt === 0) {
            this.m_xml.tagRaw(restTag)
        } else {
            this.m_xml.startElementRaw(restTag)
            this.m_xml.tag('display-step', table2[stp])
            this.m_xml.tag('display-octave', oct)
            this.m_xml.endElement()
        }

        // regular rest
        const tickLen = rest.globalTicks() // MusicXML requires unstretched duration
        this.m_tick = this.m_tick.plus(rest.actualTicks()) // prevent <backward> or <forward> by moving to next note's tick

        this.m_xml.tag('duration', calculateDurationInDivisions(tickLen, this.m_div))

        // for a single-staff part, staff is 0, which needs to be corrected
        // to calculate the correct voice number
        let voice = (staff - 1) * VOICES + rest.voice() + 1
        if (staff === 0) {
            voice += VOICES
        }
        this.m_xml.tag('voice', voice)

        // do not output a "type" element for whole measure rest
        if (!d.isMeasure()) {
            const s = TConv.toXmlDurationType(d.type())
            if (rest.isSmall()) {
                this.m_xml.tag('type', [['size', 'cue']], s)
            } else {
                this.m_xml.tag('type', s)
            }
            for (const dot of rest.dotList()) {
                let dotTag = 'dot'
                dotTag += color2xml(dot)
                dotTag += ExportMusicXml.elementPosition(this, dot)
                this.m_xml.tagRaw(dotTag)
            }
        }

        writeTimeModification(this.m_xml, rest.tuplet())

        if (staff) {
            this.m_xml.tag('staff', staff)
        }

        if (rest.beam()) {
            writeBeam(this.m_xml, rest, rest.beam()!)
        }

        const notations = new Notations()
        const fl: EngravingItem[] = []
        for (const e of rest.segment()!.annotations()) {
            if (e.isFermata() && e.track() === rest.track()) {
                fl.push(e)
            }
        }
        fermatas(fl, this.m_xml, notations)

        writeBreathMark(rest.hasBreathMark(), this.m_xml, notations)

        this.wavyLineStartStop(rest, notations, this.m_trillStart, this.m_trillStop)

        writeNotationSymbols(this.m_xml, notations, rest.el(), false)

        this.m_sh.doSlurs(rest, notations, this.m_xml)

        tupletStartStop(rest, notations, this.m_xml)
        notations.etag(this.m_xml)

        this.lyrics(ll, rest.track())

        this.m_xml.endElement()
    }

    //---------------------------------------------------------
    //   tempoText
    //---------------------------------------------------------

    tempoText(text: TempoText, staff: staff_idx_t): void {
        const offset = calculateTimeDeltaInDivisions(text.tick(), this.tick(), this.m_div)
        this.m_attr.doAttr(this.m_xml, false)

        const tempoAttrs: Array<[string, string | number]> = [['placement', TConv.toXmlPlacementV(text.placement())]]
        if (text.systemFlag() && !ExportMusicXml.configuration().exportMu3Compat()) {
            tempoAttrs.push(['system', text.isLinked() ? 'also-top' : 'only-top'])
        }

        this.m_xml.startElement('direction', tempoAttrs)
        wordsMetronome(this.m_xml, this.m_score.style(), text, offset)

        if (staff) {
            this.m_xml.tag('staff', staff)
        }
        this.tempoSound(text)
        this.m_xml.endElement()
    }

    tempoSound(text: TempoText): void {
        // Format tempo with maximum 2 decimal places, because in some MuseScore files tempo is stored
        // imprecisely and this could cause rounding errors (e.g. 92 BPM would be saved as 91.9998).
        let bpm = text.tempo() * 60.0 // BeatsPerSecond::toBPM()
        if (text.isATempo() || text.isTempoPrimo()) {
            bpm = this.m_score.tempomap().tempo(text.tick().ticks()) * 60.0
        }
        const bpmRounded = Math.round(bpm * 100) / 100
        this.m_xml.tag('sound', [['tempo', bpmRounded]])
    }

    swingSound(text: StaffTextBase, offset = false): void {
        this.m_xml.startElement('sound')
        this.m_xml.startElement('swing')
        if (!text.swingParameters().swingUnit) {
            this.m_xml.tag('straight')
        } else {
            const swingPercentage = text.swingParameters().swingRatio
            const gcd = (a: number, b: number): number => (b ? gcd(b, a % b) : Math.abs(a))
            const swingDivisor = gcd(text.swingParameters().swingRatio, 100)
            this.m_xml.tag('first', Math.trunc(100 / swingDivisor))
            this.m_xml.tag('second', Math.trunc(swingPercentage / swingDivisor))
            if (text.swingParameters().swingUnit === Constants.DIVISION / 2) {
                this.m_xml.tag('swing-type', TConv.toXmlDurationType(DurationType.V_EIGHTH))
            } else {
                this.m_xml.tag('swing-type', TConv.toXmlDurationType(DurationType.V_16TH))
            }
        }
        this.m_xml.endElement()
        if (offset) {
            this.m_xml.tag('offset', calculateTimeDeltaInDivisions(text.tick(), this.tick(), this.m_div))
        }
        this.m_xml.endElement()
    }

    //---------------------------------------------------------
    //   playText
    //---------------------------------------------------------

    playText(annot: PlayTechAnnotation, staff: staff_idx_t): void {
        const offset = calculateTimeDeltaInDivisions(annot.tick(), this.tick(), this.m_div)

        if (!annot.plainText()) {
            // sometimes empty Texts are present, exporting would result
            // in invalid MusicXML (as an empty direction-type would be created)
            return
        }

        directionTag(this.m_xml, this.m_attr, annot)
        wordsMetronome(this.m_xml, this.m_score.style(), annot, offset)

        const type = annot.techniqueType()
        if (type === PlayingTechniqueType.Pizzicato) {
            this.m_xml.tag('sound', [['pizzicato', 'yes']])
        } else if (this.m_currPlayTechnique === PlayingTechniqueType.Pizzicato) { // C++: && type != Pizzicato (always true here)
            this.m_xml.tag('sound', [['pizzicato', 'no']])
        } else if ((type !== PlayingTechniqueType.Undefined) && (type !== PlayingTechniqueType.Natural)) {
            this.m_xml.startElement('sound')
            this.m_xml.startElement('play')
            if (type === PlayingTechniqueType.Mute) {
                this.m_xml.tag('mute', 'on')
            } else if (type === PlayingTechniqueType.Open) {
                this.m_xml.tag('mute', 'off')
            } else {
                this.m_xml.tag('other-play', [['type', TConv.toXmlPlayingTechniqueType(type)]],
                    TConv.userNamePlayingTechniqueType(type).translated())
            }
            this.m_xml.endElement()
            this.m_xml.endElement()
        }
        this.m_currPlayTechnique = type

        directionETag(this.m_xml, staff)
    }

    //---------------------------------------------------------
    //   words
    //---------------------------------------------------------

    words(text: TextBase, staff: staff_idx_t): void {
        const offset = calculateTimeDeltaInDivisions(text.tick(), this.tick(), this.m_div)

        if (!text.plainText()) {
            // sometimes empty Texts are present, exporting would result
            // in invalid MusicXML (as an empty direction-type would be created)
            return
        }

        directionTag(this.m_xml, this.m_attr, text)
        wordsMetronome(this.m_xml, this.m_score.style(), text, offset)

        directionETag(this.m_xml, staff)
    }

    //---------------------------------------------------------
    //   image
    //---------------------------------------------------------

    image(img: Image, staff: staff_idx_t): void {
        const isi = img.storeItem()
        if (!isi) {
            return
        }

        directionTag(this.m_xml, this.m_attr, img)
        this.m_xml.startElement('direction-type')

        const { source, type } = getImageInfo(isi)

        if (this.m_isMxl) {
            let imgTag = 'image source="' + XmlWriter.xmlString(source) + '"'
            imgTag += ' type="' + XmlWriter.xmlString(type) + '"'

            let width = img.imageWidth()
            let height = img.imageHeight()
            if (!img.sizeIsSpatium()) {
                const sp = img.spatium()
                if (sp > 0.0) {
                    width /= sp
                    height /= sp
                }
            }

            imgTag += ' height="' + numStr(height * 10.0, 2) + '"'
            imgTag += ' width="' + numStr(width * 10.0, 2) + '"'
            imgTag += ExportMusicXml.positioningAttributes(img)

            this.m_xml.tagRaw(imgTag)
        } else {
            let otherTag = 'other-direction'
            otherTag += ExportMusicXml.positioningAttributes(img)
            this.m_xml.tagRaw(otherTag, XmlWriter.xmlString(source))
        }
        this.m_xml.endElement() // direction-type

        directionETag(this.m_xml, staff)
    }

    //---------------------------------------------------------
    //   systemText
    //---------------------------------------------------------

    systemText(text: StaffTextBase, staff: staff_idx_t): void {
        const offset = calculateTimeDeltaInDivisions(text.tick(), this.tick(), this.m_div)

        if (!text.plainText()) {
            // sometimes empty Texts are present, exporting would result
            // in invalid MusicXML (as an empty direction-type would be created)
            return
        }

        directionTag(this.m_xml, this.m_attr, text)
        wordsMetronome(this.m_xml, this.m_score.style(), text, offset)

        if (text.swing()) {
            this.swingSound(text)
        }

        directionETag(this.m_xml, staff)
    }

    //---------------------------------------------------------
    //   positioningAttributesForTboxText
    //---------------------------------------------------------

    private static positioningAttributesForTboxText(position: PointF, spatium: number): string {
        if (!ExportMusicXml.configuration().exportLayout()) {
            return ''
        }

        const relative = new PointF() // use zero relative position
        return positionToString(position, relative, Math.fround(spatium))
    }

    //---------------------------------------------------------
    //   tboxTextAsWords
    //---------------------------------------------------------

    tboxTextAsWords(text: TextBase, staff: staff_idx_t, relativePosition: PointF): void {
        if (!text.plainText()) {
            // sometimes empty Texts are present, exporting would result
            // in invalid MusicXML (as an empty direction-type would be created)
            return
        }

        // set the default words format
        const style = this.m_score.style()
        const mtf = style.styleSt(Sid.musicalTextFont)
        const defFmt = formatForWords(style)

        this.m_xml.startElement('direction', [['placement', (relativePosition.y() < 0) ? 'above' : 'below']])
        this.m_xml.startElement('direction-type')
        let attr = ''
        attr += frame2xml(text)
        attr += ExportMusicXml.positioningAttributesForTboxText(relativePosition, text.spatium())
        attr += ' valign="top"'
        const mttm = new MScoreTextToMusicXml('words', attr, defFmt, mtf)
        mttm.writeTextFragments(text.fragmentList(), this.m_xml)
        this.m_xml.endElement()
        directionETag(this.m_xml, staff)
    }

    //---------------------------------------------------------
    //   rehearsal
    //---------------------------------------------------------

    rehearsal(rmk: RehearsalMark, staff: staff_idx_t): void {
        if (!rmk.plainText()) {
            // sometimes empty Texts are present, exporting would result
            // in invalid MusicXML (as an empty direction-type would be created)
            return
        }

        directionTag(this.m_xml, this.m_attr, rmk)
        this.m_xml.startElement('direction-type')
        let attr = ''
        if (rmk.circle()) {
            attr = ' enclosure="circle"'
        } else if (!rmk.hasFrame()) {
            // special default case
            attr = ' enclosure="none"'
        }
        attr += color2xml(rmk)
        attr += ExportMusicXml.positioningAttributes(rmk)
        if (ExportMusicXml.configuration().exportLayout()) {
            switch (rmk.align().horizontal) {
            case AlignH.LEFT:
                // default in MusicXML
                break
            case AlignH.HCENTER:
                attr += ' justify="center"'
                break
            case AlignH.RIGHT:
                attr += ' justify="right"'
                break
            case AlignH.JUSTIFY:
                attr += ' justify="justify"'
                break
            }
        }
        // set the default words format
        const style = this.m_score.style()
        const mtf = style.styleSt(Sid.musicalTextFont)
        const defFmt = formatForWords(style)
        // write formatted
        const mttm = new MScoreTextToMusicXml('rehearsal', attr, defFmt, mtf)
        mttm.writeTextFragments(rmk.fragmentList(), this.m_xml)
        this.m_xml.endElement()
        const offset = calculateTimeDeltaInDivisions(rmk.tick(), this.tick(), this.m_div)
        if (offset) {
            this.m_xml.tag('offset', offset)
        }
        directionETag(this.m_xml, staff)
    }

    //---------------------------------------------------------
    //   harp pedal
    //---------------------------------------------------------

    harpPedals(hpd: HarpPedalDiagram, staff: staff_idx_t): void {
        directionTag(this.m_xml, this.m_attr, hpd)
        this.m_xml.startElement('direction-type')
        const harpPedalAttrs: Array<[string, string | number]> = []
        addColorAttr(hpd, harpPedalAttrs)
        if (hpd.isDiagram()) {
            this.m_xml.startElement('harp-pedals', harpPedalAttrs)
            const pedalSteps = ['D', 'C', 'B', 'E', 'F', 'G', 'A']
            for (let idx = 0; idx < pedalSteps.length; idx++) {
                this.m_xml.startElement('pedal-tuning')
                this.m_xml.tag('pedal-step', pedalSteps[idx])
                this.m_xml.tag('pedal-alter', (hpd.getPedalState()[idx] as number) - 1)
                this.m_xml.endElement()
            }
            this.m_xml.endElement()
        } else {
            this.m_xml.tag('words', harpPedalAttrs, hpd.plainText())
        }
        this.m_xml.endElement()
        const offset = calculateTimeDeltaInDivisions(hpd.tick(), this.tick(), this.m_div)
        if (offset) {
            this.m_xml.tag('offset', offset)
        }
        directionETag(this.m_xml, staff)
    }

    //---------------------------------------------------------
    //   findDashes -- get index of hairpin in dashes table
    //   return -1 if not found
    //---------------------------------------------------------

    private findDashes(hp: TextLineBase | null): number {
        for (let i = 0; i < MAX_NUMBER_LEVEL; ++i) {
            if (this.m_dashes[i] === hp) {
                return i
            }
        }
        return -1
    }

    //---------------------------------------------------------
    //   findHairpin -- get index of hairpin in hairpin table
    //   return -1 if not found
    //---------------------------------------------------------

    private findHairpin(hp: Hairpin | null): number {
        for (let i = 0; i < MAX_NUMBER_LEVEL; ++i) {
            if (this.m_hairpins[i] === hp) {
                return i
            }
        }
        return -1
    }

    //---------------------------------------------------------
    //   hairpin
    //---------------------------------------------------------

    hairpin(hp: Hairpin, staff: staff_idx_t, tick: Fraction): void {
        const isLineType = hp.isLineType()
        const isStart = hp.tick().eq(tick)
        let n = 0
        if (isLineType) {
            if (!hp.lineVisible()) {
                if ((isStart && !hp.beginText()) || (!isStart && !hp.endText())) {
                    return
                }
                directionTag(this.m_xml, this.m_attr, hp)
                writeHairpinText(this.m_xml, hp, isStart)
                directionETag(this.m_xml, staff, calculateTimeDeltaInDivisions(tick, this.m_tick, this.m_div))
                return
            }
            n = this.findDashes(hp)
            if (n >= 0) {
                this.m_dashes[n] = null
            } else {
                n = this.findDashes(null)
                if (n >= 0) {
                    this.m_dashes[n] = hp
                } else {
                    return
                }
            }
        } else {
            n = this.findHairpin(hp)
            if (n >= 0) {
                this.m_hairpins[n] = null
            } else {
                n = this.findHairpin(null)
                if (n >= 0) {
                    this.m_hairpins[n] = hp
                } else {
                    return
                }
            }
        }

        directionTag(this.m_xml, this.m_attr, hp)
        if (isStart) {
            writeHairpinText(this.m_xml, hp, isStart)
        }
        if (isLineType) {
            if (hp.lineVisible()) {
                if (isStart) {
                    this.m_xml.startElement('direction-type')
                    let tag = 'dashes type="start"'
                    tag += ` number="${n + 1}"`
                    tag += color2xml(hp)
                    tag += ExportMusicXml.positioningAttributes(hp, isStart)
                    this.m_xml.tagRaw(tag)
                    this.m_xml.endElement()
                } else {
                    this.m_xml.startElement('direction-type')
                    this.m_xml.tagRaw(`dashes type="stop" number="${n + 1}"`)
                    this.m_xml.endElement()
                }
            }
        } else {
            this.m_xml.startElement('direction-type')
            let tag = 'wedge type='
            if (isStart) {
                if (hp.hairpinType() === HairpinType.CRESC_HAIRPIN) {
                    tag += '"crescendo"'
                    if (hp.hairpinCircledTip()) {
                        tag += ' niente="yes"'
                    }
                } else {
                    tag += '"diminuendo"'
                }
                tag += color2xml(hp)
                tag += ExportMusicXml.positioningAttributes(hp, isStart)
                switch (hp.lineStyle()) {
                case LineType.DASHED:
                    tag += ' line-type="dashed"'
                    break
                case LineType.DOTTED:
                    tag += ' line-type="dotted"'
                    break
                case LineType.SOLID:
                default:
                    break
                }
                if (ExportMusicXml.configuration().exportLayout() && (hp.lineStyle() === LineType.DASHED)) {
                    tag += ` dash-length="${numStr(hp.dashLineLen() * 10, 2)}"`
                    tag += ` space-length="${numStr(hp.dashGapLen() * 10, 2)}"`
                }
                if (ExportMusicXml.configuration().exportLayout() && hp.hairpinType() === HairpinType.CRESC_HAIRPIN) {
                    tag += ` spread="${numStr(hp.hairpinHeight().val() * 10, 2)}"`
                }
            } else {
                tag += '"stop"'
                if (hp.hairpinCircledTip() && hp.hairpinType() === HairpinType.DIM_HAIRPIN) {
                    tag += ' niente="yes"'
                }
                if (ExportMusicXml.configuration().exportLayout() && hp.hairpinType() === HairpinType.DIM_HAIRPIN) {
                    tag += ` spread="${numStr(hp.hairpinHeight().val() * 10, 2)}"`
                }
            }
            tag += ` number="${n + 1}"`
            this.m_xml.tagRaw(tag)
            this.m_xml.endElement()
        }
        if (!isStart) {
            writeHairpinText(this.m_xml, hp, isStart)
        }
        directionETag(this.m_xml, staff, calculateTimeDeltaInDivisions(isStart ? hp.tick() : hp.tick2(), this.m_tick, this.m_div))
    }

    //---------------------------------------------------------
    //   findOttava -- get index of ottava in ottava table
    //   return -1 if not found
    //---------------------------------------------------------

    private findOttava(ot: Ottava | null): number {
        for (let i = 0; i < MAX_NUMBER_LEVEL; ++i) {
            if (this.m_ottavas[i] === ot) {
                return i
            }
        }
        return -1
    }

    //---------------------------------------------------------
    //   ottava
    // <octave-shift type="down" size="8" relative-y="14"/>
    // <octave-shift type="stop" size="8"/>
    //---------------------------------------------------------

    ottava(ot: Ottava, staff: staff_idx_t, tick: Fraction): void {
        let n = this.findOttava(ot)
        const isStart = ot.tick().eq(tick)
        const measure = ot.startElement() ? ot.startElement()!.findMeasure() : null
        const measureStart = measure ? measure.tick() : new Fraction(0, 1)
        if (n >= 0) {
            this.m_ottavas[n] = null
        } else {
            n = this.findOttava(null)
            if (n >= 0) {
                this.m_ottavas[n] = ot
            } else {
                return
            }
        }

        let octaveShiftXml = ''
        const st = ot.ottavaType()
        if (ot.tick().eq(tick)) {
            let sz = ''
            let tp = ''
            switch (st) {
            case OttavaType.OTTAVA_8VA:
                sz = '8'
                tp = 'down'
                break
            case OttavaType.OTTAVA_15MA:
                sz = '15'
                tp = 'down'
                break
            case OttavaType.OTTAVA_22MA:
                sz = '22'
                tp = 'down'
                break
            case OttavaType.OTTAVA_8VB:
                sz = '8'
                tp = 'up'
                break
            case OttavaType.OTTAVA_15MB:
                sz = '15'
                tp = 'up'
                break
            case OttavaType.OTTAVA_22MB:
                sz = '22'
                tp = 'up'
                break
            default:
                break
            }
            if (sz && tp) {
                octaveShiftXml = `octave-shift type="${tp}" size="${sz}" number="${n + 1}"`
            }
        } else {
            if (st === OttavaType.OTTAVA_8VA || st === OttavaType.OTTAVA_8VB) {
                octaveShiftXml = `octave-shift type="stop" size="8" number="${n + 1}"`
            } else if (st === OttavaType.OTTAVA_15MA || st === OttavaType.OTTAVA_15MB) {
                octaveShiftXml = `octave-shift type="stop" size="15" number="${n + 1}"`
            } else if (st === OttavaType.OTTAVA_22MA || st === OttavaType.OTTAVA_22MB) {
                octaveShiftXml = `octave-shift type="stop" size="22" number="${n + 1}"`
            }
        }

        if (octaveShiftXml) {
            // generate backup or forward to the start time of the element
            const tickToWrite = isStart ? ot.tick() : ot.tick2()
            this.moveToTickIfNeed(tickToWrite, ot.track(), measureStart)

            directionTag(this.m_xml, this.m_attr, null)
            this.m_xml.startElement('direction-type')
            octaveShiftXml += color2xml(ot)
            octaveShiftXml += ExportMusicXml.positioningAttributes(ot, ot.tick().eq(tick))
            this.m_xml.tagRaw(octaveShiftXml)
            this.m_xml.endElement()
            directionETag(this.m_xml, staff)
        }
    }

    //---------------------------------------------------------
    //   pedal
    //---------------------------------------------------------

    pedal(pd: Pedal, staff: staff_idx_t, tick: Fraction): void {
        // "change" type is handled only on the beginning of pedal lines
        if (!pd.tick().eq(tick) && pd.endHookType() === HookType.HOOK_45) {
            return
        }
        const isStart = pd.tick().eq(tick)

        directionTag(this.m_xml, this.m_attr, pd)
        this.m_xml.startElement('direction-type')
        let pedalType = ''
        let pedalXml = ''
        let signText = ''
        const lineText = pd.lineVisible() ? ' line="yes"' : ' line="no"'
        if (pd.tick().eq(tick)) {
            switch (pd.beginHookType()) {
            case HookType.HOOK_45:
                pedalType = 'change'
                break
            case HookType.NONE:
                pedalType = (pd.lineVisible() && !pd.beginText()) ? 'resume' : 'start'
                break
            default:
                pedalType = 'start'
            }
            signText = !pd.beginText() ? ' sign="no"' : ' sign="yes"'
            if (pd.beginText() === '<sym>keyboardPedalSost</sym>' || pd.beginText() === '<sym>keyboardPedalS</sym>') {
                pedalType = 'sostenuto'
            }
        } else {
            switch (pd.endHookType()) {
            case HookType.NONE:
                pedalType = (pd.lineVisible() && !pd.endText()) ? 'discontinue' : 'stop'
                break
            default:
                pedalType = 'stop'
            }
            // "change" type is handled only on the beginning of pedal lines

            signText = !pd.endText() ? ' sign="no"' : ' sign="yes"'
        }
        pedalXml = `pedal type="${pedalType}"`
        pedalXml += lineText
        pedalXml += signText
        pedalXml += color2xml(pd)
        pedalXml += ExportMusicXml.positioningAttributes(pd, pd.tick().eq(tick))
        this.m_xml.tagRaw(pedalXml)
        this.m_xml.endElement()
        directionETag(this.m_xml, staff, calculateTimeDeltaInDivisions(isStart ? pd.tick() : pd.tick2(), this.m_tick, this.m_div))
    }

    //---------------------------------------------------------
    //   findBracket -- get index of bracket in bracket table
    //   return -1 if not found
    //---------------------------------------------------------

    private findBracket(tl: TextLineBase | null): number {
        for (let i = 0; i < MAX_NUMBER_LEVEL; ++i) {
            if (this.m_brackets[i] === tl) {
                return i
            }
        }
        return -1
    }

    //---------------------------------------------------------
    //   textLine
    //---------------------------------------------------------

    textLine(tl: TextLineBase, staff: staff_idx_t, tick: Fraction): void {
        const isStart = tl.tick().eq(tick)
        if (!tl.lineVisible()) {
            if ((isStart && !tl.beginText()) || (!isStart && !tl.endText())) {
                return
            }
            directionTag(this.m_xml, this.m_attr, tl)
            writeHairpinText(this.m_xml, tl, isStart)
            directionETag(this.m_xml, staff, calculateTimeDeltaInDivisions(tick, this.m_tick, this.m_div))
            return
        }

        let n = 0
        // special case: a dashed line w/o hooks is written as dashes
        const isDashes = tl.lineStyle() === LineType.DASHED && (tl.beginHookType() === HookType.NONE)
                         && (tl.endHookType() === HookType.NONE)

        if (isDashes) {
            n = this.findDashes(tl)
            if (n >= 0) {
                this.m_dashes[n] = null
            } else {
                n = this.findBracket(null)
                if (n >= 0) {
                    this.m_dashes[n] = tl
                } else {
                    return
                }
            }
        } else {
            n = this.findBracket(tl)
            if (n >= 0) {
                this.m_brackets[n] = null
            } else {
                n = this.findBracket(null)
                if (n >= 0) {
                    this.m_brackets[n] = tl
                } else {
                    return
                }
            }
        }

        let rest = ''

        let type = ''
        let hookType = HookType.NONE
        let hookHeight = 0.0
        if (tl.tick().eq(tick)) {
            if (!isDashes) {
                let lineType = ''
                switch (tl.lineStyle()) {
                case LineType.SOLID:
                    lineType = 'solid'
                    break
                case LineType.DASHED:
                    lineType = 'dashed'
                    break
                case LineType.DOTTED:
                    lineType = 'dotted'
                    break
                }
                rest += ` line-type="${lineType}"`
            }
            hookType = tl.beginHookType()
            hookHeight = tl.beginHookHeight().val()
            type = 'start'
        } else {
            hookType = tl.endHookType()
            hookHeight = tl.endHookHeight().val()
            type = 'stop'
        }

        let lineEnd = ''
        switch (hookType) {
        case HookType.HOOK_90:
            lineEnd = (tl.placement() === PlacementV.BELOW) ? 'up' : 'down'
            rest += ` end-length="${argD(Math.abs(hookHeight * 10))}"`
            break
        case HookType.HOOK_90T:
            lineEnd = 'both'
            rest += ` end-length="${argD(Math.abs(hookHeight * 20))}"`
            break
        case HookType.ARROW:
        case HookType.ARROW_FILLED:
            lineEnd = 'arrow'
            break
        case HookType.NONE:
            lineEnd = 'none'
            break
        default:
            lineEnd = 'none'
        }

        rest += color2xml(tl)
        rest += ExportMusicXml.positioningAttributes(tl, tl.tick().eq(tick))

        directionTag(this.m_xml, this.m_attr, tl)

        if (tl.beginText() && tl.tick().eq(tick)) {
            this.m_xml.startElement('direction-type')
            this.m_xml.tag('words', tl.beginText())
            this.m_xml.endElement()
        }

        if (tl.lineVisible()) {
            this.m_xml.startElement('direction-type')
            if (isDashes) {
                this.m_xml.tag('dashes', [['type', type], ['number', n + 1]])
            } else {
                this.m_xml.tagRaw(`bracket type="${type}" number="${n + 1}" line-end="${lineEnd}"${rest}`)
            }
            this.m_xml.endElement()
        }

        if (tl.endText() && !tl.tick().eq(tick)) {
            this.m_xml.startElement('direction-type')
            this.m_xml.tag('words', tl.endText())
            this.m_xml.endElement()
        }

        directionETag(this.m_xml, staff, calculateTimeDeltaInDivisions(isStart ? tl.tick() : tl.tick2(), this.m_tick, this.m_div))
    }

    //---------------------------------------------------------
    //   dynamic
    //---------------------------------------------------------

    // In MuseScore dynamics are essentially user-defined texts, therefore the ones
    // supported by MusicXML need to be filtered out. Everything not recognized
    // as MusicXML dynamics is written as other-dynamics.

    dynamic(dyn: Dynamic, staff: staff_idx_t): void {
        const validMusicXmlDynamics = new Set<string>([
            'f', 'ff', 'fff', 'ffff', 'fffff', 'ffffff',
            'fp', 'fz',
            'mf', 'mp',
            'p', 'pp', 'ppp', 'pppp', 'ppppp', 'pppppp',
            'rf', 'rfz',
            'sf', 'sffz', 'sfp', 'sfpp', 'sfz',
        ])

        directionTag(this.m_xml, this.m_attr, dyn)

        this.m_xml.startElement('direction-type')

        let tagName = 'dynamics'
        tagName += frame2xml(dyn)
        tagName += color2xml(dyn)
        tagName += ExportMusicXml.positioningAttributes(dyn)
        this.m_xml.startElementRaw(tagName)
        const dynTypeName = TConv.toXmlDynamicType(dyn.dynamicType())
        const hasCustomText = dyn.hasCustomText()

        if (validMusicXmlDynamics.has(dynTypeName) && !hasCustomText) {
            this.m_xml.tagRaw(dynTypeName)
        } else if (dynTypeName) {
            const map = new Map<number, string>([
                [0xE520, 'p'],
                [0xE521, 'm'],
                [0xE522, 'f'],
                [0xE523, 'r'],
                [0xE524, 's'],
                [0xE525, 'z'],
                [0xE526, 'n'],
            ])

            let dynText = dynTypeName
            if (dyn.dynamicType() === DynamicType.OTHER || hasCustomText) {
                dynText = dyn.plainText()
            }

            // collect consecutive runs of either dynamics glyphs
            // or other characters and write the runs.
            let text = ''
            let inDynamicsSym = false
            for (let i = 0; i < dynText.length; ++i) {
                const ch = dynText.charCodeAt(i)
                const it = map.get(ch)
                if (it !== undefined) {
                    // found a SMuFL single letter dynamics glyph
                    if (!inDynamicsSym) {
                        if (text) {
                            this.m_xml.tag('other-dynamics', text)
                            text = ''
                        }
                        inDynamicsSym = true
                    }
                    text += it
                } else {
                    // found a non-dynamics character
                    if (inDynamicsSym) {
                        if (text) {
                            if (validMusicXmlDynamics.has(text)) {
                                this.m_xml.tagRaw(text)
                            } else {
                                // TODO: this is wrong, should be <words>
                                this.m_xml.tag('other-dynamics', text)
                            }
                            text = ''
                        }
                        inDynamicsSym = false
                    }
                    text += dynText[i]
                }
            }
            if (text) {
                if (inDynamicsSym && validMusicXmlDynamics.has(text)) {
                    this.m_xml.tagRaw(text)
                } else {
                    this.m_xml.tag('other-dynamics', text)
                }
            }
        }

        this.m_xml.endElement()

        this.m_xml.endElement()

        const offset = calculateTimeDeltaInDivisions(dyn.tick(), this.tick(), this.m_div)
        if (offset) {
            this.m_xml.tag('offset', offset)
        }

        if (staff) {
            this.m_xml.tag('staff', staff)
        }

        if (dyn.velocity() > 0) {
            this.m_xml.tagRaw(`sound dynamics="${numStr(dyn.velocity() * 100.0 / 90.0, 2)}"`)
        }

        this.m_xml.endElement()
    }

    //---------------------------------------------------------
    //   lyrics
    //---------------------------------------------------------

    private lyrics(ll: readonly Lyrics[], trk: track_idx_t): void {
        for (const l of ll) {
            if (l && l.xmlText()) {
                if (l.track() === trk) {
                    let lyricXml = `lyric number="${l.verse() + 1}"`
                    lyricXml += color2xml(l)
                    lyricXml += ExportMusicXml.positioningAttributes(l)
                    if (!l.visible()) {
                        lyricXml += ' print-object="no"'
                    }
                    if (l.placeAbove()) {
                        lyricXml += ' placement="above"'
                    }
                    this.m_xml.startElementRaw(lyricXml)
                    const syl = l.syllabic()
                    let s = ''
                    switch (syl) {
                    case LyricsSyllabic.SINGLE: s = 'single'
                        break
                    case LyricsSyllabic.BEGIN: s = 'begin'
                        break
                    case LyricsSyllabic.END: s = 'end'
                        break
                    case LyricsSyllabic.MIDDLE: s = 'middle'
                        break
                    default:
                        break
                    }
                    this.m_xml.tag('syllabic', s)
                    const attr = '' // TODO TBD
                    // set the default words format
                    const mtf = this.m_score.style().styleSt(Sid.musicalTextFont)
                    const defFmt = new CharFormat()
                    defFmt.setFontFamily(this.m_score.style().styleSt(l.isEven() ? Sid.lyricsEvenFontFace : Sid.lyricsOddFontFace))
                    defFmt.setFontSize(this.m_score.style().styleD(l.isEven() ? Sid.lyricsEvenFontSize : Sid.lyricsOddFontSize))
                    // write formatted
                    const mttm = new MScoreTextToMusicXml('text', attr, defFmt, mtf)
                    mttm.writeTextFragments(l.fragmentList(), this.m_xml)
                    if (l.ticks().isNotZero()) {
                        this.m_xml.tag('extend')
                    }
                    this.m_xml.endElement()
                }
            }
        }
    }

    //---------------------------------------------------------
    //  repeatAtMeasureStart -- write repeats at begin of measure
    //---------------------------------------------------------

    private repeatAtMeasureStart(attr: Attributes, m: Measure, strack: track_idx_t, etrack: track_idx_t, track: track_idx_t): void {
        // loop over all segments
        for (const e of m.el()) {
            let wtrack = nidx // track to write jump
            if (strack <= e.track() && e.track() < etrack) {
                wtrack = findTrackForAnnotations(e.track(), m.first(SegmentType.ChordRest))
            }
            if (track !== wtrack) {
                continue
            }
            switch (e.type()) {
            case ElementType.MARKER:
            {
                // filter out the markers at measure Start
                const mk = e as unknown as Marker
                const mtp = getEffectiveMarkerType(mk, this.m_jumpElements)

                switch (mtp) {
                case MarkerType.SEGNO:
                case MarkerType.VARSEGNO:
                case MarkerType.CODA:
                case MarkerType.VARCODA:
                case MarkerType.CODETTA:
                    attr.doAttr(this.m_xml, false)
                    directionMarker(this.m_xml, mk, this.m_jumpElements)
                    break
                case MarkerType.FINE:
                case MarkerType.TOCODA:
                case MarkerType.TOCODASYM:
                case MarkerType.DA_CODA:
                case MarkerType.DA_DBLCODA:
                    // ignore
                    break
                case MarkerType.USER:
                    break
                }
            }
                break
            default:
                break
            }
        }
    }

    //---------------------------------------------------------
    //  repeatAtMeasureStop -- write repeats at end of measure
    //---------------------------------------------------------

    private repeatAtMeasureStop(m: Measure, strack: track_idx_t, etrack: track_idx_t, track: track_idx_t): void {
        for (const e of m.el()) {
            let wtrack = nidx // track to write jump
            if (strack <= e.track() && e.track() < etrack) {
                wtrack = findTrackForAnnotations(e.track(), m.first(SegmentType.ChordRest))
            }
            if (track !== wtrack) {
                continue
            }
            switch (e.type()) {
            case ElementType.MARKER:
            {
                // filter out the markers at measure stop
                const mk = e as unknown as Marker
                const mtp = getEffectiveMarkerType(mk, this.m_jumpElements)

                switch (mtp) {
                case MarkerType.FINE:
                case MarkerType.TOCODA:
                case MarkerType.TOCODASYM:
                case MarkerType.DA_CODA:
                case MarkerType.DA_DBLCODA:
                    directionMarker(this.m_xml, mk, this.m_jumpElements)
                    break
                case MarkerType.SEGNO:
                case MarkerType.VARSEGNO:
                case MarkerType.CODA:
                case MarkerType.VARCODA:
                case MarkerType.CODETTA:
                    // ignore
                    break
                case MarkerType.USER:
                    break
                }
            }
                break
            case ElementType.JUMP:
                directionJump(this.m_xml, e as unknown as Jump)
                break
            default:
                break
            }
        }
    }

    //---------------------------------------------------------
    //  work -- write the <work> element
    //  note that order must be work-number, work-title
    //  also write <movement-number> and <movement-title>
    //  data is taken from the score metadata instead of the Text elements
    //---------------------------------------------------------

    private work(_measure: MeasureBase | null): void {
        const workTitle = this.m_score.metaTag('workTitle')
        const workNumber = this.m_score.metaTag('workNumber')
        if (!(!workTitle && !workNumber)) {
            this.m_xml.startElement('work')
            if (workNumber) {
                this.m_xml.tag('work-number', workNumber)
            }
            if (workTitle) {
                this.m_xml.tag('work-title', workTitle)
            }
            this.m_xml.endElement()
        }
        if (this.m_score.metaTag('movementNumber')) {
            this.m_xml.tag('movement-number', this.m_score.metaTag('movementNumber'))
        }
        if (this.m_score.metaTag('movementTitle')) {
            this.m_xml.tag('movement-title', this.m_score.metaTag('movementTitle'))
        }
    }

    //---------------------------------------------------------
    //  keysigTimesig
    //---------------------------------------------------------

    /**
     Output attributes at start of measure: key, time
     */

    private keysigTimesig(m: Measure, p: Part): void {
        const strack = p.startTrack()
        const etrack = p.endTrack()

        // search all staves for non-generated time and key signatures
        const keysigs = new Map<staff_idx_t, KeySig>() // map staff to key signature
        const timesigs = new Map<staff_idx_t, TimeSig>() // map staff to time signature
        for (let seg = m.first(); seg; seg = seg.next()) {
            if (seg.tick().gt(m.tick())) {
                break
            }
            for (let t = strack; t < etrack; t += VOICES) {
                const el = seg.element(t)
                if (!el) {
                    continue
                }
                if (el.isKeySig()) {
                    const st = Math.trunc((t - strack) / VOICES)
                    if (!el.generated()) {
                        keysigs.set(st, el as KeySig)
                    }
                }

                if (el.isTimeSig()) {
                    const st = Math.trunc((t - strack) / VOICES)
                    if (!el.generated()) {
                        timesigs.set(st, el as TimeSig)
                    }
                }
            }
        }

        // write the key signatues
        if (keysigs.size) {
            // determine if all staves have a keysig and all keysigs are identical
            // in that case a single <key> is written, without number=... attribute
            const nstaves = p.nstaves()
            let singleKey = true
            // check if all staves have a keysig
            for (let i = 0; i < nstaves; i++) {
                if (!keysigs.has(i)) {
                    singleKey = false
                }
            }
            // check if all keysigs are identical
            if (singleKey) {
                for (let i = 1; i < nstaves; i++) {
                    if (!(keysigs.get(i)!.key() === keysigs.get(0)!.key())) {
                        singleKey = false
                    }
                }
            }
            if (singleKey) {
                const keyPrintObject = (ks: KeySig): boolean => {
                    return !ks.visible() || (!!ks.staff() && ks.staff()!.isTabStaff(ks.tick()))
                }
                for (let i = 1; i < nstaves; i++) {
                    if (keyPrintObject(keysigs.get(i)!) !== keyPrintObject(keysigs.get(0)!)) {
                        singleKey = false
                        break
                    }
                }
            }

            // write the keysigs
            if (singleKey) {
                // keysig applies to all staves
                this.keysig(keysigs.get(0)!, p.staff(0)!.clef(m.tick()), 0)
            } else {
                // staff-specific keysigs
                for (const st of [...keysigs.keys()].sort((a, b) => a - b)) {
                    this.keysig(keysigs.get(st)!, p.staff(st)!.clef(m.tick()), st + 1)
                }
            }
        } else {
            // always write a keysig at tick = 0
            if (m.tick().isZero()) {
                const ks = new KeySig(scoreDummy(this.m_score).segment())
                if (p.staff(0)!.isTabStaff(new Fraction(0, 1))) {
                    ks.setVisible(false)
                }
                ks.setKey(Key.C)
                this.keysig(ks, p.staff(0)!.clef(m.tick()))
            }
        }

        // write the time signatues
        if (timesigs.size) {
            // determine if all staves have a timesig and all timesigs are identical
            // in that case a single <time> is written, without number=... attribute
            const nstaves = p.nstaves()
            let singleTime = true
            // check if all staves have a keysig
            for (let i = 0; i < nstaves; i++) {
                if (!timesigs.has(i)) {
                    singleTime = false
                }
            }
            // check if all timesigs are identical
            if (singleTime) {
                for (let i = 1; i < nstaves; i++) {
                    if (!(timesigs.get(i)!.sig().identical(timesigs.get(0)!.sig()))) {
                        singleTime = false
                        break
                    }
                }
            }
            if (singleTime) {
                const timePrintObject = (ts: TimeSig): boolean => {
                    return !ts.visible() || !ts.showOnThisStaff()
                           || (!!ts.staff() && !ts.staff()!.staffType(ts.tick())!.genTimesig())
                }
                for (let i = 1; i < nstaves; i++) {
                    if (timePrintObject(timesigs.get(i)!) !== timePrintObject(timesigs.get(0)!)) {
                        singleTime = false
                        break
                    }
                }
            }

            // write the timesigs
            if (singleTime) {
                // timesig applies to all staves
                this.timesig(timesigs.get(0)!, 0)
            } else {
                // staff-specific timesig
                for (const st of [...timesigs.keys()].sort((a, b) => a - b)) {
                    this.timesig(timesigs.get(st)!, st + 1)
                }
            }
        }
    }

    //---------------------------------------------------------
    //  identification -- write the identification
    //---------------------------------------------------------

    private identification(xml: XmlWriter, score: Score): void {
        xml.startElement('identification')

        // the creator types commonly found in MusicXML
        const metaTagNames = new Set<string>(['arranger', 'composer', 'lyricist', 'poet', 'translator'])
        for (const type of [...metaTagNames].sort()) {
            const creator = score.metaTag(type)
            if (creator) {
                xml.tag('creator', [['type', type]], creator)
            }
        }

        if (score.metaTag('copyright')) {
            xml.tag('rights', score.metaTag('copyright'))
            metaTagNames.add('copyright')
        }

        xml.startElement('encoding')

        const encoder = score.metaTag('encoder')
        if (encoder) {
            xml.tag('encoder', encoder)
        }

        if (MScore.debugMode) {
            xml.tag('software', 'MuseScore 0.7.0')
            xml.tag('encoding-date', '2007-09-10')
        } else {
            xml.tag('software', 'MuseScore Studio ' + PROGRAM_VERSION)
            xml.tag('encoding-date', currentDateIso())
        }

        // specify supported elements
        xml.tag('supports', [['element', 'accidental'], ['type', 'yes']])
        xml.tag('supports', [['element', 'beam'], ['type', 'yes']])
        // set support for print new-page and new-system to match user preference
        // for MusicXmlExportBreaks::MANUAL support is "no" because "yes" breaks Finale NotePad import
        const breaksType = ExportMusicXml.configuration().exportBreaksType()
        if (ExportMusicXml.configuration().exportLayout() && breaksType === MusicXmlExportBreaksType.All) {
            xml.tag('supports', [['element', 'print'], ['attribute', 'new-page'], ['type', 'yes'], ['value', 'yes']])
            xml.tag('supports', [['element', 'print'], ['attribute', 'new-system'], ['type', 'yes'], ['value', 'yes']])
        } else {
            xml.tag('supports', [['element', 'print'], ['attribute', 'new-page'], ['type', 'no']])
            xml.tag('supports', [['element', 'print'], ['attribute', 'new-system'], ['type', 'no']])
        }
        xml.tag('supports', [['element', 'stem'], ['type', 'yes']])

        xml.endElement()

        if (score.metaTag('source')) {
            xml.tag('source', score.metaTag('source'))
            metaTagNames.add('source')
        }

        if (!MScore.debugMode) {
            // do not write miscellaneous in debug mode
            for (const n of ['workTitle', 'workNumber', 'movementTitle', 'movementNumber', 'originalFormat']) {
                metaTagNames.add(n)
            }
            xml.startElement('miscellaneous')
            // C++ std::map<String, String>: sorted by name
            const tags = [...score.metaTags()].sort((a, b) => (a[0] < b[0] ? -1 : a[0] > b[0] ? 1 : 0))
            for (const [name, value] of tags) {
                if (metaTagNames.has(name)) {
                    continue
                } else if (value) {
                    xml.tag('miscellaneous-field', [['name', name]], value)
                }
            }
            xml.endElement()
        }

        xml.endElement()
    }

    //---------------------------------------------------------
    //  print
    //---------------------------------------------------------

    /**
     Handle the <print> element.
     When exporting layout and all breaks, a <print> with layout information
     is generated for the first measure in the score, in a system or on a page.
     When exporting layout but only manual or no breaks, a <print> with
     layout information is generated only for the first measure in the score,
     as it is assumed the system layout is broken by the importing application
     anyway and is thus useless.

     a page break is explicit (manual) if:
     - the last system on the previous page has a page break
     a system break is explicit (manual) if:
     - the previous system in the score has a system or layout break
     - if the previous system in the score does not have measures
       (i.e. only has (a) frame(s))
     */

    private print(m: Measure, partNr: number, firstStaffOfPart: number, nrStavesInPart: number, mpc: MeasurePrintContext): void {
        const prevSysMB = lastMeasureBase(mpc.prevSystem)

        const prevMeasLineBreak = prevSysMB ? prevSysMB.lineBreak() : false
        const prevMeasSectionBreak = prevSysMB ? prevSysMB.sectionBreak() : false
        const prevPageBreak = hasPageBreak(mpc.lastSystemPrevPage)

        const attributes: Array<[string, string | number]> = []

        const exportBreaksType = ExportMusicXml.configuration().exportBreaksType()
        if (!mpc.scoreStart) {
            if (exportBreaksType === MusicXmlExportBreaksType.All) {
                if (mpc.pageStart) {
                    attributes.push(['new-page', 'yes'])
                } else if (mpc.systemStart) {
                    attributes.push(['new-system', 'yes'])
                }
            } else if (exportBreaksType === MusicXmlExportBreaksType.Manual) {
                if (mpc.pageStart && prevPageBreak) {
                    attributes.push(['new-page', 'yes'])
                } else if (mpc.systemStart && (prevMeasLineBreak || prevMeasSectionBreak)) {
                    attributes.push(['new-system', 'yes'])
                }
            }
        }

        const doBreak = mpc.scoreStart || attributes.length > 0
        const doLayout = ExportMusicXml.configuration().exportLayout()

        if (mpc.pageStart) {
            const exportPageNo = exportBreaksType === MusicXmlExportBreaksType.All
                                 || (exportBreaksType === MusicXmlExportBreaksType.Manual && mpc.pageStart
                                     && prevPageBreak)
            if (exportPageNo && mpc.writePageNo) {
                // C++ size_t: a negative page number (page number offset) wraps around
                attributes.push(['page-number', mpc.pageNumber < 0 ? BigInt.asUintN(64, BigInt(mpc.pageNumber)).toString() : mpc.pageNumber])
            }
        }

        if (doBreak && doLayout) {
            this.m_xml.startElement('print', attributes)
            const style = this.score().style()
            const pageWidth = this.getTenthsFromInches(style.styleD(Sid.pageWidth))
            const lm = this.getTenthsFromInches(style.styleD(Sid.pageOddLeftMargin))
            const rm = this.getTenthsFromInches(style.styleD(Sid.pageWidth)
                                                - style.styleD(Sid.pagePrintableWidth)
                                                - style.styleD(Sid.pageOddLeftMargin))
            const tm = this.getTenthsFromInches(style.styleD(Sid.pageOddTopMargin))

            // System Layout

            // For a multi-measure rest positioning is valid only
            // in the replacing measure
            // note: for a normal measure, mmRest1 is the measure itself,
            // for a multi-measure rest, it is the replacing measure
            const mmR1 = m.coveringMMRestOrThis()
            const system = mmR1.system()!

            // Put the system print suggestions only for the first part in a score...
            if (partNr === 0) {
                // Find the right margin of the system.
                const systemLM = this.getTenthsFromDots(mmR1.pagePos().x() - system.page()!.pagePos().x()) - lm
                const systemRM = pageWidth - rm - (this.getTenthsFromDots(system.ldata().bbox().width()) + lm)

                this.m_xml.startElement('system-layout')
                this.m_xml.startElement('system-margins')
                this.m_xml.tag('left-margin', numStr(systemLM, 2))
                this.m_xml.tag('right-margin', numStr(systemRM, 2))
                this.m_xml.endElement()

                if (mpc.systemStart && !mpc.pageStart) {
                    // see System::layout2() for the factor 2 * score()->spatium()
                    const prevSystemMeasure = mpc.prevMeasure!.coveringMMRestOrThis()
                    const sysDist = this.getTenthsFromDots(mmR1.pagePos().y()
                                                           - prevSystemMeasure.pagePos().y()
                                                           - prevSystemMeasure.ldata().bbox().height()
                                                           + 2 * this.score().style().spatium()
                    )
                    this.m_xml.tag('system-distance', numStr(sysDist, 2))
                }

                if (mpc.pageStart || mpc.scoreStart) {
                    const topSysDist = this.getTenthsFromDots(mmR1.pagePos().y()) - tm
                    this.m_xml.tag('top-system-distance', numStr(topSysDist, 2))
                }

                this.m_xml.endElement()
            }

            // Staff layout elements.
            for (let staffIdx = (firstStaffOfPart === 0) ? 1 : 0; staffIdx < nrStavesInPart; ++staffIdx) {
                // calculate distance between this and previous staff using the bounding boxes
                const staffNr = firstStaffOfPart + staffIdx
                const prevStaffNr = system.prevVisibleStaff(staffNr)
                if (prevStaffNr === nidx) {
                    continue
                }
                if (!system.staff(staffNr)!.show()) {
                    this.m_hiddenStaves.push(staffIdx)
                    continue
                }
                const prevBbox = system.staff(prevStaffNr)!.bbox()
                const staffDist = system.staff(staffNr)!.bbox().y() - prevBbox.y() - prevBbox.height()

                if (staffDist > 0) {
                    this.m_xml.startElement('staff-layout', [['number', staffIdx + 1]])
                    this.m_xml.tag('staff-distance', numStr(this.getTenthsFromDots(staffDist), 2))
                    this.m_xml.endElement()
                } else {
                    this.m_hiddenStaves.push(staffIdx)
                }
            }

            // Measure layout elements.
            if (m.prev() && m.prev()!.isHBox()) {
                this.measureLayout(m.prev()!.width())
            }

            this.m_xml.endElement()
        } else if (attributes.length) {
            this.m_xml.tag('print', attributes)
        } else if (m.prev() && m.prev()!.isHBox()) {
            this.m_xml.startElement('print')
            this.measureLayout(m.prev()!.width())
            this.m_xml.endElement()
        }
    }

    //---------------------------------------------------------
    //  measureLayout
    //---------------------------------------------------------

    private measureLayout(distance: number): void {
        this.m_xml.startElement('measure-layout')
        this.m_xml.tag('measure-distance', numStr(this.getTenthsFromDots(distance), 2))
        this.m_xml.endElement()
    }

    //---------------------------------------------------------
    //  exportDefaultClef
    //---------------------------------------------------------

    /**
     In case no clef is found, export a default clef with type determined by staff type.
     Note that a multi-measure rest starting in the first measure should be handled correctly.
     */

    private exportDefaultClef(part: Part, m: Measure): void {
        const staves = part.nstaves()

        if (m.tick().eq(new Fraction(0, 1))) {
            const clefSeg = m.findSegment(SegmentType.HeaderClef, new Fraction(0, 1))

            if (clefSeg) {
                for (let i = 0; i < staves; ++i) {
                    // sstaff - xml staff number, counting from 1 for this
                    // instrument
                    // special number 0 -> don’t show staff number in
                    // xml output (because there is only one staff)

                    const sstaff = (staves > 1) ? i + 1 : 0
                    const track = part.startTrack() + VOICES * i

                    if (clefSeg.element(track) === null) {
                        let ct = ClefType.G
                        switch (part.staff(i)!.staffType(new Fraction(0, 1))!.group()) {
                        case StaffGroup.TAB:
                            ct = ClefType.TAB
                            break
                        case StaffGroup.STANDARD:
                            ct = ClefType.G
                            break
                        case StaffGroup.PERCUSSION:
                            ct = ClefType.PERC
                            break
                        }
                        this.clef(sstaff, ct, ' print-object="no"')
                    }
                }
            }
        }
    }

    //---------------------------------------------------------
    //  findAndExportClef
    //---------------------------------------------------------

    /**
     Make sure clefs at end of measure get exported at start of next measure.
     */

    private findAndExportClef(m: Measure, staves: number, strack: track_idx_t, etrack: track_idx_t): void {
        const prevMeasure = m.prevMeasure()
        const mmR = m.mmRest() // the replacing measure in a multi-measure rest
        const tick = m.tick()
        let cs1: Segment | null
        const cs2 = m.findSegment(SegmentType.Clef, tick)
        let cs3: Segment | null
        let seg: Segment | null = null

        if (prevMeasure) {
            cs1 = prevMeasure.findSegment(SegmentType.Clef, tick)
        } else {
            cs1 = m.findSegment(SegmentType.HeaderClef, tick)
        }

        if (mmR) {
            cs3 = mmR.findSegment(SegmentType.HeaderClef, tick)
            if (!cs3) {
                cs3 = mmR.findSegment(SegmentType.Clef, tick)
            }
        } else {
            cs3 = null
        }

        if (cs1 && cs2) {
            // should only happen at begin of new system
            // when previous system ends with a non-generated clef
            seg = cs1
        } else if (cs1) {
            seg = cs1
        } else if (cs3) {
            // happens when the first measure is a multi-measure rest
            // containing a generated clef
            seg = cs3
        } else {
            seg = cs2
        }

        // output attribute at start of measure: clef
        if (seg) {
            for (let st = strack; st < etrack; st += VOICES) {
                // sstaff - xml staff number, counting from 1 for this
                // instrument
                // special number 0 -> don’t show staff number in
                // xml output (because there is only one staff)

                let sstaff = (staves > 1) ? st - strack + VOICES : 0
                sstaff = Math.trunc(sstaff / VOICES)

                const cle = seg.element(st) as Clef | null
                if (cle) {
                    // output only clef changes, not generated clefs at line beginning
                    // exception: at tick=0, export clef anyway
                    if ((tick.isZero() || !cle.generated())
                        && ((seg.measure() !== m) || ((seg.segmentType() === SegmentType.HeaderClef) && !cle.otherClef()))) {
                        let clefAttr = color2xml(cle)
                        if (!cle.visible()
                            || (cle.staff() && !cle.staff()!.staffType(cle.tick())!.genClef())) {
                            clefAttr += ' print-object="no"'
                        }
                        this.clef(sstaff, cle.clefType(), clefAttr)
                    }
                }
            }
        }
    }

    //---------------------------------------------------------
    //  writeElement
    //---------------------------------------------------------

    /**
     Write \a el.
     */

    private writeElement(el: EngravingItem, m: Measure, sstaff: staff_idx_t, useDrumset: boolean): void {
        if (el.isClef()) {
            // output only clef changes, not generated clefs
            // at line beginning
            // also ignore clefs at the start of a measure,
            // these have already been output
            // also ignore clefs at the end of a measure
            // these will be output at the start of the next measure
            const cle = el as Clef
            const ti = cle.segment()!.tick()
            const visible
                = (!cle.visible() || (cle.staff() && !cle.staff()!.staffType(cle.tick())!.genClef())) ? ' print-object="no"' : ''
            if (el.generated()) {
                // generated clef not exported
            } else if (!el.generated() && tickIsInMiddleOfMeasure(ti, m)) {
                this.clef(sstaff, cle.clefType(), color2xml(cle) + visible)
            } else if (!el.generated() && ti.eq(m.tick()) && (cle.segment()!.segmentType() !== SegmentType.HeaderClef)) {
                this.clef(sstaff, cle.clefType(), color2xml(cle) + visible + ' after-barline="yes"')
            } else {
                // clef not exported
            }
        } else if (el.isChord()) {
            const c = el as Chord
            // ise grace after
            if (c) {
                const ll = c.lyrics()
                for (const g of c.graceNotesBefore()) {
                    this.chord(g, sstaff, ll, useDrumset)
                }
                this.chord(c, sstaff, ll, useDrumset)
                for (const g of c.graceNotesAfter()) {
                    this.chord(g, sstaff, ll, useDrumset)
                }
            }
        } else if (el.isRest()) {
            const r = el as Rest
            if (!(r.isGap())) {
                const ll = r.lyrics()
                this.rest(r, sstaff, ll)
            }
        } else if (el.isBarLine()) {
            const barln = el as BarLine
            if (tickIsInMiddleOfMeasure(barln.tick(), m)) {
                this.barlineMiddle(barln)
            }
        } else if (el.isKeySig() || el.isTimeSig() || el.isBreath() || el.isTimeTickAnchor()) {
            // handled elsewhere
        } else {
            // unknown segment type
        }
    }

    //---------------------------------------------------------
    //  writeInstrumentChange
    //---------------------------------------------------------

    /**
     Write the instrument change.
     */

    writeInstrumentChange(instrChange: InstrumentChange): void {
        const instr = instrChange.instrument()
        const part = instrChange.part()!
        const partNr = this.m_score.parts().indexOf(part)
        const instNr = this.m_instrMap.get(instr) ?? -1
        const longName = instr.nameAsPlainText()
        const shortName = instr.abbreviatureAsPlainText()

        // Instrument changes could happen anywhere in the measure, so we close the initial attributes in any case
        this.m_attr.stop(this.m_xml)
        this.m_xml.startElement('print')
        if (longName) {
            this.m_xml.startElement('part-name-display')
            writeDisplayName(this.m_xml, longName)
            this.m_xml.endElement()
        }
        if (shortName) {
            this.m_xml.startElement('part-abbreviation-display')
            writeDisplayName(this.m_xml, shortName)
            this.m_xml.endElement()
        }
        this.m_xml.endElement()

        this.writeInstrumentDetails(instr, this.m_score.style().styleB(Sid.concertPitch))

        this.m_xml.startElement('sound')
        if (instr.musicXmlId()) {
            this.m_xml.startElementRaw(`instrument-change ${instrId(partNr + 1, instNr + 1)}`)
            this.m_xml.tag('instrument-sound', instr.musicXmlId())
            this.m_xml.endElement()
        } else {
            this.m_xml.tagRaw(`instrument-change ${instrId(partNr + 1, instNr + 1)}`)
        }
        this.m_xml.endElement()
    }

    //---------------------------------------------------------
    //  writeInstrumentDetails
    //---------------------------------------------------------

    /**
     Write the instrument details for \a instrument.
     */

    writeInstrumentDetails(instrument: Instrument, concertPitch: boolean): void {
        if (instrument.transpose().chromatic) {
            this.m_attr.doAttr(this.m_xml, true)
            if (concertPitch) {
                this.m_xml.startElement('for-part')
                this.m_xml.startElement('part-transpose')
            } else {
                this.m_xml.startElement('transpose')
            }
            this.m_xml.tag('diatonic', cInt(instrument.transpose().diatonic % 7))
            this.m_xml.tag('chromatic', cInt(instrument.transpose().chromatic % 12))
            const octaveChange = cInt(instrument.transpose().chromatic / 12)
            if (octaveChange) {
                this.m_xml.tag('octave-change', octaveChange)
            }
            this.m_xml.endElement()
            if (concertPitch) {
                this.m_xml.endElement()
            }
            this.m_attr.doAttr(this.m_xml, false)
        }
    }

    //---------------------------------------------------------
    //  writeMeasureTracks
    //---------------------------------------------------------

    /**
     Write data contained in the measure's tracks.
     */

    private writeMeasureTracks(m: Measure, partIndex: number, strack: track_idx_t, partRelStaffNo: staff_idx_t,
        useDrumset: boolean, isLastStaffOfPart: boolean, fbMap: FigBassMap, spannersStopped: Set<Spanner>): void {
        const tboxesAbove = findTextFramesToWriteAsWordsAbove(m)
        const tboxesBelow = findTextFramesToWriteAsWordsBelow(m)

        const etrack = strack + VOICES
        for (let track = strack; track < etrack; ++track) {
            for (let seg = m.first(); seg; seg = seg.next()) {
                if (seg.isTimeTickType()) {
                    // Prefer to start/stop spanners on a chordrest segment where one is available
                    const crSeg = this.m_score.tick2leftSegment(seg.tick())
                    if (crSeg && crSeg.tick().eq(seg.tick())) {
                        let staffHasCR = false
                        for (let t = strack; t < etrack; ++t) {
                            if (crSeg.element(t)) {
                                staffHasCR = true
                                break
                            }
                        }
                        if (staffHasCR) {
                            continue
                        }
                    }
                    spannerStart(this, strack, etrack, track, partRelStaffNo, seg)

                    const spannerStaff = track2staff(track)
                    const starttrack = staff2track(spannerStaff)
                    const endtrack = staff2track(spannerStaff + 1)
                    spannerStop(this, starttrack, endtrack, seg.tick(), partRelStaffNo, spannersStopped)

                    // We check if there are additional annotations
                    for (const annotation of seg.annotations()) {
                        if (annotation.track() !== track || !annotation.isTextBase()) {
                            continue
                        }
                        // Just to include them
                        annotations(this, strack, etrack, track, partRelStaffNo, seg)
                    }
                    continue
                }
                const el = seg.element(track)
                if (!el) {
                    continue
                }
                // must ignore start repeat to prevent spurious backup/forward
                if (el.isBarLine() && (el as BarLine).barLineType() === BarLineType.START_REPEAT) {
                    continue
                }

                // generate backup or forward to the start time of the element
                this.moveToTickIfNeed(seg.tick(), track, m.tick())

                const ic = seg.findAnnotation(ElementType.INSTRUMENT_CHANGE, strack, etrack - 1)
                if (ic && (track === strack)) {
                    const instrChange = ic as unknown as InstrumentChange
                    this.writeInstrumentChange(instrChange)
                }

                // handle annotations and spanners (directions attached to this note or rest)
                if (el.isChordRest()) {
                    this.m_attr.doAttr(this.m_xml, false)
                    const isFirstPart = (partIndex === 0)
                    const isLastPart = (partIndex === (this.m_score.parts().length - 1))
                    if (!this.m_tboxesAboveWritten && isFirstPart) {
                        for (const tbox of tboxesAbove) {
                            // note: use mmRest1() to get at a possible multi-measure rest,
                            // as the covered measure would be positioned at 0,0.
                            this.tboxTextAsWords(tbox.text(), 0,
                                tbox.text().canvasPos().minus(m.coveringMMRestOrThis().canvasPos()))
                        }
                        this.m_tboxesAboveWritten = true
                    }
                    if (!this.m_tboxesBelowWritten && isLastPart && isLastStaffOfPart) {
                        for (const tbox of tboxesBelow) {
                            const lastStaffNr = track2staff(track)
                            const sys = m.coveringMMRestOrThis().system()!
                            const textPos = tbox.text().canvasPos().minus(m.coveringMMRestOrThis().canvasPos())
                            if (lastStaffNr < sys.staves().length) {
                                // convert to position relative to last staff of system
                                textPos.setY(textPos.y() - (sys.staffCanvasYpage(lastStaffNr) - sys.staffCanvasYpage(0)))
                            }
                            this.tboxTextAsWords(tbox.text(), partRelStaffNo, textPos)
                        }
                        this.m_tboxesBelowWritten = true
                    }
                    harmonies(this, track, seg)
                    annotations(this, strack, etrack, track, partRelStaffNo, seg)
                    figuredBass(this.m_xml, strack, etrack, track, el as ChordRest, fbMap, this.m_div)
                    spannerStart(this, strack, etrack, track, partRelStaffNo, seg)
                }

                // write element el if necessary
                this.writeElement(el, m, partRelStaffNo, useDrumset)

                // handle annotations and spanners (directions attached to this note or rest)
                if (el.isChordRest()) {
                    const spannerStaff = track2staff(track)
                    const starttrack = staff2track(spannerStaff)
                    const endtrack = staff2track(spannerStaff + 1)
                    spannerStop(this, starttrack, endtrack, this.m_tick, partRelStaffNo, spannersStopped)
                }
            } // for (Segment* seg = ...
            this.m_attr.stop(this.m_xml)
        } // for (int st = ...
    }

    //---------------------------------------------------------
    //  writeMeasureStaves
    //---------------------------------------------------------

    /**
     Write each staff of a measure for a given part.
     */

    private writeMeasureStaves(m: Measure, partIndex: number, startStaff: staff_idx_t, nstaves: number,
        useDrumset: boolean, fbMap: FigBassMap, spannersStopped: Set<Spanner>): void {
        const endStaff = startStaff + nstaves
        const origM = m
        this.m_tboxesAboveWritten = false
        this.m_tboxesBelowWritten = false
        this.m_measArpeggios.clear()

        for (let staffIdx = startStaff; staffIdx < endStaff; ++staffIdx) {
            // some staves may need to make m point somewhere else, so just in case, ensure start in same place
            if (m !== origM) {
                return
            }
            this.moveToTick(m.tick()) // move tick to start of measure

            const partRelStaffNo = (nstaves > 1 ? staffIdx - startStaff + 1 : 0) // xml staff number, counting from 1 for this instrument
            // special number 0 -> don’t show staff number in xml output
            // (because there is only one staff)

            // in presence of a MeasureRepeat, adjust m to point to the actual content being repeated
            if (m.isMeasureRepeatGroup(staffIdx)) {
                let mr: MeasureRepeat | null = null
                while (m.isMeasureRepeatGroup(staffIdx) && m.prevMeasure()) { // keep going back until out of measure repeat groups
                    mr = m.measureRepeatElement(staffIdx)
                    if (!mr) {
                        break
                    }

                    for (let i = 0; i < mr.numMeasures() && m.prevMeasure(); ++i) {
                        m = m.prevMeasure()!
                    }
                }
            }
            // in case m was changed, also rewind _tick so as not to generate unnecessary backup/forward tags
            const tickDelta = this.m_tick.minus(m.tick())
            this.m_tick = this.m_tick.minus(tickDelta)

            const isLastStaffOfPart = (endStaff - 1 <= staffIdx) // for writing tboxes below

            this.writeMeasureTracks(m, partIndex, staff2track(staffIdx), partRelStaffNo, useDrumset, isLastStaffOfPart, fbMap, spannersStopped)

            // restore m and _tick before advancing to next staff in part
            m = origM
            this.m_tick = this.m_tick.plus(tickDelta)
            if (!isLastStaffOfPart) {
                // move tick to start of measure, generates backup to next staff, needs this staff's stretch
                this.moveToTick(m.tick(), stretch(this.m_score, staffIdx * VOICES, m.tick()))
            }
        }
    }

    //---------------------------------------------------------
    //  writeMeasure
    //---------------------------------------------------------

    /**
     Write a measure.
     */

    private writeMeasure(m: Measure, partIndex: number, staffCount: number, mnsh: MeasureNumberStateHandler, fbMap: FigBassMap,
        mpc: MeasurePrintContext, spannersStopped: Set<Spanner>): void {
        const part = this.m_score.parts()[partIndex]
        const staves = part.nstaves()
        const strack = part.startTrack()
        const etrack = part.endTrack()

        // pickup and other irregular measures need special care
        let measureTag = 'measure'
        mnsh.updateForMeasure(m)
        measureTag += mnsh.measureNumber()
        const isFirstActualMeasure = mnsh.isFirstActualMeasure()

        if (ExportMusicXml.configuration().exportLayout()) {
            measureTag += ` width="${numStr(m.ldata().bbox().width() / DPMM / this.m_millimeters * this.m_tenths, 2)}"`
        }

        this.m_xml.startElementRaw(measureTag)

        this.print(m, partIndex, staffCount, staves, mpc)

        this.m_attr.start()

        findTrills(m, strack, etrack, this.m_trillStart, this.m_trillStop)

        // barline left must be the first element in a measure
        this.barlineLeft(m, strack)

        // output attributes with the first actual measure (pickup or regular)
        if (isFirstActualMeasure) {
            this.m_attr.doAttr(this.m_xml, true)
            this.m_xml.tag('divisions', this.m_div)
        }

        // output attributes at start of measure: key, time
        this.keysigTimesig(m, part)

        // output attributes with the first actual measure (pickup or regular) only
        if (isFirstActualMeasure) {
            if (staves > 1) {
                this.m_xml.tag('staves', staves)
            }

            if (this.m_instrMap.size > 1) {
                this.m_xml.tag('instruments', this.m_instrMap.size)
            }
        }

        // make sure clefs at end of measure get exported at start of next measure
        this.findAndExportClef(m, staves, strack, etrack)

        // make sure a clef gets exported if none is found
        this.exportDefaultClef(part, m)

        // output attributes with the first actual measure (pickup or regular) only
        if (isFirstActualMeasure) {
            writeStaffDetails(this.m_xml, part, this.m_hiddenStaves)
            this.writeInstrumentDetails(part.instrument(), this.m_score.style().styleB(Sid.concertPitch))
        } else {
            for (const staffIdx of this.m_hiddenStaves) {
                this.m_attr.doAttr(this.m_xml, true)
                const attributes: Array<[string, string | number]> = []
                if (staves > 1) {
                    attributes.push(['number', staffIdx + 1])
                }
                attributes.push(['print-object', 'no'])
                if (part.staff(staffIdx)!.cutaway()) {
                    attributes.push(['print-spacing', 'yes'])
                }
                this.m_xml.tag('staff-details', attributes)
                this.m_attr.doAttr(this.m_xml, false)
            }
        }
        this.m_hiddenStaves = []

        // output attribute at start of measure: measure-style
        measureStyle(this.m_xml, this.m_attr, m, partIndex)

        // MuseScore limitation: repeats are always in the first part
        // and are implicitly placed at either measure start or stop
        if (partIndex === 0) {
            this.repeatAtMeasureStart(this.m_attr, m, strack, etrack, strack)
        }

        // write data in the staves
        this.writeMeasureStaves(m, partIndex, track2staff(strack), staves, part.instrument().useDrumset(), fbMap, spannersStopped)

        // write the annotations that could not be attached to notes
        annotationsWithoutNote(this, strack, staves, m)

        // move to end of measure (in case of incomplete last voice)
        this.moveToTick(m.endTick(), stretch(this.m_score, etrack - 1, m.tick()))
        if (partIndex === 0) {
            this.repeatAtMeasureStop(m, strack, etrack, strack)
        }
        // note: don't use "m->repeatFlags() & Repeat::END" here, because more
        // barline types need to be handled besides repeat end ("light-heavy")
        this.barlineRight(m, strack, etrack)
        this.m_xml.endElement()
    }

    private shouldWritePageNo(page: Page): boolean {
        const style = this.m_score.style()
        const n = page.pageNumber() + 1 + this.m_score.pageNumberOffset()

        const macroPrintPageNo = (sid: Sid): boolean => {
            const text = style.styleSt(sid)
            // String::search(\$([p|N|P]), { 1 }, SkipEmptyParts)
            const pageNo = /\$([p|N|P])/g
            let m: RegExpExecArray | null
            while ((m = pageNo.exec(text)) !== null) {
                const c = m[1]
                if ((c === 'P')
                    || (c === 'p' && page.pageNumber() > 0)
                    || (c === 'N' && (page.pageNumber() + this.m_score.pageNumberOffset() > 0 || this.m_score.npages() > 1))) {
                    return true
                }
            }
            return false
        }

        if (style.styleB(Sid.showHeader) && (page.pageNumber() || style.styleB(Sid.headerFirstPage))) {
            const odd = (n & 1) || !style.styleB(Sid.headerOddEven)

            const oddHeaders = [Sid.oddHeaderL, Sid.oddHeaderC, Sid.oddHeaderR]
            const evenHeaders = [Sid.evenHeaderL, Sid.evenHeaderC, Sid.evenHeaderR]

            for (const sid of odd ? oddHeaders : evenHeaders) {
                if (macroPrintPageNo(sid)) {
                    return true
                }
            }
        }

        if (style.styleB(Sid.showFooter) && (page.pageNumber() || style.styleB(Sid.footerFirstPage))) {
            const odd = (n & 1) || !style.styleB(Sid.footerOddEven)

            const oddFooters = [Sid.oddFooterL, Sid.oddFooterC, Sid.oddFooterR]
            const evenFooters = [Sid.evenFooterL, Sid.evenFooterC, Sid.evenFooterR]

            for (const sid of odd ? oddFooters : evenFooters) {
                if (macroPrintPageNo(sid)) {
                    return true
                }
            }
        }

        return false
    }

    //---------------------------------------------------------
    //  writeParts
    //---------------------------------------------------------

    /**
     Write all parts.
     */

    private writeParts(): void {
        let staffCount = 0
        const parts = this.m_score.parts()

        for (let partIndex = 0; partIndex < parts.length; ++partIndex) {
            const part = parts[partIndex]
            this.m_gh.reset() // reset glissando handler state for each part
            this.m_tick = new Fraction(0, 1)
            this.m_xml.startElementRaw(`part id="P${partIndex + 1}"`)

            this.m_trillStart.clear()
            this.m_trillStop.clear()
            initInstrMap(this.m_instrMap, part.instruments().values())

            const mnsh = new MeasureNumberStateHandler()
            const fbMap: FigBassMap = new Map() // pending figured bass extends

            // set of spanners already stopped in this part
            // required to prevent multiple spanner stops for the same spanner
            const spannersStopped = new Set<Spanner>()

            const pages = this.m_score.pages()
            const mpc = new MeasurePrintContext()

            for (let pageIndex = 0; pageIndex < pages.length; ++pageIndex) {
                const page = pages[pageIndex]
                mpc.pageStart = true
                mpc.pageNumber = page.pageNumber() + 1 + this.m_score.pageNumberOffset()
                mpc.writePageNo = this.shouldWritePageNo(page)
                const systems = page.systems()

                for (let systemIndex = 0; systemIndex < systems.length; ++systemIndex) {
                    const system = systems[systemIndex]
                    mpc.systemStart = true

                    for (const mb of system.measures()) {
                        if (!mb.isMeasure()) {
                            continue
                        }
                        const m = mb as Measure

                        if (m.isMMRest()) {
                            // in case of a multimeasure rest (which is a single measure in MuseScore), write the measure range it replaces
                            const m2 = m.mmRestLast()!.nextMeasure()
                            for (let m1 = m.mmRestFirst(); m1 !== m2; m1 = m1!.nextMeasure()) {
                                if (m1!.isMeasure()) {
                                    this.writeMeasure(m1!, partIndex, staffCount, mnsh, fbMap, mpc, spannersStopped)
                                    mpc.measureWritten(m1!)
                                }
                            }
                        } else {
                            // write the measure (or, if measure repeat, the "underlying" measure that it indicates for the musician to play)
                            this.writeMeasure(m, partIndex, staffCount, mnsh, fbMap, mpc, spannersStopped)
                            mpc.measureWritten(m)
                        }
                    }
                    mpc.prevSystem = system
                }
                mpc.lastSystemPrevPage = mpc.prevSystem
            }

            staffCount += part.nstaves()
            this.m_xml.endElement()
        }
    }

    //---------------------------------------------------------
    //  write
    //---------------------------------------------------------

    /**
     Write the score in MusicXML format (C++ writes into \a dev, returns the text here).
     */

    write(): string {
        this.calcDivisions()

        for (let i = 0; i < MAX_NUMBER_LEVEL; ++i) {
            this.m_brackets[i] = null
            this.m_dashes[i] = null
            this.m_hairpins[i] = null
            this.m_ottavas[i] = null
            this.m_trills[i] = null
        }

        this.m_jumpElements = findJumpElements(this.m_score)

        this.m_xml = new XmlWriter()
        this.m_xml.startDocument()
        this.m_xml.writeDoctype(
            'score-partwise PUBLIC "-//Recordare//DTD MusicXML 4.0 Partwise//EN" "http://www.musicxml.org/dtds/partwise.dtd"')

        this.m_xml.startElement('score-partwise', [['version', '4.0']])

        this.work(this.m_score.measures().first())
        this.identification(this.m_xml, this.m_score)

        if (ExportMusicXml.configuration().exportLayout()) {
            defaults(this.m_xml, this.m_score.style(), this.m_millimeters, this.m_tenths)
            this.credits(this.m_xml)
        } else if (this.m_score.style().styleB(Sid.concertPitch)) {
            this.m_xml.startElement('defaults')
            this.m_xml.tag('concert-score')
            this.m_xml.endElement()
        }

        partList(this.m_xml, this.m_score, this.m_instrMap)
        this.writeParts()

        this.m_xml.endElement()
        this.m_xml.flush()
        return this.m_xml.text()
    }

    getTenthsFromInches(inches: number): number {
        return inches * INCH / this.m_millimeters * this.m_tenths
    }

    getTenthsFromDots(dots: number): number {
        return dots / DPMM / this.m_millimeters * this.m_tenths
    }

    //---------------------------------------------------------
    //   harmony
    //---------------------------------------------------------

    harmony(h: Harmony, fd: FretDiagram | null, offset: Fraction = new Fraction(0, 1)): void {
        if (!h.chords().length) {
            return
        }
        const harmonyAttrs: Array<[string, string | number]> = []
        if (h.isPolychord()) {
            harmonyAttrs.push(['arrangement', 'vertical'])
        }
        if (!h.isStyled(Pid.PLACEMENT)) {
            harmonyAttrs.push(['placement', TConv.toXmlPlacementV(h.placement())])
        }
        if (!h.isStyled(Pid.FONT_FACE)) {
            harmonyAttrs.push(['font-family', h.getProperty(Pid.FONT_FACE) as string])
        }
        if (!h.isStyled(Pid.FONT_SIZE)) {
            harmonyAttrs.push(['font-size', h.getProperty(Pid.FONT_SIZE) as number])
        }
        harmonyAttrs.push(['print-frame', h.hasFrame() ? 'yes' : 'no']) // .append(relative));
        if (!h.visible()) {
            harmonyAttrs.push(['print-object', 'no'])
        }
        addColorAttr(h, harmonyAttrs)
        this.m_xml.startElement('harmony', harmonyAttrs)
        if (h.harmonyType() === HarmonyType.STANDARD && tpcIsValid(h.rootTpc())) {
            for (const info of h.chords()) {
                if (!info || !tpcIsValid(info.rootTpc())) {
                    continue // skip invalid HarmonyInfo
                }
                const rootTpc = info.rootTpc()
                const bassTpc = info.bassTpc()
                this.m_xml.startElement('root')
                this.m_xml.tag('root-step', tpc2stepName(rootTpc))
                let alter = Math.trunc(tpc2alter(rootTpc))
                if (alter) {
                    this.m_xml.tag('root-alter', alter)
                }
                this.m_xml.endElement()

                const xmlKind = harmonyXmlKind(info)

                if (xmlKind) {
                    let s = 'kind'
                    const kindText = harmonyXmlText(info)
                    if (harmonyXmlText(info)) {
                        s += ' text="' + kindText + '"'
                    }
                    if (harmonyXmlSymbols(info) === 'yes') {
                        s += ' use-symbols="yes"'
                    }
                    if (harmonyXmlParens(info) === 'yes') {
                        s += ' parentheses-degrees="yes"'
                    }
                    if (this.m_score.style().styleB(Sid.verticallyStackModifiers)) {
                        s += h.getProperty(Pid.HARMONY_DO_NOT_STACK_MODIFIERS)
                            ? ' stack-degrees="no"' : ' stack-degrees="yes"'
                    }
                    this.m_xml.tagRaw(s, xmlKind)

                    if (tpcIsValid(bassTpc)) {
                        const bassAttrs: Array<[string, string | number]>
                            = [['arrangement', this.m_score.style().styleB(Sid.chordBassNoteStagger) ? 'diagonal' : 'horizontal']]
                        this.m_xml.startElement('bass', bassAttrs)
                        this.m_xml.tag('bass-step', tpc2stepName(bassTpc))
                        alter = Math.trunc(tpc2alter(bassTpc))
                        if (alter) {
                            this.m_xml.tag('bass-alter', alter)
                        }
                        this.m_xml.endElement()
                    }

                    const l = harmonyXmlDegrees(info)
                    for (const tag of l) {
                        let degreeText = ''
                        if (xmlKind.startsWith('suspended')
                            && tag.startsWith('add') && isDigit(tag[3])
                            && kindText && isDigit(kindText[0])) {
                            // hack to correct text for suspended chords whose kind text has degree information baked in
                            // (required by some other applications)
                            const tagDegree = stringToInt(tag.substring(3))
                            // C++ assigns kindTextExtension[i] = kindText[i] on an empty String, which does not
                            // extend it: kindTextExtension stays empty and kindExtension is 0 (no text="" is written)
                            const kindTextExtension = ''
                            const kindExtension = stringToInt(kindTextExtension)
                            if (tagDegree <= kindExtension && (tagDegree & 1) && (kindExtension & 1)) {
                                degreeText = ' text=""'
                            }
                        }
                        this.m_xml.startElement('degree')
                        alter = 0
                        let idx = 3
                        if (tag[idx] === '#') {
                            alter = 1
                            ++idx
                        } else if (tag[idx] === 'b') {
                            alter = -1
                            ++idx
                        }
                        this.m_xml.tagRaw(`degree-value${degreeText}`, tag.substring(idx))
                        this.m_xml.tag('degree-alter', alter) // finale insists on this even if 0
                        if (tag.startsWith('add')) {
                            this.m_xml.tagRaw(`degree-type${degreeText}`, 'add')
                        } else if (tag.startsWith('sub')) {
                            this.m_xml.tag('degree-type', 'subtract')
                        } else if (tag.startsWith('alt')) {
                            this.m_xml.tag('degree-type', 'alter')
                        }
                        this.m_xml.endElement()
                    }
                } else {
                    if (!info.textName()) {
                        this.m_xml.tag('kind', 'none')
                    } else {
                        this.m_xml.tag('kind', [['text', info.textName()]], '')
                    }

                    if (tpcIsValid(bassTpc)) {
                        this.m_xml.startElement('bass')
                        this.m_xml.tag('bass-step', tpc2stepName(bassTpc))
                        alter = Math.trunc(tpc2alter(bassTpc))
                        if (alter) {
                            this.m_xml.tag('bass-alter', alter)
                        }
                        this.m_xml.endElement()
                    }
                }
            }
            if (offset.isValid() && offset.gt(new Fraction(0, 1))) {
                this.m_xml.tag('offset', calculateDurationInDivisions(offset, this.m_div))
            }
            if (fd) {
                writeMusicXmlFretDiagram(fd, this.m_xml)
            }
        } else {
            //
            // export an unrecognized Chord
            // which may contain arbitrary text
            //
            // No supprt for polychords at the moment. Export the first chord from the list.
            const info: HarmonyInfo = h.chords()[0]
            const xmlKind = harmonyXmlKind(info)
            const textName = info.textName()
            let fallthrough = false
            switch (h.harmonyType()) {
            case HarmonyType.NASHVILLE: {
                let alter = ''
                let functionText = harmonyXmlFunction(info, h)
                if (!functionText) {
                    // we just dump the text as deprecated function
                    this.m_xml.tag('function', textName)
                    this.m_xml.tag('kind', 'none')
                    break
                } else if (!isDigit(functionText[0])) {
                    alter = functionText[0]
                    functionText = functionText.length > 1 ? functionText[1] : ''
                }
                this.m_xml.startElement('numeral')
                this.m_xml.tag('numeral-root', functionText)
                if (alter === 'b') {
                    this.m_xml.tag('numeral-alter', '-1')
                } else if (alter === '#') {
                    this.m_xml.tag('numeral-alter', '1')
                }
                this.m_xml.endElement()
                if (xmlKind) {
                    let s = 'kind'
                    const kindText = harmonyXmlText(info)
                    if (harmonyXmlText(info)) {
                        s += ' text="' + kindText + '"'
                    }
                    if (harmonyXmlSymbols(info) === 'yes') {
                        s += ' use-symbols="yes"'
                    }
                    if (harmonyXmlParens(info) === 'yes') {
                        s += ' parentheses-degrees="yes"'
                    }
                    this.m_xml.tagRaw(s, xmlKind)
                } else {
                    // default is major
                    this.m_xml.tag('kind', 'major')
                }
            }
                break
            case HarmonyType.ROMAN: {
                let alter = 0
                const roman = /(b|#)?([ivIV]+)/
                const match = roman.exec(textName)
                if (match) {
                    // String::search(roman, { 1, 2 }): an empty first group is kept
                    const matches = [match[1] ?? '', match[2] ?? '']
                    this.m_xml.startElement('numeral')
                    if (matches[0] === 'b') {
                        alter = -1
                    } else if (matches[0] === '#') {
                        alter = 1
                    }
                    const numberStr = matches[1]
                    let harmony = 1
                    if (numberStr.toLowerCase().includes('v')) {
                        if (numberStr.toLowerCase().startsWith('i')) {
                            harmony = 4
                        } else {
                            harmony = 4 + numberStr.length
                        }
                    } else {
                        harmony = numberStr.length
                    }
                    this.m_xml.tag('numeral-root', [['text', numberStr]], harmony)
                    if (alter) {
                        this.m_xml.tag('numeral-alter', alter)
                    }
                    this.m_xml.endElement()
                    // simple check for major or minor
                    this.m_xml.tag('kind', isUpper(numberStr[0]) ? 'major' : 'minor')
                    // infer inversion from ending digits
                    if (textName.endsWith('64')) {
                        this.m_xml.tag('inversion', 2)
                    } else if (textName.endsWith('6')) {
                        this.m_xml.tag('inversion', 1)
                    }
                    break
                }
                fallthrough = true
                break
            }
            case HarmonyType.STANDARD:
            default:
                fallthrough = true
                break
            }
            if (fallthrough) {
                this.m_xml.startElement('root')
                this.m_xml.tag('root-step', [['text', '']], 'C')
                this.m_xml.endElement() // root
                this.m_xml.tag('kind', [['text', textName]], 'none')
            }
        }
        this.m_xml.endElement()
    }

    //---------------------------------------------------------
    //  canWrite
    //---------------------------------------------------------

    /**
     Whether a tag corresponding to the given element \p e
     should be included to the exported MusicXML file.
     */

    static canWrite(e: EngravingItem): boolean {
        return e.visible() || ExportMusicXml.configuration().exportInvisibleElements()
    }
}

//---------------------------------------------------------
//   helpers of harmony()
//---------------------------------------------------------

function isDigit(c: string | undefined): boolean {
    return c !== undefined && c >= '0' && c <= '9'
}

function isUpper(c: string | undefined): boolean {
    return c !== undefined && c !== c.toLowerCase() && c === c.toUpperCase()
}

/** C++ String::toInt() (0 if not a number) */
function stringToInt(s: string): number {
    return /^\s*[+-]?\d+\s*$/.test(s) ? parseInt(s, 10) : 0
}

/** muse::Date::currentDate().toString(ISODate) */
function currentDateIso(): string {
    const d = new Date()
    const p = (n: number): string => String(n).padStart(2, '0')
    return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`
}

//---------------------------------------------------------
//   saveXml
//    return false on error
//---------------------------------------------------------

/**
 Save Score as MusicXML (C++ saveXml(Score*, IODevice*)); returns the text.
 */

export function saveXml(score: Score, configuration: MusicXmlConfiguration = new MusicXmlConfiguration()): string {
    const prev = ExportMusicXml.configuration()
    ExportMusicXml.setConfiguration(configuration)
    try {
        const em = new ExportMusicXml(score)
        return em.write()
    } finally {
        ExportMusicXml.setConfiguration(prev)
    }
}

//---------------------------------------------------------
//   saveMxl
//    return false on error
//---------------------------------------------------------

// META-INF/container.xml:
// <?xml version="1.0" encoding="UTF-8"?>
// <container>
//     <rootfiles>
//         <rootfile full-path="testHello.xml"/>
//     </rootfiles>
// </container>

function writeMxlArchive(score: Score, zip: Zippable, filename: string, configuration: MusicXmlConfiguration): void {
    const xml = new XmlWriter()
    xml.startDocument()
    xml.startElement('container')
    xml.startElement('rootfiles')
    xml.startElement('rootfile', [['full-path', filename]])
    xml.endElement()
    xml.endElement()
    xml.endElement()
    xml.flush()

    zip['META-INF/container.xml'] = strToU8(xml.text())

    const prev = ExportMusicXml.configuration()
    ExportMusicXml.setConfiguration(configuration)
    try {
        const em = new ExportMusicXml(score)
        em.setMxl(true)
        zip[filename] = strToU8(em.write())
    } finally {
        ExportMusicXml.setConfiguration(prev)
    }

    for (const isi of imageStore.items()) {
        if (isi.isUsed(score)) {
            const { source } = getImageInfo(isi)
            zip[source] = isi.buffer()
        }
    }
}

/**
 C++ saveMxl(Score*, IODevice*): the compressed MusicXML file with the anonymized file name "score.xml"
 (the writer does not know the actual file name)
 */
export function saveMxl(score: Score, configuration: MusicXmlConfiguration = new MusicXmlConfiguration()): Uint8Array {
    const zip: Zippable = {}

    //anonymized filename since we don't know the actual one here
    const fn = 'score.xml'
    writeMxlArchive(score, zip, fn, configuration)

    return zipSync(zip, { level: 6 })
}
