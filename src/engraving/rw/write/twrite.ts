/*
 * SPDX-License-Identifier: GPL-3.0-only
 * MuseScore-Web — port of MuseScore Studio (https://github.com/musescore/MuseScore)
 * Copyright (C) 2021-2026 MuseScore Limited and others
 *
 * Port of src/engraving/rw/write/twrite.h/.cpp
 *
 * C++ uses overloads TWrite::write(T*, ...) and TWrite::writeProperties(T*, ...); here every type has its own method
 * (writeChord, writeChordRestProperties, ...) and writeItem() dispatches by element type.
 * TODO(port): writers of element types that are not ported yet (figured bass, images, bends, tremolo bars, sticking,
 * harp pedal diagrams, string tunings, capo, sound flags, tapping, play technique annotations, ...)
 */

import { PointF } from '../../../framework/draw/types/geometry'
import { isZero } from '../../../framework/global/realfn'
import { Spatium } from '../../types/dimension'
import { Fraction } from '../../types/fraction'
import { P_TYPE, type PropertyValue } from '../../types/propertyvalue'
import { SymNames } from '../../types/symnames'
import { TConv } from '../../types/typesconv'
import {
    ArticulationTextType, AutoOnOff, BeamMode, BracketType, ClefType, DPMM, DurationType, ElementType,
    FontStyle, GlissandoStyle, GuitarBendType, KeyMode, LyricsSyllabic, NoteHeadScheme, PartialSpannerDirection,
    PreferSharpFlat, StaffGroup, VOICES, nidx, track2staff, track2voice, type track_idx_t,
} from '../../types/types'
import { Constants } from '../../types/constants'
import { lrint } from '../../../framework/global/realfn'
import { Sid } from '../../style/styledef'
import { textStyle } from '../../style/textstyle'
import { Pid, PropertyFlags, propertyType } from '../../dom/property'
import { Factory } from '../../dom/factory'
import { linkedObjectsMainElement } from '../../dom/linkedobjects'
import { Location } from '../../dom/location'
import { NoteType, type ChordRest } from '../../dom/chordrest'
import { SpannerAnchor, type Spanner, type SpannerSegment } from '../../dom/spanner'
import { TempoTextType, type TempoText } from '../../dom/tempotext'
import { TextBase } from '../../dom/textbase'
import { TextLineBase } from '../../dom/textlinebase'
import { FretItem, type FretDiagram } from '../../dom/fret'
import { HDegreeType } from '../../dom/chordlist'
import { NoteCaseType, Tpc } from '../../dom/pitchspelling'
import { Transpose } from '../../editing/transpose'
import { Grip } from '../../editing/editdata'
import { scoreDummy } from '../../compat/dummyelement'
import { AccidentalType } from '../../dom/accidentaldata'
import { EngravingConfiguration } from '../../internal/engravingconfiguration'
import { SegmentType } from '../../dom/segment'
import { CTRL_CHORUS_SEND, CTRL_HBANK, CTRL_LBANK, CTRL_PANPOT, CTRL_PROGRAM, CTRL_REVERB_SEND, CTRL_VOLUME, ME_CONTROLLER,
    ME_INVALID, ME_NOTEOFF, ME_NOTEON, type MidiCoreEvent } from '../../compat/midi/midicoreevent'
import { InstrChannel, type Instrument, type MidiArticulation, type NamedEventList, type StaffName } from '../../dom/instrument'
import type { EngravingItem } from '../../dom/engravingitem'
import type { EngravingObject } from '../../dom/engravingobject'
import type { Accidental } from '../../dom/accidental'
import type { Ambitus } from '../../dom/ambitus'
import type { Arpeggio } from '../../dom/arpeggio'
import type { Articulation } from '../../dom/articulation'
import type { BarLine } from '../../dom/barline'
import type { Beam } from '../../dom/beam'
import type { Box, FBox, HBox, TBox } from '../../dom/box'
import type { Bracket } from '../../dom/bracket'
import type { Breath } from '../../dom/breath'
import type { BSymbol } from '../../dom/bsymbol'
import type { Chord } from '../../dom/chord'
import type { ChordLine } from '../../dom/chordline'
import type { Clef } from '../../dom/clef'
import type { DurationElement } from '../../dom/durationelement'
import type { Dynamic } from '../../dom/dynamic'
import type { Expression } from '../../dom/expression'
import type { Fermata } from '../../dom/fermata'
import type { Fingering } from '../../dom/fingering'
import type { Glissando } from '../../dom/glissando'
import type { GradualTempoChange } from '../../dom/gradualtempochange'
import type { Groups } from '../../dom/groups'
import type { GuitarBend, GuitarBendSegment } from '../../dom/guitarbend'
import type { Hairpin } from '../../dom/hairpin'
import type { HammerOnPullOff, HammerOnPullOffSegment, HammerOnPullOffText } from '../../dom/hammeronpulloff'
import type { Harmony, HarmonyInfo } from '../../dom/harmony'
import type { Hook } from '../../dom/hook'
import type { InstrumentChange } from '../../dom/instrchange'
import type { Jump } from '../../dom/jump'
import type { KeySig } from '../../dom/keysig'
import type { LaissezVib } from '../../dom/laissezvib'
import type { LayoutBreak } from '../../dom/layoutbreak'
import type { LedgerLine } from '../../dom/ledgerline'
import type { SLine } from '../../dom/line'
import type { Lyrics } from '../../dom/lyrics'
import type { LyricsLine } from '../../dom/lyricsline'
import type { Marker } from '../../dom/marker'
import type { Measure } from '../../dom/measure'
import type { MeasureRepeat } from '../../dom/measurerepeat'
import type { MMRest } from '../../dom/mmrest'
import type { Note } from '../../dom/note'
import type { NoteDot } from '../../dom/notedot'
import type { Ornament } from '../../dom/ornament'
import type { Ottava } from '../../dom/ottava'
import type { Parenthesis } from '../../dom/parenthesis'
import { Part } from '../../dom/part'
import type { PartialTie } from '../../dom/partialtie'
import type { Rest } from '../../dom/rest'
import type { Score } from '../../dom/score'
import type { Segment } from '../../dom/segment'
import type { Slur } from '../../dom/slur'
import type { SlurTie, SlurTieSegment } from '../../dom/slurtie'
import type { Spacer } from '../../dom/spacer'
import type { Staff } from '../../dom/staff'
import type { StaffText, StaffTextBase } from '../../dom/stafftextbase'
import type { StaffType } from '../../dom/stafftype'
import type { StaffTypeChange } from '../../dom/stafftypechange'
import type { Stem } from '../../dom/stem'
import type { StringData } from '../../dom/stringdata'
import type { Symbol } from '../../dom/symbol'
import type { SystemLock } from '../../dom/systemlock'
import type { Text } from '../../dom/text'
import type { TextLine } from '../../dom/textline'
import type { Tie } from '../../dom/tie'
import type { TimeSig } from '../../dom/timesig'
import type { TremoloSingleChord } from '../../dom/tremolosinglechord'
import type { TremoloTwoChord } from '../../dom/tremolotwochord'
import type { Trill } from '../../dom/trill'
import type { Tuplet } from '../../dom/tuplet'
import type { Vibrato } from '../../dom/vibrato'
import type { Volta } from '../../dom/volta'
import type { MeasureBase } from '../../dom/measurebase'
import type { XmlWriter } from '../xmlwriter'
import type { WriteContext } from './writecontext'
import { SpannerWriter } from './connectorinfowriter'

const MIN_PITCH = 0
const MAX_PITCH = 127

/** spanner types that are always written on their own staff (and not only with the system elements) */
const SYSTEM_ANNOTATION_TYPES = new Set<ElementType>([
    ElementType.REHEARSAL_MARK, ElementType.SYSTEM_TEXT, ElementType.TRIPLET_FEEL, ElementType.PLAYTECH_ANNOTATION,
    ElementType.CAPO, ElementType.STRING_TUNINGS, ElementType.JUMP, ElementType.MARKER, ElementType.TEMPO_TEXT,
    ElementType.VOLTA, ElementType.GRADUAL_TEMPO_CHANGE, ElementType.PLAY_COUNT_TEXT,
])

export class TWrite {
    // ---------------------------------------------------------
    //   writeItem
    // ---------------------------------------------------------

    static writeItem(item: EngravingItem, xml: XmlWriter, ctx: WriteContext): void {
        switch (item.type()) {
        case ElementType.ACCIDENTAL: TWrite.writeAccidental(item as Accidental, xml, ctx); break
        case ElementType.AMBITUS: TWrite.writeAmbitus(item as Ambitus, xml, ctx); break
        case ElementType.ARPEGGIO: TWrite.writeArpeggio(item as Arpeggio, xml, ctx); break
        case ElementType.ARTICULATION: TWrite.writeArticulation(item as Articulation, xml, ctx); break
        case ElementType.BAR_LINE: TWrite.writeBarLine(item as BarLine, xml, ctx); break
        case ElementType.BEAM: TWrite.writeBeam(item as Beam, xml, ctx); break
        case ElementType.HBOX: TWrite.writeHBox(item as HBox, xml, ctx); break
        case ElementType.VBOX: TWrite.writeBox(item as Box, xml, ctx); break
        case ElementType.FBOX: TWrite.writeFBox(item as FBox, xml, ctx); break
        case ElementType.TBOX: TWrite.writeTBox(item as TBox, xml, ctx); break
        case ElementType.BRACKET: TWrite.writeBracket(item as Bracket, xml, ctx); break
        case ElementType.BREATH: TWrite.writeBreath(item as Breath, xml, ctx); break
        case ElementType.CHORD: TWrite.writeChord(item as Chord, xml, ctx); break
        case ElementType.CHORDLINE: TWrite.writeChordLine(item as ChordLine, xml, ctx); break
        case ElementType.CLEF: TWrite.writeClef(item as Clef, xml, ctx); break
        case ElementType.DYNAMIC: TWrite.writeDynamic(item as Dynamic, xml, ctx); break
        case ElementType.EXPRESSION: TWrite.writeExpression(item as Expression, xml, ctx); break
        case ElementType.FERMATA: TWrite.writeFermata(item as Fermata, xml, ctx); break
        case ElementType.FINGERING: TWrite.writeFingering(item as Fingering, xml, ctx); break
        case ElementType.FRET_DIAGRAM: TWrite.writeFretDiagram(item as FretDiagram, xml, ctx); break
        case ElementType.GLISSANDO: TWrite.writeGlissando(item as Glissando, xml, ctx); break
        case ElementType.GRADUAL_TEMPO_CHANGE: TWrite.writeGradualTempoChange(item as GradualTempoChange, xml, ctx); break
        case ElementType.GUITAR_BEND: TWrite.writeGuitarBend(item as GuitarBend, xml, ctx); break
        case ElementType.HAIRPIN: TWrite.writeHairpin(item as Hairpin, xml, ctx); break
        case ElementType.HAMMER_ON_PULL_OFF: TWrite.writeHammerOnPullOff(item as HammerOnPullOff, xml, ctx); break
        case ElementType.HARMONY: TWrite.writeHarmony(item as Harmony, xml, ctx); break
        case ElementType.HOOK: TWrite.writeHook(item as Hook, xml, ctx); break
        case ElementType.INSTRUMENT_CHANGE: TWrite.writeInstrumentChange(item as InstrumentChange, xml, ctx); break
        case ElementType.JUMP: TWrite.writeJump(item as Jump, xml, ctx); break
        case ElementType.KEYSIG: TWrite.writeKeySig(item as KeySig, xml, ctx); break
        case ElementType.LAISSEZ_VIB: TWrite.writeLaissezVib(item as LaissezVib, xml, ctx); break
        case ElementType.LAYOUT_BREAK: TWrite.writeLayoutBreak(item as LayoutBreak, xml, ctx); break
        case ElementType.LEDGER_LINE: TWrite.writeLedgerLine(item as LedgerLine, xml, ctx); break
        case ElementType.LET_RING: TWrite.writeTextLineBaseItem(item as TextLineBase, xml, ctx); break
        case ElementType.LYRICS: TWrite.writeLyrics(item as Lyrics, xml, ctx); break
        case ElementType.LYRICSLINE: TWrite.writeLyricsLine(item as LyricsLine, xml, ctx); break
        case ElementType.MARKER: TWrite.writeMarker(item as Marker, xml, ctx); break
        case ElementType.MEASURE_NUMBER: TWrite.writeTextBaseItem(item as TextBase, xml, ctx); break
        case ElementType.MEASURE_REPEAT: TWrite.writeMeasureRepeat(item as MeasureRepeat, xml, ctx); break
        case ElementType.MMREST: TWrite.writeMMRest(item as MMRest, xml, ctx); break
        case ElementType.MMREST_RANGE: TWrite.writeTextBaseItem(item as TextBase, xml, ctx); break
        case ElementType.NOTE: TWrite.writeNote(item as Note, xml, ctx); break
        case ElementType.NOTEDOT: TWrite.writeNoteDot(item as NoteDot, xml, ctx); break
        case ElementType.ORNAMENT: TWrite.writeOrnament(item as Ornament, xml, ctx); break
        case ElementType.OTTAVA: TWrite.writeOttava(item as Ottava, xml, ctx); break
        case ElementType.PALM_MUTE: TWrite.writeTextLineBaseItem(item as TextLineBase, xml, ctx); break
        case ElementType.PARENTHESIS: TWrite.writeParenthesis(item as Parenthesis, xml, ctx); break
        case ElementType.PARTIAL_TIE: TWrite.writePartialTie(item as PartialTie, xml, ctx); break
        case ElementType.PEDAL: TWrite.writeTextLineBaseItem(item as TextLineBase, xml, ctx); break
        case ElementType.REHEARSAL_MARK: TWrite.writeTextBaseItem(item as TextBase, xml, ctx); break
        case ElementType.REST: TWrite.writeRest(item as Rest, xml, ctx); break
        case ElementType.SEGMENT: TWrite.writeSegment(item as Segment, xml, ctx); break
        case ElementType.SLUR: TWrite.writeSlur(item as Slur, xml, ctx); break
        case ElementType.SPACER: TWrite.writeSpacer(item as Spacer, xml, ctx); break
        case ElementType.STAFF_TEXT: TWrite.writeStaffText(item as StaffText, xml, ctx); break
        case ElementType.STAFFTYPE_CHANGE: TWrite.writeStaffTypeChange(item as StaffTypeChange, xml, ctx); break
        case ElementType.STEM: TWrite.writeStem(item as Stem, xml, ctx); break
        case ElementType.STEM_SLASH: TWrite.writeStemSlash(item, xml, ctx); break
        case ElementType.SYMBOL: TWrite.writeSymbol(item as Symbol, xml, ctx); break
        case ElementType.SYSTEM_TEXT: TWrite.writeStaffTextBase(item as StaffTextBase, xml, ctx); break
        case ElementType.TEMPO_TEXT: TWrite.writeTempoText(item as TempoText, xml, ctx); break
        case ElementType.TEXT: TWrite.writeText(item as Text, xml, ctx); break
        case ElementType.TEXTLINE: TWrite.writeTextLine(item as TextLine, xml, ctx); break
        case ElementType.TIE: TWrite.writeTie(item as Tie, xml, ctx); break
        case ElementType.TIMESIG: TWrite.writeTimeSig(item as TimeSig, xml, ctx); break
        case ElementType.TREMOLO_SINGLECHORD: TWrite.writeTremoloSingleChord(item as TremoloSingleChord, xml, ctx); break
        case ElementType.TREMOLO_TWOCHORD: TWrite.writeTremoloTwoChord(item as TremoloTwoChord, xml, ctx); break
        case ElementType.TRILL: TWrite.writeTrill(item as Trill, xml, ctx); break
        case ElementType.TUPLET: TWrite.writeTuplet(item as Tuplet, xml, ctx); break
        case ElementType.VIBRATO: TWrite.writeVibrato(item as Vibrato, xml, ctx); break
        case ElementType.VOLTA: TWrite.writeVolta(item as Volta, xml, ctx); break
        case ElementType.WHAMMY_BAR: TWrite.writeTextLineBaseItem(item as TextLineBase, xml, ctx); break
        default:
            // TODO(port): element type not ported yet (C++: UNREACHABLE)
            break
        }
    }

    static writeItems(items: readonly EngravingItem[], xml: XmlWriter, ctx: WriteContext): void {
        for (const e of items) {
            TWrite.writeItem(e, xml, ctx)
        }
    }

    // -----------------------------------------------------------------------------
    //   writeProperty
    //
    //    - styled properties are never written
    //    - other properties are written if forced or if different from default value
    // -----------------------------------------------------------------------------

    static writeProperty(item: EngravingItem, xml: XmlWriter, pid: Pid, force = false): void {
        if (item.isStyled(pid)) {
            return
        }
        let p = item.getProperty(pid)
        if (p === undefined || p === null) {
            // C++ logs "invalid property"
            return
        }
        let d: PropertyValue = force ? undefined : item.propertyDefault(pid)

        if (pid === Pid.FONT_STYLE) {
            const ds = (d !== undefined && d !== null ? d as number : 0) as FontStyle
            const fs = p as FontStyle
            if ((fs & FontStyle.Bold) !== (ds & FontStyle.Bold)) {
                xml.tag('bold', (fs & FontStyle.Bold) !== 0)
            }
            if ((fs & FontStyle.Italic) !== (ds & FontStyle.Italic)) {
                xml.tag('italic', (fs & FontStyle.Italic) !== 0)
            }
            if ((fs & FontStyle.Underline) !== (ds & FontStyle.Underline)) {
                xml.tag('underline', (fs & FontStyle.Underline) !== 0)
            }
            if ((fs & FontStyle.Strike) !== (ds & FontStyle.Strike)) {
                xml.tag('strike', (fs & FontStyle.Strike) !== 0)
            }
            return
        }

        const type = propertyType(pid)
        if (type === P_TYPE.MILLIMETRE) {
            const f1 = p as number
            if (d !== undefined && d !== null && Math.abs(f1 - (d as number)) < 0.0001) { // fuzzy compare
                return
            }
            p = Spatium.fromMM(f1, item.spatium())
            d = undefined
        } else if (type === P_TYPE.POINT) {
            const p1 = p as PointF
            if (d !== undefined && d !== null) {
                const p2 = d as PointF
                if ((Math.abs(p1.x() - p2.x()) < 0.0001) && (Math.abs(p1.y() - p2.y()) < 0.0001)) {
                    return
                }
            }
            const q = item.offsetIsSpatiumDependent() ? item.style().spatium() : DPMM
            p = new PointF(p1.x() / q, p1.y() / q)
            d = undefined
        }
        xml.tagProperty(pid, p, d)
    }

    static writeSystemLocks(score: Score, xml: XmlWriter): void {
        const locks = score.systemLocks().allLocks()
        if (!locks.length) {
            return
        }

        xml.startElement('SystemLocks')
        for (const sl of locks) {
            TWrite.writeSystemLock(sl, xml)
        }
        xml.endElement()
    }

    static writeSystemDividers(_score: Score, _xml: XmlWriter, _ctx: WriteContext): void {
        // TODO(port): system dividers (SystemDivider is not ported; the reader skips <SystemDividers>)
    }

    static writeItemEid(item: EngravingObject, xml: XmlWriter, ctx: WriteContext): void {
        // C++ also skips the EIDs for palette scores and with configuration()->doNotSaveEIDsForBackCompat()
        if (ctx.clipboardmode()) {
            return
        }

        let eid = item.eid()
        if (!eid) {
            eid = item.assignNewEID()
        }

        xml.tag('eid', eid)
    }

    static writeItemLink(item: EngravingObject, xml: XmlWriter, ctx: WriteContext): void {
        const links = item.links()
        if (!links || links.length <= 1 || ctx.clipboardmode()) {
            return
        }

        const mainElement = linkedObjectsMainElement(links)
        if (mainElement && mainElement !== item) {
            const eidOfMainElement = mainElement.eid()
            xml.tag('linkedTo', eidOfMainElement)
        }
    }

    static writeSystemLock(systemLock: SystemLock, xml: XmlWriter): void {
        xml.startElement('systemLock')

        xml.tag('startMeasure', systemLock.startMB().eid())
        xml.tag('endMeasure', systemLock.endMB().eid())

        xml.endElement()
    }

    static lineBreakToTag(str: string): string {
        // Raw newlines appearing next to tags (<font size="10> or <sym>...) get eaten by XML readers.
        return str.replace(/\n/g, '<br/>')
    }

    static writeStyledProperties(item: EngravingItem, xml: XmlWriter): void {
        for (const spp of item.styledProperties()) {
            TWrite.writeProperty(item, xml, spp.pid)
        }
    }

    static writeItemProperties(item: EngravingItem, xml: XmlWriter, ctx: WriteContext): void {
        TWrite.writeItemEid(item, xml, ctx)

        const style = item.score().style()
        const autoplaceEnabled = style.styleB(Sid.autoplaceEnabled)
        if (!autoplaceEnabled) {
            style.set(Sid.autoplaceEnabled, true)
            TWrite.writeProperty(item, xml, Pid.AUTOPLACE)
            style.set(Sid.autoplaceEnabled, autoplaceEnabled)
        } else {
            TWrite.writeProperty(item, xml, Pid.AUTOPLACE)
        }

        TWrite.writeItemLink(item, xml, ctx)

        if (item.track() !== ctx.curTrack() && item.track() !== nidx && !item.isBeam() && !item.isTuplet()) {
            // Writing track number for beams and tuplets is redundant as it is calculated
            // during layout.
            const t = item.track() + ctx.trackDiff()
            xml.tag('track', t)
        }

        for (const pid of [Pid.OFFSET, Pid.COLOR, Pid.VISIBLE, Pid.Z]) {
            if (item.propertyFlags(pid) === PropertyFlags.NOSTYLE) {
                TWrite.writeProperty(item, xml, pid)
            }
        }

        if (!item.hasVoiceAssignmentProperties() && item.propertyFlags(Pid.PLACEMENT) === PropertyFlags.NOSTYLE) {
            TWrite.writeProperty(item, xml, Pid.PLACEMENT)
        }

        TWrite.writeProperty(item, xml, Pid.POSITION_LINKED_TO_MASTER)
        TWrite.writeProperty(item, xml, Pid.APPEARANCE_LINKED_TO_MASTER)
        TWrite.writeProperty(item, xml, Pid.EXCLUDE_FROM_OTHER_PARTS)

        const leftParen = item.leftParen()
        const rightParen = item.rightParen()
        const leftGenerated = !!leftParen && leftParen.generated()
        const rightGenerated = !!rightParen && rightParen.generated()
        if (!leftGenerated || !rightGenerated) {
            TWrite.writeProperty(item, xml, Pid.HAS_PARENTHESES)
        }
        if (leftParen && !leftParen.generated()) {
            TWrite.writeItem(leftParen, xml, ctx)
        }
        if (rightParen && !rightParen.generated()) {
            TWrite.writeItem(rightParen, xml, ctx)
        }
    }

    static writeAccidental(item: Accidental, xml: XmlWriter, ctx: WriteContext): void {
        xml.startElement(item)
        TWrite.writeProperty(item, xml, Pid.ACCIDENTAL_BRACKET)
        TWrite.writeProperty(item, xml, Pid.ACCIDENTAL_ROLE)
        TWrite.writeProperty(item, xml, Pid.SMALL)
        TWrite.writeProperty(item, xml, Pid.ACCIDENTAL_TYPE)
        TWrite.writeProperty(item, xml, Pid.ACCIDENTAL_STACKING_ORDER_OFFSET)
        TWrite.writeItemProperties(item, xml, ctx)
        xml.endElement()
    }

    static writeAmbitus(item: Ambitus, xml: XmlWriter, ctx: WriteContext): void {
        xml.startElement(item)
        xml.tagProperty(Pid.HEAD_GROUP, item.noteHeadGroup(), item.propertyDefault(Pid.HEAD_GROUP))
        xml.tagProperty(Pid.HEAD_TYPE, item.noteHeadType(), item.propertyDefault(Pid.HEAD_TYPE))
        xml.tagProperty(Pid.MIRROR_HEAD, item.direction(), item.propertyDefault(Pid.MIRROR_HEAD))
        xml.tag('hasLine', item.hasLine(), true)
        xml.tagProperty(Pid.LINE_WIDTH, item.lineWidth(), item.propertyDefault(Pid.LINE_WIDTH))
        xml.tag('topPitch', item.topPitch())
        xml.tag('topTpc', item.topTpc())
        xml.tag('bottomPitch', item.bottomPitch())
        xml.tag('bottomTpc', item.bottomTpc())
        if (item.topAccidental().accidentalType() !== AccidentalType.NONE) {
            xml.startElement('topAccidental')
            TWrite.writeAccidental(item.topAccidental(), xml, ctx)
            xml.endElement()
        }
        if (item.bottomAccidental().accidentalType() !== AccidentalType.NONE) {
            xml.startElement('bottomAccidental')
            TWrite.writeAccidental(item.bottomAccidental(), xml, ctx)
            xml.endElement()
        }
        TWrite.writeItemProperties(item, xml, ctx)
        xml.endElement()
    }

    static writeArpeggio(item: Arpeggio, xml: XmlWriter, ctx: WriteContext): void {
        if (!ctx.canWrite(item)) {
            return
        }
        xml.startElement(item)
        TWrite.writeProperty(item, xml, Pid.ARPEGGIO_TYPE)
        TWrite.writeArpeggioProperties(item, xml, ctx)
        xml.endElement()
    }

    static writeArpeggioProperties(item: Arpeggio, xml: XmlWriter, ctx: WriteContext): void {
        TWrite.writeItemProperties(item, xml, ctx)
        if (!isZero(item.userLen1())) {
            xml.tag('userLen1', item.userLen1() / item.spatium())
        }
        if (!isZero(item.userLen2())) {
            xml.tag('userLen2', item.userLen2() / item.spatium())
        }
        if (item.span() !== 1) {
            xml.tag('span', item.span())
        }
        TWrite.writeProperty(item, xml, Pid.PLAY)
        TWrite.writeProperty(item, xml, Pid.TIME_STRETCH)
    }

    static writeArticulation(item: Articulation, xml: XmlWriter, ctx: WriteContext): void {
        if (!ctx.canWrite(item)) {
            return
        }
        if (item.isOrnament()) {
            TWrite.writeOrnament(item as Ornament, xml, ctx)
            return
        }
        xml.startElement(item)
        TWrite.writeArticulationProperties(item, xml, ctx)
        xml.endElement()
    }

    static writeArticulationProperties(item: Articulation, xml: XmlWriter, ctx: WriteContext): void {
        if (item.channelName()) {
            xml.tag('channe', [['name', item.channelName()]])
        }

        TWrite.writeProperty(item, xml, Pid.DIRECTION)
        if (item.textType() !== ArticulationTextType.NO_TEXT) {
            xml.tag('subtype', TConv.toXmlArticulationTextType(item.textType()))
        } else if (!item.isType(ElementType.TAPPING)) {
            xml.tag('subtype', SymNames.nameForSymId(item.symId()))
        }

        TWrite.writeProperty(item, xml, Pid.PLAY)
        TWrite.writeProperty(item, xml, Pid.ORNAMENT_STYLE)
        for (const spp of item.styledProperties()) {
            TWrite.writeProperty(item, xml, spp.pid)
        }
        TWrite.writeItemProperties(item, xml, ctx)
    }

    static writeOrnament(item: Ornament, xml: XmlWriter, ctx: WriteContext): void {
        if (!ctx.canWrite(item)) {
            return
        }
        xml.startElement(item)

        if (item.cueNoteChord()) {
            TWrite.writeChord(item.cueNoteChord()!, xml, ctx)
        } else {
            if (item.accidentalAbove()) {
                TWrite.writeAccidental(item.accidentalAbove()!, xml, ctx)
            }
            if (item.accidentalBelow()) {
                TWrite.writeAccidental(item.accidentalBelow()!, xml, ctx)
            }
        }

        TWrite.writeProperty(item, xml, Pid.INTERVAL_ABOVE)
        TWrite.writeProperty(item, xml, Pid.INTERVAL_BELOW)
        TWrite.writeProperty(item, xml, Pid.ORNAMENT_SHOW_ACCIDENTAL)
        TWrite.writeProperty(item, xml, Pid.ORNAMENT_SHOW_CUE_NOTE)
        TWrite.writeProperty(item, xml, Pid.START_ON_UPPER_NOTE)
        TWrite.writeArticulationProperties(item, xml, ctx)
        xml.endElement()
    }

    static writeBarLine(item: BarLine, xml: XmlWriter, ctx: WriteContext): void {
        xml.startElement(item)

        TWrite.writeProperty(item, xml, Pid.BARLINE_TYPE)
        TWrite.writeProperty(item, xml, Pid.BARLINE_SPAN)
        TWrite.writeProperty(item, xml, Pid.BARLINE_SPAN_FROM)
        TWrite.writeProperty(item, xml, Pid.BARLINE_SPAN_TO)

        for (const e of item.el()) {
            TWrite.writeItem(e, xml, ctx)
        }

        if (ctx.clipboardmode() && item.measure()) {
            xml.tag('playCount', item.measure()!.repeatCount())
        }

        TWrite.writeItemProperties(item, xml, ctx)
        xml.endElement()
    }

    static writeBeam(item: Beam, xml: XmlWriter, ctx: WriteContext): void {
        if (!item.elements().length) {
            return
        }
        xml.startElement(item)
        TWrite.writeItemProperties(item, xml, ctx)

        TWrite.writeProperty(item, xml, Pid.STEM_DIRECTION)
        TWrite.writeProperty(item, xml, Pid.BEAM_NO_SLOPE)
        TWrite.writeProperty(item, xml, Pid.GROW_LEFT)
        TWrite.writeProperty(item, xml, Pid.GROW_RIGHT)
        TWrite.writeProperty(item, xml, Pid.BEAM_CROSS_STAFF_MOVE)

        const idx = item.directionIdx()
        if (item.userModified()) {
            const spatium = item.spatium()
            for (const f of item.beamFragments()) {
                xml.startElement('Fragment')
                xml.tag('y1', f.py1[idx] / spatium)
                xml.tag('y2', f.py2[idx] / spatium)
                xml.endElement()
            }
        }

        // C++ writes the layout beam positions (l1/l2) in test mode for regression testing
        xml.endElement()
    }

    static writeBox(item: Box, xml: XmlWriter, ctx: WriteContext): void {
        xml.startElement(item)
        TWrite.writeBoxProperties(item, xml, ctx)
        xml.endElement()
    }

    static writeBoxProperties(item: Box, xml: XmlWriter, ctx: WriteContext): void {
        if (item.isHBox()) {
            TWrite.writeHBoxProperties(item as HBox, xml, ctx)
            return
        }
        TWrite.writeBoxBaseProperties(item, xml, ctx)
    }

    /** C++ writeProperties(const Box*) */
    static writeBoxBaseProperties(item: Box, xml: XmlWriter, ctx: WriteContext): void {
        for (const id of [
            Pid.BOX_HEIGHT, Pid.BOX_WIDTH, Pid.TOP_GAP, Pid.BOTTOM_GAP,
            Pid.LEFT_MARGIN, Pid.RIGHT_MARGIN, Pid.TOP_MARGIN, Pid.BOTTOM_MARGIN, Pid.BOX_AUTOSIZE, Pid.SIZE_SPATIUM_DEPENDENT,
        ]) {
            const force = ((item.isVBox() || item.isFBox()) && id === Pid.BOX_HEIGHT) || (item.isHBox() && id === Pid.BOX_WIDTH)
            TWrite.writeProperty(item, xml, id, force)
        }
        if (item.isVBox() || item.isFBox() || item.isTBox()) { // C++ isVBoxBase()
            TWrite.writeProperty(item, xml, Pid.PADDING_TO_NOTATION_ABOVE)
            TWrite.writeProperty(item, xml, Pid.PADDING_TO_NOTATION_BELOW)
        }
        TWrite.writeItemProperties(item, xml, ctx)
        for (const e of item.el()) {
            TWrite.writeItem(e, xml, ctx)
        }
    }

    static writeHBox(item: HBox, xml: XmlWriter, ctx: WriteContext): void {
        xml.startElement(item)
        TWrite.writeHBoxProperties(item, xml, ctx)
        xml.endElement()
    }

    static writeHBoxProperties(item: HBox, xml: XmlWriter, ctx: WriteContext): void {
        TWrite.writeProperty(item, xml, Pid.CREATE_SYSTEM_HEADER)
        TWrite.writeBoxBaseProperties(item, xml, ctx)
    }

    static writeFBox(item: FBox, xml: XmlWriter, ctx: WriteContext): void {
        xml.startElement(item)

        TWrite.writeProperty(item, xml, Pid.FRET_FRAME_TEXT_SCALE)
        TWrite.writeProperty(item, xml, Pid.FRET_FRAME_DIAGRAM_SCALE)
        TWrite.writeProperty(item, xml, Pid.FRET_FRAME_COLUMN_GAP)
        TWrite.writeProperty(item, xml, Pid.FRET_FRAME_ROW_GAP)
        TWrite.writeProperty(item, xml, Pid.FRET_FRAME_CHORDS_PER_ROW)
        TWrite.writeProperty(item, xml, Pid.FRET_FRAME_H_ALIGN)

        TWrite.writeBoxBaseProperties(item, xml, ctx)

        xml.endElement()
    }

    static writeTBox(item: TBox, xml: XmlWriter, ctx: WriteContext): void {
        xml.startElement(item)
        TWrite.writeBoxBaseProperties(item, xml, ctx)
        TWrite.writeText(item.text(), xml, ctx)
        xml.endElement()
    }

    static writeBracket(item: Bracket, xml: XmlWriter, ctx: WriteContext): void {
        let isStartTag = false
        switch (item.bracketItem().bracketType()) {
        case BracketType.BRACE:
        case BracketType.SQUARE:
        case BracketType.LINE:
            xml.startElement(item, [['type', TConv.toXmlBracketType(item.bracketItem().bracketType())]])
            isStartTag = true
            break
        case BracketType.NORMAL:
            xml.startElement(item)
            isStartTag = true
            break
        case BracketType.NO_BRACKET:
            break
        }

        if (isStartTag) {
            if (item.bracketItem().column()) {
                xml.tag('level', item.bracketItem().column())
            }

            TWrite.writeItemProperties(item, xml, ctx)

            xml.endElement()
        }
    }

    static writeBreath(item: Breath, xml: XmlWriter, ctx: WriteContext): void {
        if (!ctx.canWrite(item)) {
            return
        }
        xml.startElement(item)
        TWrite.writeProperty(item, xml, Pid.SYMBOL)
        TWrite.writeProperty(item, xml, Pid.PAUSE)
        TWrite.writeItemProperties(item, xml, ctx)
        xml.endElement()
    }

    static writeChord(item: Chord, xml: XmlWriter, ctx: WriteContext): void {
        // C++: the "notes in chords" selection filter may replace the chord with a rest (clipboard only)

        for (const ch of item.graceNotes()) {
            TWrite.writeChord(ch, xml, ctx)
        }
        TWrite.writeChordRestBeam(item, xml, ctx)
        xml.startElement(item)
        TWrite.writeChordRestProperties(item, xml, ctx)
        for (const a of item.articulations()) {
            TWrite.writeItem(a, xml, ctx)
        }
        switch (item.noteType()) {
        case NoteType.NORMAL:
            break
        case NoteType.ACCIACCATURA:
            xml.tag('acciaccatura')
            break
        case NoteType.APPOGGIATURA:
            xml.tag('appoggiatura')
            break
        case NoteType.GRACE4:
            xml.tag('grace4')
            break
        case NoteType.GRACE16:
            xml.tag('grace16')
            break
        case NoteType.GRACE32:
            xml.tag('grace32')
            break
        case NoteType.GRACE8_AFTER:
            xml.tag('grace8after')
            break
        case NoteType.GRACE16_AFTER:
            xml.tag('grace16after')
            break
        case NoteType.GRACE32_AFTER:
            xml.tag('grace32after')
            break
        default:
            break
        }

        const stem = item.stem()
        if (item.noStem()) {
            xml.tag('noStem', item.noStem())
        } else if (stem && (stem.isUserModified() || !stem.userLength().equals(new Spatium(0)))) {
            TWrite.writeStem(stem, xml, ctx)
        }
        if (item.hook() && item.hook()!.isUserModified()) {
            TWrite.writeHook(item.hook()!, xml, ctx)
        }
        if (item.showStemSlash() !== (item.propertyDefault(Pid.SHOW_STEM_SLASH) as boolean)) {
            xml.tag('showStemSlash', item.showStemSlash())
        }
        if (item.stemSlash() && item.stemSlash()!.isUserModified()) {
            TWrite.writeStemSlash(item.stemSlash()!, xml, ctx)
        }
        TWrite.writeProperty(item, xml, Pid.STEM_DIRECTION)

        const notes = item.notes()
        for (let noteIdx = 0; noteIdx < notes.length; ++noteIdx) {
            if (!ctx.canWriteNoteIdx(noteIdx, notes.length)) {
                continue
            }
            TWrite.writeNote(notes[noteIdx], xml, ctx)
        }

        // Write parens
        for (const parenPair of item.noteParentheses()) {
            xml.startElement('NoteParenGroup')
            if (parenPair.leftParen().isUserModified()) {
                TWrite.writeParenthesis(parenPair.leftParen(), xml, ctx)
            }
            if (parenPair.rightParen().isUserModified()) {
                TWrite.writeParenthesis(parenPair.rightParen(), xml, ctx)
            }

            xml.startElement('Notes')
            for (const note of parenPair.notes()) {
                xml.tag('NoteIdx', notes.indexOf(note))
            }
            xml.endElement()
            xml.endElement()
        }

        if (item.arpeggio()) {
            TWrite.writeItem(item.arpeggio()!, xml, ctx)
        }

        if (item.tremoloSingleChord()) {
            TWrite.writeTremoloSingleChord(item.tremoloSingleChord()!, xml, ctx)
        } else if (item.tremoloTwoChord() && item.tremoloTwoChord()!.chord2() !== item) {
            // C++: tremoloChordType() != TremoloChordType::TremoloSecondChord
            TWrite.writeTremoloTwoChord(item.tremoloTwoChord()!, xml, ctx)
        }

        TWrite.writeProperty(item, xml, Pid.COMBINE_VOICE)

        for (const e of item.el()) {
            if (e.isChordLine() && (e as ChordLine).note()) { // this is now written by Note
                continue
            }
            TWrite.writeItem(e, xml, ctx)
        }
        xml.endElement()
    }

    static writeChordRestBeam(item: ChordRest, xml: XmlWriter, ctx: WriteContext): void {
        const b = item.beam()
        if (b && b.elements()[0] === item && !b.generated()) {
            TWrite.writeBeam(b, xml, ctx)
        }
    }

    static writeChordRestProperties(item: ChordRest, xml: XmlWriter, ctx: WriteContext): void {
        TWrite.writeItemProperties(item, xml, ctx)

        //
        // BeamMode default:
        //    REST  - BeamMode::NONE
        //    CHORD - BeamMode::AUTO
        //
        if ((item.isRest() && item.beamMode() !== BeamMode.NONE) || (item.isChord() && item.beamMode() !== BeamMode.AUTO)) {
            xml.tag('BeamMode', TConv.toXmlBeamMode(item.beamMode()))
        }
        TWrite.writeProperty(item, xml, Pid.SMALL)
        if (item.actualDurationType().dots()) {
            xml.tag('dots', item.actualDurationType().dots())
        }
        TWrite.writeProperty(item, xml, Pid.STAFF_MOVE)

        if (item.actualDurationType().isValid()) {
            xml.tag('durationType', TConv.toXmlDurationType(item.actualDurationType().type()))
        }

        if (!item.ticks().isZero() && (!item.actualDurationType().fraction().isValid()
                                       || (item.actualDurationType().fraction().ne(item.ticks())))) {
            xml.tagFraction('duration', item.ticks())
        }

        for (const lyrics of item.lyrics()) {
            TWrite.writeLyrics(lyrics, xml, ctx)
        }

        const curTick = ctx.curTick().ticks()

        if (!item.isGrace()) {
            let t = item.globalTicks()
            if (item.staff()) {
                t = t.div(item.staff()!.timeStretch(ctx.curTick()))
            }
            ctx.incCurTick(t)
        }

        for (const s of item.score().spannerMap().findOverlapping(curTick - 1, curTick + 1)) {
            if (s.generated() || !s.isSlur() || (s as Slur).broken() || !ctx.canWrite(s)) {
                continue
            }

            const isPartialSlur = (s as Slur).partialSpannerDirection() !== PartialSpannerDirection.NONE
            const writeStart = s.startElement() === item && (s.endElement() !== item || isPartialSlur)
            const writeEnd = s.endElement() === item && (s.startElement() !== item || isPartialSlur)

            if (writeStart) {
                TWrite.writeSpannerStart(s, xml, ctx, item, item.track())
            }

            if (writeEnd) {
                TWrite.writeSpannerEnd(s, xml, ctx, item, item.track())
            }
        }
    }

    static writeSpannerStart(s: Spanner, xml: XmlWriter, ctx: WriteContext, current: EngravingItem, track: track_idx_t,
                             tick = new Fraction(-1, 1)): void {
        const frac = spannerFraction(ctx.clipboardmode(), current, tick)
        const w = new SpannerWriter(xml, ctx, current, s, track, frac, true)
        w.write()
    }

    static writeSpannerEnd(s: Spanner, xml: XmlWriter, ctx: WriteContext, current: EngravingItem, track: track_idx_t,
                           tick = new Fraction(-1, 1)): void {
        const frac = spannerFraction(ctx.clipboardmode(), current, tick)
        if (frac.eq(s.score().endTick())) {
            // Write a location tag if the spanner ends on the last tick of the score
            const spannerEndLoc = Location.absolute()
            spannerEndLoc.setFrac(frac)
            spannerEndLoc.setMeasure(0)
            spannerEndLoc.setTrack(track)
            spannerEndLoc.setVoice(track2voice(track))
            spannerEndLoc.setStaff(s.staffIdx())

            const prevLoc = Location.absolute()
            prevLoc.setFrac(ctx.curTick())
            prevLoc.setMeasure(0)
            prevLoc.setTrack(track)
            prevLoc.setVoice(track2voice(track))
            prevLoc.setStaff(s.staffIdx())

            spannerEndLoc.toRelative(prevLoc)
            if (spannerEndLoc.frac().ne(new Fraction(0, 1))) {
                TWrite.writeLocation(spannerEndLoc, xml, ctx)
            }
        }
        const w = new SpannerWriter(xml, ctx, current, s, track, frac, false)
        w.write()
    }

    static writeTupletStart(item: DurationElement, xml: XmlWriter, ctx: WriteContext): void {
        const t = item.tuplet()
        if (t && t.elements()[0] === item) {
            TWrite.writeTupletStart(t, xml, ctx) // recursion
            TWrite.writeTuplet(t, xml, ctx)
        }
    }

    static writeTupletEnd(item: DurationElement, xml: XmlWriter, ctx: WriteContext): void {
        const t = item.tuplet()
        if (t && t.elements()[t.elements().length - 1] === item) {
            xml.tag('endTuplet')
            TWrite.writeTupletEnd(t, xml, ctx) // recursion
        }
    }

    static writeChordLine(item: ChordLine, xml: XmlWriter, ctx: WriteContext): void {
        xml.startElement(item)
        TWrite.writeProperty(item, xml, Pid.CHORD_LINE_TYPE)
        TWrite.writeProperty(item, xml, Pid.CHORD_LINE_STRAIGHT)
        TWrite.writeProperty(item, xml, Pid.CHORD_LINE_WAVY)
        TWrite.writeProperty(item, xml, Pid.PLAY)
        xml.tag('lengthX', item.lengthX(), 0.0)
        xml.tag('lengthY', item.lengthY(), 0.0)
        TWrite.writeItemProperties(item, xml, ctx)
        if (item.modified()) {
            //! NOTE Need separated "given" data and layout data
            const path = item.ldata().path
            const n = path.elementCount()
            xml.startElement('Path')
            for (let i = 0; i < n; ++i) {
                const e = path.elementAt(i)
                const spatium = item.spatium()
                const x = e.x / spatium
                const y = e.y / spatium
                xml.tag('Element', [['type', e.type], ['x', x], ['y', y]])
            }
            xml.endElement()
        }
        xml.endElement()
    }

    static writeClef(item: Clef, xml: XmlWriter, ctx: WriteContext): void {
        xml.startElement(item)
        TWrite.writeProperty(item, xml, Pid.CLEF_TYPE_CONCERT)
        TWrite.writeProperty(item, xml, Pid.CLEF_TYPE_TRANSPOSING)
        TWrite.writeProperty(item, xml, Pid.CLEF_TO_BARLINE_POS)
        TWrite.writeProperty(item, xml, Pid.IS_HEADER)
        TWrite.writeProperty(item, xml, Pid.IS_COURTESY)
        if (!item.showCourtesy()) {
            xml.tag('showCourtesyClef', item.showCourtesy())
        }
        if (item.forInstrumentChange()) {
            xml.tag('forInstrumentChange', item.forInstrumentChange())
        }
        TWrite.writeItemProperties(item, xml, ctx)
        xml.endElement()
    }

    static writeDynamic(item: Dynamic, xml: XmlWriter, ctx: WriteContext): void {
        if (!ctx.canWrite(item)) {
            return
        }
        xml.startElement(item)
        TWrite.writeProperty(item, xml, Pid.DYNAMIC_TYPE)
        TWrite.writeProperty(item, xml, Pid.VELOCITY)
        TWrite.writeProperty(item, xml, Pid.AVOID_BARLINES)
        TWrite.writeProperty(item, xml, Pid.CENTER_ON_NOTEHEAD)
        TWrite.writeProperty(item, xml, Pid.PLAY)
        TWrite.writeProperty(item, xml, Pid.ANCHOR_TO_END_OF_PREVIOUS)

        if (item.isVelocityChangeAvailable()) {
            TWrite.writeProperty(item, xml, Pid.VELO_CHANGE)
            TWrite.writeProperty(item, xml, Pid.VELO_CHANGE_SPEED)
        }

        TWrite.writeTextBaseProperties(item, xml, ctx, item.hasCustomText())
        xml.endElement()
    }

    static writeExpression(item: Expression, xml: XmlWriter, ctx: WriteContext): void {
        if (!ctx.canWrite(item)) {
            return
        }
        xml.startElement(item)
        TWrite.writeTextBaseProperties(item, xml, ctx, true)
        xml.endElement()
    }

    /** C++ writeProperties(const TextBase*, XmlWriter&, WriteContext&, bool writeText) */
    static writeTextBaseProperties(item: TextBase, xml: XmlWriter, ctx: WriteContext, writeText: boolean): void {
        if (item.hasVoiceAssignmentProperties()) {
            TWrite.writeProperty(item, xml, Pid.VOICE_ASSIGNMENT)
            TWrite.writeProperty(item, xml, Pid.DIRECTION)
            TWrite.writeProperty(item, xml, Pid.CENTER_BETWEEN_STAVES)
        }

        TWrite.writeItemProperties(item, xml, ctx)
        TWrite.writeProperty(item, xml, Pid.TEXT_STYLE)

        for (const spp of item.styledProperties()) {
            if (!item.isStyled(spp.pid)) {
                TWrite.writeProperty(item, xml, spp.pid)
            }
        }
        for (const spp of textStyle(item.textStyleType()) ?? []) {
            if (item.isStyled(spp.pid)
                || (spp.pid === Pid.FONT_SIZE && (item.getProperty(spp.pid) as number) === TextBase.UNDEFINED_FONT_SIZE)
                || (spp.pid === Pid.FONT_FACE && (item.getProperty(spp.pid) as string) === TextBase.UNDEFINED_FONT_FAMILY)) {
                continue
            }
            TWrite.writeProperty(item, xml, spp.pid)
        }
        if (writeText) {
            const xmlStr = TWrite.lineBreakToTag(item.xmlText())
            xml.writeXml('text', xmlStr)
        }

        TWrite.writeProperty(item, xml, Pid.TEXT_LINKED_TO_MASTER)
    }

    static writeFermata(item: Fermata, xml: XmlWriter, ctx: WriteContext): void {
        if (!ctx.canWrite(item)) {
            return
        }

        xml.startElement(item)
        xml.tag('subtype', SymNames.nameForSymId(item.symId()))
        TWrite.writeProperty(item, xml, Pid.TIME_STRETCH)
        TWrite.writeProperty(item, xml, Pid.PLAY)
        TWrite.writeProperty(item, xml, Pid.MIN_DISTANCE)
        if (!item.isStyled(Pid.OFFSET)) {
            TWrite.writeProperty(item, xml, Pid.OFFSET)
        }
        TWrite.writeItemProperties(item, xml, ctx)
        xml.endElement()
    }

    static writeFingering(item: Fingering, xml: XmlWriter, ctx: WriteContext): void {
        if (!ctx.canWrite(item)) {
            return
        }
        xml.startElement(item)
        TWrite.writeTextBaseProperties(item, xml, ctx, true)
        xml.endElement()
    }

    static writeFretDiagram(item: FretDiagram, xml: XmlWriter, ctx: WriteContext): void {
        if (!ctx.canWrite(item)) {
            return
        }
        xml.startElement(item)

        const pids = [
            Pid.MIN_DISTANCE,
            Pid.FRET_OFFSET,
            Pid.FRET_FRETS,
            Pid.FRET_STRINGS,
            Pid.FRET_NUT,
            Pid.MAG,
            Pid.ORIENTATION,
            Pid.FRET_SHOW_FINGERINGS,
            Pid.FRET_FINGERING,
            Pid.EXCLUDE_VERTICAL_ALIGN,
        ]

        // Write properties first and only once
        for (const p of pids) {
            TWrite.writeProperty(item, xml, p)
        }
        TWrite.writeItemProperties(item, xml, ctx)

        if (item.harmony()) {
            TWrite.writeHarmony(item.harmony()!, xml, ctx)
        }

        xml.startElement('fretDiagram')
        for (let i = 0; i < item.strings(); ++i) {
            const m = item.marker(i)
            const allDots = item.dot(i)

            let dotExists = false
            for (const d of allDots) {
                if (d.exists() && !d.isPartOfSlurBarre) { // Don't write dot if part of slur barré (will be generate during layout)
                    dotExists = true
                    break
                }
            }

            // Only write a string if we have anything to write
            if (!dotExists && !m.exists()) {
                continue
            }

            // Start the string writing
            xml.startElement('string', [['no', i]])

            // Write marker
            if (m.exists()) {
                xml.tag('marker', FretItem.markerTypeToName(m.mtype))
            }

            // Write any dots
            for (const d of allDots) {
                if (d.exists()) {
                    // TODO: write fingering
                    xml.tag('dot', [['fret', d.fret]], FretItem.dotTypeToName(d.dtype))
                }
            }

            xml.endElement()
        }

        for (let fi = 1; fi <= item.frets(); ++fi) {
            const b = item.barre(fi)
            if (!b.exists()) {
                continue
            }

            xml.tag('barre', [['start', b.startString], ['end', b.endString]], fi)
        }
        xml.endElement()
        xml.endElement()
    }

    static writeGlissando(item: Glissando, xml: XmlWriter, ctx: WriteContext): void {
        if (!ctx.canWrite(item)) {
            return
        }
        xml.startElement(item)

        xml.tagPropertyByName('text', P_TYPE.STRING, item.text(), item.propertyDefault(Pid.GLISS_TEXT))

        if (ctx.clipboardmode() && item.isHarpGliss() !== null && item.isHarpGliss() !== undefined) {
            xml.tagPropertyByName('isHarpGliss', P_TYPE.BOOL, item.isHarpGliss())
        }

        for (const id of [Pid.GLISS_SHIFT, Pid.GLISS_EASEIN, Pid.GLISS_EASEOUT]) {
            TWrite.writeProperty(item, xml, id)
        }
        for (const spp of item.styledProperties()) {
            TWrite.writeProperty(item, xml, spp.pid)
        }

        TWrite.writeSLineProperties(item, xml, ctx)
        xml.endElement()
    }

    static writeGuitarBend(item: GuitarBend, xml: XmlWriter, ctx: WriteContext): void {
        if (!ctx.canWrite(item)) {
            return
        }
        xml.startElement(item)
        xml.tag('guitarBendType', item.bendType())
        xml.tag('bendStartTimeFactor', item.startTimeFactor())
        xml.tag('bendEndTimeFactor', item.endTimeFactor())

        const targetTimeFactor = item.targetTimeFactor()
        if (targetTimeFactor !== null && targetTimeFactor !== undefined) {
            xml.tag('bendTargetTimeFactor', targetTimeFactor)
        }

        TWrite.writeProperty(item, xml, Pid.DIRECTION)
        TWrite.writeProperty(item, xml, Pid.BEND_SHOW_HOLD_LINE)
        if (item.isDive()) {
            TWrite.writeProperty(item, xml, Pid.GUITAR_DIVE_TAB_POS)
            TWrite.writeProperty(item, xml, Pid.VIBRATO_LINE_TYPE)
            TWrite.writeProperty(item, xml, Pid.GUITAR_DIVE_IS_SLACK)
            if (item.bendType() === GuitarBendType.DIP || item.overlappingBendOrDive()) {
                TWrite.writeProperty(item, xml, Pid.GUITAR_BEND_AMOUNT)
            }
        }

        TWrite.writeSLineProperties(item, xml, ctx)

        const hold = item.holdLine()
        if (hold) {
            xml.startElement(hold)
            TWrite.writeSLineProperties(hold, xml, ctx)
            xml.endElement()
        }

        xml.endElement()
    }

    static writeGuitarBendSegmentProperties(item: GuitarBendSegment, xml: XmlWriter, ctx: WriteContext): void {
        TWrite.writeProperty(item, xml, Pid.BEND_VERTEX_OFF)

        const text = item.bendText()
        if (text && text.isUserModified()) {
            xml.startElement(text)
            TWrite.writeTextBaseProperties(text, xml, ctx, false)
            xml.endElement()
        }
    }

    /** C++ writeProperties(const SLine*) */
    static writeSLineProperties(item: SLine, xml: XmlWriter, ctx: WriteContext): void {
        if (!item.endElement()) {
            item.computeEndElement() // HACK
            if (!item.endElement()) {
                xml.tagFraction('ticks', item.ticks())
            }
        }
        TWrite.writeSpannerProperties(item, xml, ctx)
        if (item.diagonal()) {
            xml.tag('diagonal', item.diagonal())
        }
        TWrite.writeProperty(item, xml, Pid.LINE_WIDTH)
        TWrite.writeProperty(item, xml, Pid.LINE_STYLE)
        TWrite.writeProperty(item, xml, Pid.ANCHOR)
        TWrite.writeProperty(item, xml, Pid.DASH_LINE_LEN)
        TWrite.writeProperty(item, xml, Pid.DASH_GAP_LEN)

        // C++: palette scores write a compatibility <length> (TO PREVENT CRASH IN VERSIONS <4.6.5)

        if (!item.isUserModified()) {
            return
        }

        const spatium = item.style().spatium()
        for (const seg of item.spannerSegments()) {
            xml.startElementFor('Segment', seg)
            xml.tag('subtype', seg.spannerSegmentType())
            xml.tagPoint('offset', seg.offset().div(spatium))
            xml.tagPoint('off2', seg.userOff2().div(spatium))
            TWrite.writeProperty(seg, xml, Pid.MIN_DISTANCE)
            if (seg.isType(ElementType.GUITAR_BEND_SEGMENT)) {
                TWrite.writeGuitarBendSegmentProperties(seg as GuitarBendSegment, xml, ctx)
            }
            TWrite.writeItemProperties(seg, xml, ctx)
            xml.endElement()
        }
    }

    /** C++ writeProperties(const Spanner*) */
    static writeSpannerProperties(item: Spanner, xml: XmlWriter, ctx: WriteContext): void {
        if (ctx.clipboardmode()) {
            xml.tagFraction('ticks_f', item.ticks())
        }
        TWrite.writeProperty(item, xml, Pid.PLAY)
        TWrite.writeItemProperties(item, xml, ctx)
    }

    static writeGradualTempoChange(item: GradualTempoChange, xml: XmlWriter, ctx: WriteContext): void {
        xml.startElement(item)
        TWrite.writeProperty(item, xml, Pid.TEMPO_CHANGE_TYPE)
        TWrite.writeProperty(item, xml, Pid.TEMPO_EASING_METHOD)
        TWrite.writeProperty(item, xml, Pid.TEMPO_CHANGE_FACTOR)
        TWrite.writeProperty(item, xml, Pid.PLACEMENT)
        TWrite.writeProperty(item, xml, Pid.SNAP_AFTER)
        TWrite.writeTextLineBaseProperties(item, xml, ctx)
        xml.endElement()
    }

    /** C++ writeProperties(const TextLineBase*) */
    static writeTextLineBaseProperties(item: TextLineBase, xml: XmlWriter, ctx: WriteContext): void {
        for (const pid of TextLineBase.textLineBasePropertyIds()) {
            if (!item.isStyled(pid)) {
                TWrite.writeProperty(item, xml, pid)
            }
        }

        TWrite.writeSLineProperties(item, xml, ctx)
    }

    /** write(const LetRing*), write(const PalmMute*), write(const Pedal*), write(const WhammyBar*), ... */
    static writeTextLineBaseItem(item: TextLineBase, xml: XmlWriter, ctx: WriteContext): void {
        if (!ctx.canWrite(item)) {
            return
        }
        xml.startElement(item)
        TWrite.writeTextLineBaseProperties(item, xml, ctx)
        xml.endElement()
    }

    static writeGroups(item: Groups, xml: XmlWriter, _ctx: WriteContext): void {
        xml.startElement('Groups')
        for (const n of item.nodes()) {
            xml.tag('Node', [['pos', n.pos], ['action', n.action]])
        }
        xml.endElement()
    }

    static writeHairpin(item: Hairpin, xml: XmlWriter, ctx: WriteContext): void {
        if (!ctx.canWrite(item)) {
            return
        }
        xml.startElement(item)
        xml.tag('subtype', item.hairpinType())
        TWrite.writeProperty(item, xml, Pid.VELO_CHANGE)
        TWrite.writeProperty(item, xml, Pid.HAIRPIN_CIRCLEDTIP)
        TWrite.writeProperty(item, xml, Pid.SINGLE_NOTE_DYNAMICS)
        TWrite.writeProperty(item, xml, Pid.VELO_CHANGE_METHOD)

        TWrite.writeProperty(item, xml, Pid.VOICE_ASSIGNMENT)
        TWrite.writeProperty(item, xml, Pid.DIRECTION)
        TWrite.writeProperty(item, xml, Pid.CENTER_BETWEEN_STAVES)

        TWrite.writeProperty(item, xml, Pid.SNAP_BEFORE)
        TWrite.writeProperty(item, xml, Pid.SNAP_AFTER)

        TWrite.writeProperty(item, xml, Pid.HAIRPIN_HEIGHT)
        TWrite.writeProperty(item, xml, Pid.HAIRPIN_CONT_HEIGHT)

        TWrite.writeTextLineBaseProperties(item, xml, ctx)
        xml.endElement()
    }

    static writeHammerOnPullOff(item: HammerOnPullOff, xml: XmlWriter, ctx: WriteContext): void {
        if (item.broken()) {
            return
        }
        if (!ctx.canWrite(item)) {
            return
        }

        xml.startElement(item)

        TWrite.writeProperty(item, xml, Pid.PARTIAL_SPANNER_DIRECTION)

        TWrite.writeSlurTieProperties(item, xml, ctx)

        xml.endElement()
    }

    /** C++ writeProperties(const HammerOnPullOffSegment*) */
    static writeHammerOnPullOffSegmentProperties(seg: HammerOnPullOffSegment, xml: XmlWriter, ctx: WriteContext): void {
        const texts = seg.hopoText()
        for (let i = 0; i < texts.length; ++i) {
            const hopoText = texts[i]
            if (!hopoText.isUserModified()) {
                continue
            }
            TWrite.writeHammerOnPullOffText(hopoText, xml, ctx, i)
        }
    }

    static writeHammerOnPullOffText(item: HammerOnPullOffText, xml: XmlWriter, ctx: WriteContext, idx: number): void {
        xml.startElement(item, [['idx', idx]])

        TWrite.writeTextBaseProperties(item, xml, ctx, /*writeText*/ false)
        xml.endElement()
    }

    static writeHarmonyInfo(item: HarmonyInfo, h: Harmony, xml: XmlWriter, ctx: WriteContext): void {
        xml.startElement('harmonyInfo')
        if (item.rootTpc() !== Tpc.TPC_INVALID || item.bassTpc() !== Tpc.TPC_INVALID) {
            let rRootTpc = item.rootTpc()
            let rBassTpc = item.bassTpc()
            if (h.staff()) {
                // parent can be a fret diagram
                const segment = h.getParentSeg()
                const tick = segment ? segment.tick() : new Fraction(-1, 1)
                const interval = h.staff()!.transpose(tick)
                if (ctx.clipboardmode() && !h.score().style().styleB(Sid.concertPitch) && interval.chromatic) {
                    rRootTpc = Transpose.transposeTpc(item.rootTpc(), interval, true)
                    rBassTpc = Transpose.transposeTpc(item.bassTpc(), interval, true)
                }
            }

            if (item.id() > 0) {
                xml.tag('extension', item.id())
            }
            // parser uses leading "=" as a hidden specifier for minor
            // this may or may not currently be incorporated into _textName
            let writeName = item.textName()
            const parsed = item.parsedChord()
            if (parsed && parsed.name().startsWith('=') && !writeName.startsWith('=')) {
                writeName = '=' + writeName
            }
            if (writeName) {
                xml.tag('name', writeName)
            }
            if (rRootTpc !== Tpc.TPC_INVALID) {
                xml.tag('root', rRootTpc)
            }
            if (rBassTpc !== Tpc.TPC_INVALID) {
                xml.tag('bass', rBassTpc)
            }
        } else {
            xml.tag('name', item.textName())
        }

        xml.endElement()
    }

    static writeHarmony(item: Harmony, xml: XmlWriter, ctx: WriteContext): void {
        if (!ctx.canWrite(item) || !item.chords().length) {
            return
        }
        xml.startElement(item)
        TWrite.writeProperty(item, xml, Pid.HARMONY_TYPE)
        TWrite.writeProperty(item, xml, Pid.PLAY)

        // check tpcs valid?
        if (item.rootCase() !== NoteCaseType.CAPITAL) {
            xml.tag('rootCase', item.rootCase())
        }

        if (item.bassCase() !== NoteCaseType.CAPITAL) {
            xml.tag('bassCase', item.bassCase())
        }

        for (const info of item.chords()) {
            TWrite.writeHarmonyInfo(info, item, xml, ctx)
        }

        for (const hd of item.degreeList()) { // Do we really still need this?
            const tp = hd.type()
            if (tp === HDegreeType.ADD || tp === HDegreeType.ALTER || tp === HDegreeType.SUBTRACT) {
                xml.startElement('degree')
                xml.tag('degree-value', hd.value())
                xml.tag('degree-alter', hd.alter())
                switch (tp) {
                case HDegreeType.ADD:
                    xml.tag('degree-type', 'add')
                    break
                case HDegreeType.ALTER:
                    xml.tag('degree-type', 'alter')
                    break
                case HDegreeType.SUBTRACT:
                    xml.tag('degree-type', 'subtract')
                    break
                default:
                    break
                }
                xml.endElement()
            }
        }

        TWrite.writeProperty(item, xml, Pid.HARMONY_DO_NOT_STACK_MODIFIERS)
        TWrite.writeTextBaseProperties(item, xml, ctx, false)
        //Pid::HARMONY_VOICE_LITERAL, Pid::HARMONY_VOICING, Pid::HARMONY_DURATION
        //written by the above function call because they are part of element style
        xml.endElement()
    }

    static writeHook(item: Hook, xml: XmlWriter, ctx: WriteContext): void {
        xml.startElement(item)
        xml.tag('name', SymNames.nameForSymId(item.sym()))
        if (item.scoreFont()) {
            xml.tag('font', item.scoreFont()!.name())
        }
        TWrite.writeBSymbolProperties(item, xml, ctx)
        xml.endElement()
    }

    /** C++ writeProperties(const BSymbol*) */
    static writeBSymbolProperties(item: BSymbol, xml: XmlWriter, ctx: WriteContext): void {
        for (const e of item.leafs()) {
            TWrite.writeItem(e, xml, ctx)
        }
        TWrite.writeItemProperties(item, xml, ctx)
    }

    static writeInstrument(item: Instrument, xml: XmlWriter, _ctx: WriteContext, part: Part | null): void {
        if (!item.id()) {
            xml.startElement('Instrument')
        } else {
            xml.startElement('Instrument', [['id', item.id()]])
        }

        if (item.soundId()) {
            xml.tag('soundId', item.soundId())
        }

        TWrite.writeStaffNameList(item.longNames(), xml, 'longName')
        TWrite.writeStaffNameList(item.shortNames(), xml, 'shortName')
        xml.tag('trackName', item.trackName())
        if (item.minPitchP() > MIN_PITCH) {
            xml.tag('minPitchP', item.minPitchP())
        }
        if (item.maxPitchP() < MAX_PITCH) {
            xml.tag('maxPitchP', item.maxPitchP())
        }
        if (item.minPitchA() > MIN_PITCH) {
            xml.tag('minPitchA', item.minPitchA())
        }
        if (item.maxPitchA() < MAX_PITCH) {
            xml.tag('maxPitchA', item.maxPitchA())
        }
        if (item.transpose().diatonic) {
            xml.tag('transposeDiatonic', item.transpose().diatonic)
        }
        if (item.transpose().chromatic) {
            xml.tag('transposeChromatic', item.transpose().chromatic)
        }
        if (item.musicXmlId()) {
            xml.tag('instrumentId', item.musicXmlId())
        }
        if (item.useDrumset()) {
            xml.tag('useDrumset', item.useDrumset())
            item.drumset()!.save(xml)
        }
        for (let i = 0; i < item.cleffTypeCount(); ++i) {
            const ct = item.clefType(i)
            if (ct.concertClef === ct.transposingClef) {
                if (ct.concertClef !== ClefType.G) {
                    if (i) {
                        xml.tag('clef', [['staff', i + 1]], TConv.toXmlClefType(ct.concertClef))
                    } else {
                        xml.tag('clef', TConv.toXmlClefType(ct.concertClef))
                    }
                }
            } else {
                if (i) {
                    xml.tag('concertClef', [['staff', i + 1]], TConv.toXmlClefType(ct.concertClef))
                    xml.tag('transposingClef', [['staff', i + 1]], TConv.toXmlClefType(ct.transposingClef))
                } else {
                    xml.tag('concertClef', TConv.toXmlClefType(ct.concertClef))
                    xml.tag('transposingClef', TConv.toXmlClefType(ct.transposingClef))
                }
            }
        }

        if (item.singleNoteDynamics() !== item.getSingleNoteDynamicsFromTemplate()) {
            xml.tag('singleNoteDynamics', item.singleNoteDynamics())
        }

        if (item.glissandoStyle() !== GlissandoStyle.CHROMATIC) {
            xml.tag('glissandoStyle', TConv.toXmlGlissandoStyle(item.glissandoStyle()))
        }

        if (!item.stringData().isNull()) {
            TWrite.writeStringData(item.stringData(), xml)
        }

        for (const a of item.midiActions()) {
            TWrite.writeNamedEventList(a, xml, 'MidiAction')
        }
        for (const a of item.articulation()) {
            TWrite.writeMidiArticulation(a, xml)
        }
        for (const a of item.channels()) {
            TWrite.writeInstrChannel(a, xml, part)
        }
        xml.endElement()
    }

    static writeInstrChannel(item: InstrChannel, xml: XmlWriter, _part: Part | null): void {
        if (!item.name() || item.name() === InstrChannel.DEFAULT_NAME) {
            xml.startElement('Channel')
        } else {
            xml.startElement('Channel', [['name', item.name()]])
        }
        if (item.color() !== InstrChannel.DEFAULT_COLOR) {
            xml.tag('color', item.color())
        }

        for (const e of item.initList()) {
            if (e.type() === ME_INVALID) {
                continue
            }
            if (e.type() === ME_CONTROLLER) {
                // Don't write bank if automatically switched, but always write if switched by the user
                if (e.dataA() === CTRL_HBANK && e.dataB() === 0 && !item.userBankController()) {
                    continue
                }
                if (e.dataA() === CTRL_LBANK && e.dataB() === 0 && !item.userBankController()) {
                    continue
                }
                if (e.dataA() === CTRL_VOLUME && e.dataB() === 100) {
                    continue
                }
                if (e.dataA() === CTRL_PANPOT && e.dataB() === 64) {
                    continue
                }
                if (e.dataA() === CTRL_REVERB_SEND && e.dataB() === 0) {
                    continue
                }
                if (e.dataA() === CTRL_CHORUS_SEND && e.dataB() === 0) {
                    continue
                }
            }

            midiEventWrite(e, xml)
        }
        xml.tag('synti', item.synti())

        // TODO(port): midiPort/midiChannel (only written if the score's MIDI mapping is exported, checkMidiMapping)
        for (const a of item.midiActions) {
            TWrite.writeNamedEventList(a, xml, 'MidiAction')
        }
        for (const a of item.articulation) {
            TWrite.writeMidiArticulation(a, xml)
        }
        xml.endElement()
    }

    static writeMidiArticulation(item: MidiArticulation, xml: XmlWriter): void {
        if (!item.name) {
            xml.startElement('Articulation')
        } else {
            xml.startElement('Articulation', [['name', item.name]])
        }
        if (item.descr) {
            xml.tag('descr', item.descr)
        }
        xml.tag('velocity', item.velocity)
        xml.tag('gateTime', item.gateTime)
        xml.endElement()
    }

    static writeStaffName(item: StaffName, xml: XmlWriter, tag: string): void {
        if (item.name()) {
            const name = TWrite.lineBreakToTag(item.name())
            if (item.pos() === 0) {
                xml.writeXml(tag, name)
            } else {
                xml.writeXml(`${tag} pos="${item.pos()}"`, name)
            }
        }
    }

    static writeStaffNameList(item: readonly StaffName[], xml: XmlWriter, name: string): void {
        for (const sn of item) {
            TWrite.writeStaffName(sn, xml, name)
        }
    }

    static writeNamedEventList(item: NamedEventList, xml: XmlWriter, n: string): void {
        xml.startElement(n, [['name', item.name]])
        if (item.descr) {
            xml.tag('descr', item.descr)
        }
        for (const e of item.events) {
            midiEventWrite(e, xml)
        }
        xml.endElement()
    }

    static writeInstrumentChange(item: InstrumentChange, xml: XmlWriter, ctx: WriteContext): void {
        xml.startElement(item)
        TWrite.writeInstrument(item.instrument(), xml, ctx, item.part())
        if (item.init()) {
            xml.tag('init', item.init())
        }
        TWrite.writeTextBaseProperties(item, xml, ctx, true)
        xml.endElement()
    }

    static writeJump(item: Jump, xml: XmlWriter, ctx: WriteContext): void {
        xml.startElement(item)
        TWrite.writeTextBaseProperties(item, xml, ctx, true)
        xml.tag('jumpTo', item.jumpTo())
        xml.tag('playUntil', item.playUntil())
        xml.tag('continueAt', item.continueAt())
        TWrite.writeProperty(item, xml, Pid.PLAY_REPEATS)
        xml.endElement()
    }

    static writeKeySig(item: KeySig, xml: XmlWriter, ctx: WriteContext): void {
        xml.startElement(item)
        TWrite.writeItemProperties(item, xml, ctx)
        if (item.isAtonal()) {
            xml.tag('custom', 1)
        } else {
            xml.tag('concertKey', item.concertKey())
            if (item.concertKey() !== item.key()) {
                xml.tag('actualKey', item.key())
            }
            if (item.isCustom()) {
                xml.tag('custom', 1)
                for (const cd of item.customKeyDefs()) {
                    xml.startElement('CustDef')
                    xml.tag('sym', SymNames.nameForSymId(cd.sym))
                    xml.tag('def', [['degree', cd.degree], ['xAlt', cd.xAlt], ['octAlt', cd.octAlt]])
                    xml.endElement()
                }
            }
        }

        if (item.mode() !== KeyMode.UNKNOWN) {
            xml.tag('mode', TConv.toXmlKeyMode(item.mode()))
        }

        TWrite.writeProperty(item, xml, Pid.SHOW_COURTESY)
        TWrite.writeProperty(item, xml, Pid.IS_COURTESY)

        if (item.forInstrumentChange()) {
            xml.tag('forInstrumentChange', true)
        }
        xml.endElement()
    }

    static writeLaissezVib(item: LaissezVib, xml: XmlWriter, ctx: WriteContext): void {
        xml.startElement(item)
        TWrite.writeProperty(item, xml, Pid.MIN_LENGTH)
        TWrite.writeProperty(item, xml, Pid.TIE_PLACEMENT)
        TWrite.writeSlurTieProperties(item, xml, ctx)
        xml.endElement()
    }

    static writeLayoutBreak(item: LayoutBreak, xml: XmlWriter, ctx: WriteContext): void {
        xml.startElement(item)
        TWrite.writeItemProperties(item, xml, ctx)

        for (const id of [Pid.LAYOUT_BREAK, Pid.PAUSE, Pid.START_WITH_LONG_NAMES, Pid.START_WITH_MEASURE_ONE,
            Pid.FIRST_SYSTEM_INDENTATION, Pid.SHOW_COURTESY]) {
            TWrite.writeProperty(item, xml, id)
        }

        xml.endElement()
    }

    static writeLedgerLine(item: LedgerLine, xml: XmlWriter, _ctx: WriteContext): void {
        xml.startElement(item)
        xml.tag('lineWidth', item.width() / item.spatium())
        xml.tag('lineLen', item.len() / item.spatium())
        if (!item.vertical()) {
            xml.tag('vertical', item.vertical())
        }
        xml.endElement()
    }

    static writeLocation(item: Location, xml: XmlWriter, _ctx: WriteContext): void {
        const relDefaults = Location.relative()

        xml.startElement('location')
        xml.tag('staves', item.staff(), relDefaults.staff())
        xml.tag('voices', item.voice(), relDefaults.voice())
        xml.tag('measures', item.measure(), relDefaults.measure())
        xml.tagFraction('fractions', item.frac().reduced(), relDefaults.frac())
        xml.tag('grace', item.graceIndex(), relDefaults.graceIndex())
        xml.tag('notes', item.note(), relDefaults.note())
        xml.tag('timeTick', item.isTimeTick(), false)
        xml.endElement()
    }

    static writeLyrics(item: Lyrics, xml: XmlWriter, ctx: WriteContext): void {
        if (!ctx.canWrite(item)) {
            return
        }
        xml.startElement(item)
        TWrite.writeProperty(item, xml, Pid.VERSE)
        if (item.syllabic() !== LyricsSyllabic.SINGLE) {
            xml.tag('syllabic', TConv.toXmlLyricsSyllabic(item.syllabic()))
        }
        TWrite.writeProperty(item, xml, Pid.LYRIC_TICKS)

        TWrite.writeTextBaseProperties(item, xml, ctx, true)
        const separator = item.separator()
        if (separator && !separator.generated()) {
            TWrite.writeLyricsLine(separator as LyricsLine, xml, ctx)
        }
        xml.endElement()
    }

    static writeLyricsLine(item: LyricsLine, xml: XmlWriter, ctx: WriteContext): void {
        if (!ctx.canWrite(item)) {
            return
        }
        xml.startElement(item)
        TWrite.writeSLineProperties(item, xml, ctx)
        xml.endElement()
    }

    static writeMarker(item: Marker, xml: XmlWriter, ctx: WriteContext): void {
        xml.startElement(item)
        TWrite.writeTextBaseProperties(item, xml, ctx, true)
        xml.tag('label', item.label())
        TWrite.writeProperty(item, xml, Pid.MARKER_TYPE)
        TWrite.writeProperty(item, xml, Pid.MARKER_CENTER_ON_SYMBOL)
        xml.endElement()
    }

    /** write(const MeasureNumber*), write(const MMRestRange*), write(const RehearsalMark*), ... */
    static writeTextBaseItem(item: TextBase, xml: XmlWriter, ctx: WriteContext): void {
        if (!ctx.canWrite(item)) {
            return
        }
        xml.startElement(item)
        TWrite.writeTextBaseProperties(item, xml, ctx, true)
        xml.endElement()
    }

    static writeMeasureRepeat(item: MeasureRepeat, xml: XmlWriter, ctx: WriteContext): void {
        xml.startElement(item)
        TWrite.writeProperty(item, xml, Pid.SUBTYPE)
        TWrite.writeRestProperties(item, xml, ctx)
        TWrite.writeItems(item.el(), xml, ctx)
        xml.endElement()
    }

    static writeRestProperties(item: Rest, xml: XmlWriter, ctx: WriteContext): void {
        TWrite.writeChordRestProperties(item, xml, ctx)
    }

    static writeMMRest(item: MMRest, xml: XmlWriter, ctx: WriteContext): void {
        xml.startElementFor('Rest', item) // for compatibility, see also Measure::readVoice()
        TWrite.writeChordRestProperties(item, xml, ctx)
        TWrite.writeProperty(item, xml, Pid.MMREST_NUMBER_OFFSET)
        TWrite.writeProperty(item, xml, Pid.MMREST_NUMBER_VISIBLE)
        TWrite.writeItems(item.el(), xml, ctx)
        xml.endElement()
    }

    static writeNote(item: Note, xml: XmlWriter, ctx: WriteContext): void {
        xml.startElement(item)
        TWrite.writeItemProperties(item, xml, ctx)

        if (item.accidental()) {
            TWrite.writeAccidental(item.accidental()!, xml, ctx)
        }
        TWrite.writeItems(item.el(), xml, ctx)
        let writeDots = false
        for (const dot of item.dots()) {
            if (!dot.offset().isNull() || !dot.visible() || !dot.color().equals(EngravingConfiguration.defaultColor())
                || dot.visible() !== item.visible()) {
                writeDots = true
                break
            }
        }
        if (writeDots) {
            for (const dot of item.dots()) {
                TWrite.writeNoteDot(dot, xml, ctx)
            }
        }

        if (item.laissezVib()) {
            TWrite.writeLaissezVib(item.laissezVib() as LaissezVib, xml, ctx)
        }

        if (item.incomingPartialTie()) {
            TWrite.writePartialTie(item.incomingPartialTie() as PartialTie, xml, ctx)
        }

        if (item.outgoingPartialTie()) {
            TWrite.writePartialTie(item.outgoingPartialTie() as PartialTie, xml, ctx)
        }

        if (item.tieForNonPartial()) {
            TWrite.writeSpannerStart(item.tieFor()!, xml, ctx, item, item.track())
        }

        if (item.tieBackNonPartial()) {
            TWrite.writeSpannerEnd(item.tieBack()!, xml, ctx, item, item.track())
        }

        // TODO(port): <Events> (note play events, only written if the chord's play event type is not Auto)

        for (const id of [Pid.PITCH, Pid.CENT_OFFSET, Pid.TPC1, Pid.TPC2, Pid.SMALL, Pid.MIRROR_HEAD, Pid.DOT_POSITION,
            Pid.HEAD_SCHEME, Pid.HEAD_GROUP, Pid.USER_VELOCITY, Pid.PLAY, Pid.TUNING, Pid.FRET, Pid.STRING,
            Pid.GHOST, Pid.DEAD, Pid.HEAD_TYPE, Pid.FIXED, Pid.FIXED_LINE]) {
            TWrite.writeProperty(item, xml, id)
        }

        for (const e of item.spannerFor()) {
            TWrite.writeSpannerStart(e, xml, ctx, item, item.track())
        }
        for (const e of item.spannerBack()) {
            TWrite.writeSpannerEnd(e, xml, ctx, item, item.track())
        }

        for (const e of item.chord().el()) {
            if (e.isChordLine() && (e as ChordLine).note() && (e as ChordLine).note() === item) {
                TWrite.writeChordLine(e as ChordLine, xml, ctx)
            }
        }

        if (item.overrideBendVisibilityRules()) {
            xml.tag('overrideBendVisibilityRules', true)
        }

        TWrite.writeProperty(item, xml, Pid.HIDE_GENERATED_PARENTHESES)

        xml.endElement()
    }

    static writeNoteDot(item: NoteDot, xml: XmlWriter, ctx: WriteContext): void {
        xml.startElement(item)
        TWrite.writeItemProperties(item, xml, ctx)
        xml.endElement()
    }

    static writeOttava(item: Ottava, xml: XmlWriter, ctx: WriteContext): void {
        if (!ctx.canWrite(item)) {
            return
        }
        xml.startElement(item)
        TWrite.writeProperty(item, xml, Pid.OTTAVA_TYPE)
        TWrite.writeProperty(item, xml, Pid.PLACEMENT)
        TWrite.writeProperty(item, xml, Pid.NUMBERS_ONLY)
        TWrite.writeTextLineBaseProperties(item, xml, ctx)
        xml.endElement()
    }

    static writeParenthesis(item: Parenthesis, xml: XmlWriter, ctx: WriteContext): void {
        if (!ctx.canWrite(item)) {
            return
        }

        xml.startElement(item)
        TWrite.writeProperty(item, xml, Pid.HORIZONTAL_DIRECTION)
        TWrite.writeItemProperties(item, xml, ctx)
        xml.endElement()
    }

    static writePart(item: Part, xml: XmlWriter, ctx: WriteContext): void {
        xml.startElement(item, [['id', item.id()]])

        const shouldWriteStaff = (staff: Staff): boolean => {
            const range = ctx.range()
            if (!range) {
                return true
            }
            const idx = staff.idx()
            return idx >= range.startStaffIdx && idx < range.endStaffIdx
        }

        for (const staff of item.staves()) {
            if (shouldWriteStaff(staff)) {
                TWrite.writeStaff(staff, xml, ctx)
            }
        }

        if (!item.show()) {
            xml.tag('show', item.show())
        }

        if (item.soloist()) {
            xml.tag('soloist', item.soloist())
        }

        xml.tag('trackName', item.partName())

        if (item.color() !== Part.DEFAULT_COLOR) {
            xml.tag('color', item.color())
        }

        if (item.hideWhenEmpty() !== AutoOnOff.AUTO) {
            xml.tag('hideWhenEmpty', TConv.toXmlAutoOnOff(item.hideWhenEmpty()))
        }

        if (item.hideStavesWhenIndividuallyEmpty()) {
            xml.tag('hideStavesWhenIndividuallyEmpty', item.hideStavesWhenIndividuallyEmpty())
        }

        if (item.preferSharpFlat() !== PreferSharpFlat.AUTO) {
            switch (item.preferSharpFlat()) {
            case PreferSharpFlat.AUTO:
                break
            case PreferSharpFlat.FLATS:
                xml.tag('preferSharpFlat', 'flats')
                break
            case PreferSharpFlat.SHARPS:
                xml.tag('preferSharpFlat', 'flats') // sic (C++)
                break
            case PreferSharpFlat.NONE:
                xml.tag('preferSharpFlat', 'none')
                break
            default:
                break
            }
        }

        TWrite.writeInstrument(item.instrument(), xml, ctx, item)

        xml.endElement()
    }

    static writePartialTie(item: PartialTie, xml: XmlWriter, ctx: WriteContext): void {
        xml.startElement(item)
        TWrite.writeProperty(item, xml, Pid.TIE_PLACEMENT)
        TWrite.writeProperty(item, xml, Pid.PARTIAL_SPANNER_DIRECTION)
        TWrite.writeSlurTieProperties(item, xml, ctx)
        xml.endElement()
    }

    static writeRest(item: Rest, xml: XmlWriter, ctx: WriteContext): void {
        if (item.isGap()) {
            return
        }
        TWrite.writeChordRestBeam(item, xml, ctx)
        xml.startElement(item)
        TWrite.writeStyledProperties(item, xml)
        TWrite.writeProperty(item, xml, Pid.ALIGN_WITH_OTHER_RESTS)
        TWrite.writeChordRestProperties(item, xml, ctx)
        TWrite.writeItems(item.el(), xml, ctx)
        let writeDots = false
        for (const dot of item.dotList()) {
            if (!dot.offset().isNull() || !dot.visible() || !dot.color().equals(EngravingConfiguration.defaultColor())
                || dot.visible() !== item.visible()) {
                writeDots = true
                break
            }
        }
        if (writeDots) {
            for (const dot of item.dotList()) {
                TWrite.writeNoteDot(dot, xml, ctx)
            }
        }
        xml.endElement()
    }

    static writeSegment(item: Segment, xml: XmlWriter, _ctx: WriteContext): void {
        if (item.written()) {
            return
        }
        item.setWritten(true)
        if (item.extraLeadingSpace().val() === 0) {
            return
        }
        xml.startElement(item)
        xml.tag('leadingSpace', item.extraLeadingSpace().val())
        xml.endElement()
    }

    static writeSlur(item: Slur, xml: XmlWriter, ctx: WriteContext): void {
        if (item.broken()) {
            // C++ logs "broken slur not written"
            return
        }
        if (!ctx.canWrite(item)) {
            return
        }
        xml.startElement(item)

        TWrite.writeProperty(item, xml, Pid.PARTIAL_SPANNER_DIRECTION)

        TWrite.writeSlurTieProperties(item, xml, ctx)
        xml.endElement()
    }

    /** C++ writeProperties(const SlurTie*) */
    static writeSlurTieProperties(item: SlurTie, xml: XmlWriter, ctx: WriteContext): void {
        TWrite.writeSpannerProperties(item, xml, ctx)
        let idx = 0
        for (const ss of item.spannerSegments()) {
            TWrite.writeSlurSegment(ss as SlurTieSegment, xml, ctx, idx++)
        }
        TWrite.writeProperty(item, xml, Pid.SLUR_DIRECTION)
        TWrite.writeProperty(item, xml, Pid.SLUR_STYLE_TYPE)
    }

    /** C++ writeSlur(const SlurTieSegment*, ...) */
    static writeSlurSegment(seg: SlurTieSegment, xml: XmlWriter, ctx: WriteContext, no: number): void {
        if (!seg.isUserModified()) {
            return
        }

        xml.startElement(seg, [['no', no]])

        const spatium = seg.style().spatium()
        if (!seg.ups(Grip.START).off.isNull()) {
            xml.tagPoint('o1', seg.ups(Grip.START).off.div(spatium))
        }
        if (!seg.ups(Grip.BEZIER1).off.isNull()) {
            xml.tagPoint('o2', seg.ups(Grip.BEZIER1).off.div(spatium))
        }
        if (!seg.ups(Grip.BEZIER2).off.isNull()) {
            xml.tagPoint('o3', seg.ups(Grip.BEZIER2).off.div(spatium))
        }
        if (!seg.ups(Grip.END).off.isNull()) {
            xml.tagPoint('o4', seg.ups(Grip.END).off.div(spatium))
        }

        if (seg.isType(ElementType.HAMMER_ON_PULL_OFF_SEGMENT)) {
            TWrite.writeHammerOnPullOffSegmentProperties(seg as HammerOnPullOffSegment, xml, ctx)
        }

        TWrite.writeItemProperties(seg, xml, ctx)
        xml.endElement()
    }

    static writeSpacer(item: Spacer, xml: XmlWriter, ctx: WriteContext): void {
        xml.startElement(item)
        xml.tag('subtype', item.spacerType())
        TWrite.writeItemProperties(item, xml, ctx)
        xml.tag('space', item.gap().val())
        xml.endElement()
    }

    static writeStaff(item: Staff, xml: XmlWriter, ctx: WriteContext): void {
        xml.startElement(item)

        TWrite.writeItemEid(item, xml, ctx)
        TWrite.writeItemLink(item, xml, ctx)

        // for copy/paste we need to know the actual transposition
        if (ctx.clipboardmode()) {
            const v = item.part().instrument().transpose() // TODO: tick?
            if (v.diatonic) {
                xml.tag('transposeDiatonic', v.diatonic)
            }
            if (v.chromatic) {
                xml.tag('transposeChromatic', v.chromatic)
            }
        }

        TWrite.writeStaffType(item.staffType(new Fraction(0, 1)), xml, ctx)
        const ct = item.defaultClefType()
        if (ct.concertClef === ct.transposingClef) {
            if (ct.concertClef !== ClefType.G) {
                xml.tag('defaultClef', TConv.toXmlClefType(ct.concertClef))
            }
        } else {
            xml.tag('defaultConcertClef', TConv.toXmlClefType(ct.concertClef))
            xml.tag('defaultTransposingClef', TConv.toXmlClefType(ct.transposingClef))
        }

        if (item.hideWhenEmpty() !== AutoOnOff.AUTO) {
            xml.tag('hideWhenEmpty', TConv.toXmlAutoOnOff(item.hideWhenEmpty()))
        }
        if (item.cutaway()) {
            xml.tag('cutaway', item.cutaway())
        }
        if (item.showIfEntireSystemEmpty()) {
            xml.tag('showIfSystemEmpty', item.showIfEntireSystemEmpty())
        }
        if (item.hideSystemBarLine()) {
            xml.tag('hideSystemBarLine', item.hideSystemBarLine())
        }
        if (item.mergeMatchingRests() !== AutoOnOff.AUTO) {
            xml.tag('mergeMatchingRests', TConv.toXmlAutoOnOff(item.mergeMatchingRests()))
        }
        if (!item.visible()) {
            xml.tag('isStaffVisible', item.visible())
        }

        for (const i of item.brackets()) {
            const a = i.bracketType()
            const b = i.bracketSpan()
            if (a === BracketType.NO_BRACKET || b === 0) {
                continue
            }
            const attrs: Array<[string, string | number | boolean]> = [
                ['type', a],
                ['span', b],
                ['col', i.column()],
                ['visible', i.visible()],
            ]
            if (!i.color().equals(EngravingConfiguration.defaultColor())) {
                attrs.push(['color', i.color().toString()])
            }
            xml.tag('bracket', attrs)
        }

        TWrite.writeProperty(item, xml, Pid.STAFF_BARLINE_SPAN)
        TWrite.writeProperty(item, xml, Pid.STAFF_BARLINE_SPAN_FROM)
        TWrite.writeProperty(item, xml, Pid.STAFF_BARLINE_SPAN_TO)
        TWrite.writeProperty(item, xml, Pid.STAFF_USERDIST)
        TWrite.writeProperty(item, xml, Pid.PLAYBACK_VOICE1)
        TWrite.writeProperty(item, xml, Pid.PLAYBACK_VOICE2)
        TWrite.writeProperty(item, xml, Pid.PLAYBACK_VOICE3)
        TWrite.writeProperty(item, xml, Pid.PLAYBACK_VOICE4)
        TWrite.writeProperty(item, xml, Pid.SHOW_MEASURE_NUMBERS)

        xml.endElement()
    }

    static writeStaffText(item: StaffText, xml: XmlWriter, ctx: WriteContext): void {
        if (!ctx.canWrite(item)) {
            return
        }

        xml.startElement(item)

        TWrite.writeStaffTextBaseProperties(item, xml, ctx)

        // TODO(port): sound flags

        xml.endElement()
    }

    static writeStaffTextBase(item: StaffTextBase, xml: XmlWriter, ctx: WriteContext): void {
        if (!ctx.canWrite(item)) {
            return
        }

        xml.startElement(item)
        TWrite.writeStaffTextBaseProperties(item, xml, ctx)
        xml.endElement()
    }

    static writeStaffTextBaseProperties(item: StaffTextBase, xml: XmlWriter, ctx: WriteContext): void {
        for (const s of item.channelActions()) {
            const channel = s.channel
            for (const name of s.midiActionNames) {
                xml.tag('MidiAction', [['channel', channel], ['name', name]])
            }
        }
        for (let voice = 0; voice < VOICES; ++voice) {
            if (item.channelName(voice)) {
                xml.tag('channelSwitch', [['voice', voice], ['name', item.channelName(voice)]])
            }
        }
        if (item.setAeolusStops()) {
            for (let i = 0; i < 4; ++i) {
                xml.tag('aeolus', [['group', i]], item.aeolusStop(i))
            }
        }
        if (item.swing()) {
            let swingUnit: DurationType
            if (item.swingParameters().swingUnit === Constants.DIVISION / 2) {
                swingUnit = DurationType.V_EIGHTH
            } else if (item.swingParameters().swingUnit === Constants.DIVISION / 4) {
                swingUnit = DurationType.V_16TH
            } else {
                swingUnit = DurationType.V_ZERO
            }
            const swingRatio = item.swingParameters().swingRatio
            xml.tag('swing', [['unit', TConv.toXmlDurationType(swingUnit)], ['ratio', swingRatio]])
        }

        TWrite.writeTextBaseProperties(item, xml, ctx, true)
    }

    static writeStaffType(item: StaffType, xml: XmlWriter, ctx: WriteContext): void {
        xml.startElement('StaffType', [['group', TConv.toXmlStaffGroup(item.group())]])
        if (item.xmlName()) {
            xml.tag('name', item.xmlName())
        }
        if (item.lines() !== 5) {
            xml.tag('lines', item.lines())
        }
        if (!isEqualReal(item.lineDistance().val(), 1.0)) {
            xml.tag('lineDistance', item.lineDistance().val())
        }
        if (!isZero(item.yoffset().val())) {
            xml.tag('yoffset', item.yoffset().val())
        }
        if (!isEqualReal(item.userMag(), 1.0)) {
            xml.tag('mag', item.userMag())
        }
        if (item.isSmall()) {
            xml.tag('small', item.isSmall())
        }
        if (item.stepOffset()) {
            xml.tag('stepOffset', item.stepOffset())
        }
        if (!item.genClef()) {
            xml.tag('clef', item.genClef())
        }
        if (item.stemless()) {
            xml.tag('stemless', item.stemless())
        }
        if (!item.showBarlines()) {
            xml.tag('barlines', item.showBarlines())
        }
        if (!item.genTimesig()) {
            xml.tag('timesig', item.genTimesig())
        }
        if (item.invisible()) {
            xml.tag('invisible', item.invisible())
        }
        if (!item.color().equals(EngravingConfiguration.defaultColor())) {
            xml.tagProperty(Pid.COLOR, item.color())
        }
        if (item.group() === StaffGroup.STANDARD) {
            xml.tag('noteheadScheme', TConv.toXmlNoteHeadScheme(item.noteHeadScheme()),
                TConv.toXmlNoteHeadScheme(NoteHeadScheme.HEAD_NORMAL))
        }
        if (item.group() === StaffGroup.STANDARD || item.group() === StaffGroup.PERCUSSION) {
            if (!item.genKeysig()) {
                xml.tag('keysig', item.genKeysig())
            }
            if (!item.showLedgerLines()) {
                xml.tag('ledgerlines', item.showLedgerLines())
            }
        } else {
            xml.tag('durations', item.genDurations())
            xml.tag('durationFontName', item.durationFontName()) // write font names anyway for backward compatibility
            xml.tag('durationFontSize', item.durationFontSize())
            xml.tag('durationFontY', item.durationFontUserY())
            if (item.symRepeat() !== 0) { // TablatureSymbolRepeat::NEVER
                xml.tag('symbolRepeat', item.symRepeat())
            }
            xml.tag('fretUseTextStyle', item.fretUseTextStyle())
            if (item.fretUseTextStyle()) {
                xml.tag('fretTextStyle', TConv.toXmlTextStyleType(item.fretTextStyle()))
            } else {
                xml.tag('fretPresetIdx', item.fretPresetIdx())
                xml.tag('fretFontSize', item.fretFontSize())
                xml.tag('fretFontY', item.fretFontUserY())
            }
            xml.tag('linesThrough', item.linesThrough())
            xml.tag('minimStyle', item.minimStyle())
            xml.tag('onLines', item.onLines())
            xml.tag('showRests', item.showRests())
            xml.tag('stemsDown', item.stemsDown())
            xml.tag('stemsThrough', item.stemThrough())
            xml.tag('upsideDown', item.upsideDown())
            xml.tag('showTabFingering', item.showTabFingering(), false)
            xml.tag('useNumbers', item.useNumbers())
            // only output "showBackTied" if different from !"stemless"
            // to match the behaviour in 2.0.2 scores (or older)
            if (item.showBackTied() !== !item.stemless()) {
                xml.tag('showBackTied', item.showBackTied())
            }
        }
        xml.endElement()
    }

    static writeStaffTypeChange(item: StaffTypeChange, xml: XmlWriter, ctx: WriteContext): void {
        xml.startElement(item)
        if (item.staffType()) {
            TWrite.writeStaffType(item.staffType()!, xml, ctx)
        }
        TWrite.writeItemProperties(item, xml, ctx)
        xml.endElement()
    }

    static writeStem(item: Stem, xml: XmlWriter, ctx: WriteContext): void {
        xml.startElement(item)
        TWrite.writeItemProperties(item, xml, ctx)
        TWrite.writeProperty(item, xml, Pid.USER_LEN)
        TWrite.writeProperty(item, xml, Pid.LINE_WIDTH)
        xml.endElement()
    }

    static writeStemSlash(item: EngravingItem, xml: XmlWriter, ctx: WriteContext): void {
        xml.startElement(item)
        TWrite.writeItemProperties(item, xml, ctx)
        xml.endElement()
    }

    static writeStringData(item: StringData, xml: XmlWriter): void {
        xml.startElement('StringData')
        xml.tag('frets', item.frets())
        for (const strg of item.stringList()) {
            const attrs: Array<[string, string]> = []
            if (strg.open) {
                attrs.push(['open', '1'])
            }
            if (strg.useFlat) {
                attrs.push(['useFlat', '1'])
            }
            xml.tag('string', attrs, strg.pitch)
        }
        xml.endElement()
    }

    static writeSymbol(item: Symbol, xml: XmlWriter, ctx: WriteContext): void {
        xml.startElement(item)
        xml.tag('name', SymNames.nameForSymId(item.sym()))
        if (item.scoreFont()) {
            xml.tag('font', item.scoreFont()!.name())
            TWrite.writeProperty(item, xml, Pid.SYMBOLS_SIZE)
            TWrite.writeProperty(item, xml, Pid.SYMBOL_ANGLE)
        }
        TWrite.writeBSymbolProperties(item, xml, ctx)
        xml.endElement()
    }

    static writeTempoText(item: TempoText, xml: XmlWriter, ctx: WriteContext): void {
        xml.startElement(item)
        TWrite.writeProperty(item, xml, Pid.PLAY)
        xml.tag('tempo', TConv.toXmlBeatsPerSecond(item.tempo(), TEMPO_PRECISION))
        if (item.followText()) {
            xml.tag('followText', item.followText())
        }
        switch (item.tempoTextType()) {
        case TempoTextType.NORMAL:
            break
        case TempoTextType.A_TEMPO:
            xml.tag('type', 'aTempo')
            break
        case TempoTextType.TEMPO_PRIMO:
            xml.tag('type', 'tempoPrimo')
            break
        }
        TWrite.writeTextBaseProperties(item, xml, ctx, true)
        xml.endElement()
    }

    static writeText(item: Text, xml: XmlWriter, ctx: WriteContext): void {
        if (!ctx.canWrite(item)) {
            return
        }
        xml.startElement(item)
        TWrite.writeTextBaseProperties(item, xml, ctx, true)
        xml.endElement()
    }

    static writeTextLine(item: TextLine, xml: XmlWriter, ctx: WriteContext): void {
        if (!ctx.canWrite(item)) {
            return
        }
        if (item.systemFlag()) {
            xml.startElement(item, [['system', '1']])
        } else {
            xml.startElement(item)
        }
        // other styled properties are included in TextLineBase pids list
        TWrite.writeProperty(item, xml, Pid.PLACEMENT)
        TWrite.writeProperty(item, xml, Pid.OFFSET)
        TWrite.writeTextLineBaseProperties(item, xml, ctx)
        xml.endElement()
    }

    static writeTie(item: Tie, xml: XmlWriter, ctx: WriteContext): void {
        xml.startElement(item)
        TWrite.writeProperty(item, xml, Pid.TIE_PLACEMENT)
        TWrite.writeSlurTieProperties(item, xml, ctx)
        xml.endElement()
    }

    static writeTimeSig(item: TimeSig, xml: XmlWriter, ctx: WriteContext): void {
        xml.startElement(item)
        TWrite.writeProperty(item, xml, Pid.TIMESIG_TYPE)
        TWrite.writeItemProperties(item, xml, ctx)

        xml.tag('sigN', item.numerator())
        xml.tag('sigD', item.denominator())
        if (item.stretch().ne(new Fraction(1, 1))) {
            xml.tag('stretchN', item.stretch().numerator())
            xml.tag('stretchD', item.stretch().denominator())
        }
        TWrite.writeProperty(item, xml, Pid.NUMERATOR_STRING)
        TWrite.writeProperty(item, xml, Pid.DENOMINATOR_STRING)
        if (!item.groups().empty()) {
            TWrite.writeGroups(item.groups(), xml, ctx)
        }
        TWrite.writeProperty(item, xml, Pid.SHOW_COURTESY)
        TWrite.writeProperty(item, xml, Pid.IS_COURTESY)
        TWrite.writeProperty(item, xml, Pid.SCALE)

        xml.endElement()
    }

    static writeTremoloSingleChord(item: TremoloSingleChord, xml: XmlWriter, ctx: WriteContext): void {
        if (!ctx.canWrite(item)) {
            return
        }

        xml.startElement(item)

        TWrite.writeProperty(item, xml, Pid.TREMOLO_TYPE)
        TWrite.writeProperty(item, xml, Pid.PLAY)
        TWrite.writeItemProperties(item, xml, ctx)
        xml.endElement()
    }

    static writeTremoloTwoChord(item: TremoloTwoChord, xml: XmlWriter, ctx: WriteContext): void {
        if (!ctx.canWrite(item)) {
            return
        }

        xml.startElement(item)

        TWrite.writeProperty(item, xml, Pid.TREMOLO_TYPE)
        TWrite.writeProperty(item, xml, Pid.TREMOLO_STYLE)
        TWrite.writeProperty(item, xml, Pid.PLAY)
        TWrite.writeItemProperties(item, xml, ctx)

        // write manual adjustments to file
        const idx = item.directionIdx()
        if (item.userModified()) {
            const spatium = item.spatium()

            xml.startElement('Fragment')
            xml.tag('y1', item.beamFragment().py1[idx] / spatium)
            xml.tag('y2', item.beamFragment().py2[idx] / spatium)
            xml.endElement()
        }

        // C++ writes the layout beam positions (l1/l2) in test mode for regression testing
        xml.endElement()
    }

    static writeTrill(item: Trill, xml: XmlWriter, ctx: WriteContext): void {
        if (!ctx.canWrite(item)) {
            return
        }
        xml.startElement(item)
        xml.tag('subtype', TConv.toXmlTrillType(item.trillType()))
        TWrite.writeProperty(item, xml, Pid.ORNAMENT_STYLE)
        TWrite.writeProperty(item, xml, Pid.PLACEMENT)
        TWrite.writeSLineProperties(item, xml, ctx)
        if (item.ornament()) {
            TWrite.writeOrnament(item.ornament()!, xml, ctx)
        }
        xml.endElement()
    }

    static writeTuplet(item: Tuplet, xml: XmlWriter, ctx: WriteContext): void {
        xml.startElement(item)
        TWrite.writeItemProperties(item, xml, ctx)

        TWrite.writeProperty(item, xml, Pid.NORMAL_NOTES)
        TWrite.writeProperty(item, xml, Pid.ACTUAL_NOTES)
        TWrite.writeProperty(item, xml, Pid.P1)
        TWrite.writeProperty(item, xml, Pid.P2)

        xml.tag('baseNote', TConv.toXmlDurationType(item.baseLen().type()))
        const dots = item.baseLen().dots()
        if (dots) {
            xml.tag('baseDots', dots)
        }

        if (item.number()) {
            xml.startElementFor('Number', item.number()!)
            TWrite.writeProperty(item.number()!, xml, Pid.TEXT_STYLE)
            TWrite.writeProperty(item.number()!, xml, Pid.TEXT)
            xml.endElement()
        }

        TWrite.writeStyledProperties(item, xml)

        xml.endElement()
    }

    static writeVibrato(item: Vibrato, xml: XmlWriter, ctx: WriteContext): void {
        if (!ctx.canWrite(item)) {
            return
        }
        xml.startElement(item)
        xml.tag('subtype', TConv.toXmlVibratoType(item.vibratoType()))
        for (const spp of item.styledProperties()) {
            TWrite.writeProperty(item, xml, spp.pid)
        }
        TWrite.writeSLineProperties(item, xml, ctx)
        xml.endElement()
    }

    static writeVolta(item: Volta, xml: XmlWriter, ctx: WriteContext): void {
        xml.startElement(item)
        TWrite.writeTextLineBaseProperties(item, xml, ctx)
        xml.tag('endings', TConv.toXmlIntVec(item.endings()))
        xml.endElement()
    }

    // ---------------------------------------------------------
    //   writeSegments
    //    ls  - write upto this segment (excluding)
    //          can be zero
    // ---------------------------------------------------------

    static writeSegments(xml: XmlWriter, ctx: WriteContext, strack: track_idx_t, etrack: track_idx_t,
                         sseg: Segment, eseg: Segment | null, writeSystemElements: boolean, forceTimeSig: boolean): void {
        const score = sseg.score()
        const startTick = ctx.curTick()
        const endTick = eseg ? eseg.tick() : score.lastMeasure()!.endTick()
        const clip = ctx.clipboardmode()

        // in clipboard mode, ls might be in an mmrest
        // since we are traversing regular measures,
        // force them out of mmRest
        if (clip) {
            let lm = eseg ? eseg.measure() : null
            let fm = sseg ? sseg.measure() : null
            if (lm && lm.isMMRest()) {
                lm = lm.mmRestLast()
                if (lm) {
                    eseg = lm.nextMeasure() ? lm.nextMeasure()!.first() : null
                }
            }
            if (fm && fm.isMMRest()) {
                fm = fm.mmRestFirst()
                if (fm) {
                    sseg = fm.first(SegmentType.ChordRest)!
                }
            }
        }

        const spanners: Spanner[] = []
        for (const s of score.spannerMap().findOverlapping(sseg.tick().ticks(), endTick.ticks())) {
            if (s.generated() || !ctx.canWrite(s)) {
                continue
            }
            // don't write voltas to clipboard
            if (clip && s.isVolta() && s.systemFlag()) {
                continue
            }
            spanners.push(s)
        }

        const lastTrackWritten = { value: strack - 1 } // for counting necessary <voice> tags
        for (let track = strack; track < etrack; ++track) {
            if (!ctx.canWriteVoice(track)) {
                if (forceTimeSig && track2voice(track) === 0) {
                    const voiceTagWritten = writeVoiceMove(xml, ctx, sseg, startTick, track, lastTrackWritten)
                    writeTimeSigAt(score, startTick, xml, ctx)
                    if (voiceTagWritten) {
                        xml.endElement() // </voice>
                    }
                }

                continue
            }

            let voiceTagWritten = false
            let timeSigWritten = false // for forceTimeSig
            let crWritten = false // for forceTimeSig
            let keySigWritten = false // for forceTimeSig

            for (let segment: Segment | null = sseg; segment && segment !== eseg; segment = segment.next1()) {
                if (!segment.enabled()) {
                    continue
                }
                if (track === 0) {
                    segment.setWritten(false)
                }
                const e = segment.element(track)

                //
                // special case: - barline span > 1
                //               - part (excerpt) staff starts after
                //                 barline element
                let needMove = (segment.tick().ne(ctx.curTick()) || (track > lastTrackWritten.value))
                if ((segment.isEndBarLineType()) && !e && writeSystemElements && ((track % VOICES) === 0)) {
                    // search barline:
                    for (let idx = track - VOICES; idx >= 0; idx -= VOICES) {
                        if (segment.element(idx)) {
                            const oDiff = ctx.trackDiff()
                            ctx.setTrackDiff(idx) // staffIdx should be zero
                            TWrite.writeItem(segment.element(idx)!, xml, ctx)
                            ctx.setTrackDiff(oDiff)
                            break
                        }
                    }
                }
                for (const e1 of segment.annotations()) {
                    if (e1.generated()) {
                        continue
                    }
                    let writeSystem = writeSystemElements
                    if (!writeSystem) {
                        if (SYSTEM_ANNOTATION_TYPES.has(e1.type())) {
                            writeSystem = (e1.track() === track) // always show these on appropriate staves
                        }
                    }
                    if (e1.track() !== track || (e1.systemFlag() && !writeSystem)) {
                        continue
                    }
                    if (needMove) {
                        voiceTagWritten = writeVoiceMove(xml, ctx, segment, startTick, track, lastTrackWritten) || voiceTagWritten
                        needMove = false
                    }
                    TWrite.writeItem(e1, xml, ctx)
                }
                const m = segment.measure()
                // don't write spanners for multi measure rests

                if (!(m && m.isMMRest())) {
                    for (const s of spanners) {
                        if (!segment.canWriteSpannerStartEnd(track, s)) {
                            continue
                        }
                        if (s.track() === track) {
                            let end = false
                            if (s.anchor() === SpannerAnchor.CHORD || s.anchor() === SpannerAnchor.NOTE) {
                                end = s.tick2().lt(endTick)
                            } else {
                                end = s.tick2().le(endTick)
                            }
                            if (s.tick().eq(segment.tick()) && (!clip || end) && !s.isSlur()) {
                                if (needMove) {
                                    voiceTagWritten = writeVoiceMove(xml, ctx, segment, startTick, track, lastTrackWritten)
                                        || voiceTagWritten
                                    needMove = false
                                }
                                TWrite.writeSpannerStart(s, xml, ctx, segment, track)
                            }
                        }
                        if ((s.tick2().eq(segment.tick()))
                            && !s.isSlur()
                            && (s.effectiveTrack2() === track)
                            && (!clip || s.tick().ge(sseg.tick()))
                        ) {
                            if (needMove) {
                                voiceTagWritten = writeVoiceMove(xml, ctx, segment, startTick, track, lastTrackWritten)
                                    || voiceTagWritten
                                needMove = false
                            }
                            TWrite.writeSpannerEnd(s, xml, ctx, segment, track)
                        }
                    }
                }

                if (!e || !ctx.canWrite(e)) {
                    continue
                }
                if (e.generated()) {
                    continue
                }
                if (forceTimeSig && track2voice(track) === 0 && segment.isChordRestType() && !timeSigWritten
                    && !crWritten) {
                    // Ensure that <voice> tag is open
                    voiceTagWritten = writeVoiceMove(xml, ctx, segment, startTick, track, lastTrackWritten) || voiceTagWritten
                    // we will miss a key sig!
                    if (!keySigWritten) {
                        const staff = score.staff(track2staff(track))!
                        const ck = staff.concertKey(segment.tick())
                        const tk = staff.key(segment.tick())
                        const ks = Factory.createItem(ElementType.KEYSIG, scoreDummy(score).segment()) as KeySig
                        ks.setKey(ck, tk)
                        TWrite.writeKeySig(ks, xml, ctx)
                        score.masterScore().eidRegister().removeItem(ks)
                        keySigWritten = true
                    }
                    // we will miss a time sig!
                    writeTimeSigAt(score, segment.tick(), xml, ctx)
                    timeSigWritten = true
                }
                if (needMove) {
                    voiceTagWritten = writeVoiceMove(xml, ctx, segment, startTick, track, lastTrackWritten) || voiceTagWritten
                }
                if (e.isChordRest()) {
                    TWrite.writeTupletStart(e as ChordRest, xml, ctx)
                }
                TWrite.writeItem(e, xml, ctx)

                if (e.isChordRest()) {
                    TWrite.writeTupletEnd(e as ChordRest, xml, ctx)
                }

                if (!(e.isRest() && (e as Rest).isGap())) {
                    TWrite.writeSegment(segment, xml, ctx) // write only once
                }
                if (forceTimeSig) {
                    if (segment.isKeySigType()) {
                        keySigWritten = true
                    }
                    if (segment.isTimeSigType()) {
                        timeSigWritten = true
                    }
                    if (segment.isChordRestType()) {
                        crWritten = true
                    }
                }
            }

            // write spanners whose end tick lies outside the clip region
            if (clip) {
                for (const s of spanners) {
                    const spannerEndTick = s.tick2()
                    const spannerEndingAtEdgeOfClipZone = spannerEndTick.eq(endTick) && !s.isSlur()
                        && s.effectiveTrack2() === track && s.tick().ge(sseg.tick())
                    if (!spannerEndingAtEdgeOfClipZone) {
                        continue
                    }
                    const needMove = spannerEndTick.ne(ctx.curTick())
                    if (needMove) {
                        // If spanner started on a timeTick and there was no other segment in between there and here,
                        // ctx.curTick hasn't been moved forward, so we must move it forward here.
                        const curr = Location.absolute()
                        const dest = Location.absolute()
                        curr.setFrac(ctx.curTick())
                        dest.setFrac(spannerEndTick)
                        dest.toRelative(curr)
                        TWrite.writeLocation(dest, xml, ctx)
                        ctx.setCurTick(spannerEndTick)
                    }
                    TWrite.writeSpannerEnd(s, xml, ctx, score.lastMeasure()!, track, endTick)
                }
            }

            if (voiceTagWritten) {
                xml.endElement() // </voice>
            }
        }
    }
}

// TEMPO_PRECISION (dom/tempo.h)
const TEMPO_PRECISION = 6

function isEqualReal(a: number, b: number): boolean {
    return Math.abs(a - b) <= 1e-9 * Math.max(1, Math.abs(a), Math.abs(b))
}

function spannerFraction(clipboardmode: boolean, current: EngravingItem, t: Fraction): Fraction {
    let tick = t
    if (!clipboardmode) {
        const m = current.findMeasure() as Measure | MeasureBase | null
        if (m) {
            tick = tick.minus(m.tick())
        }
    }
    return tick
}

function midiEventWrite(e: MidiCoreEvent, xml: XmlWriter): void {
    switch (e.type()) {
    case ME_NOTEON:
        xml.tag('note-on', [['channel', e.channel()], ['pitch', e.pitch()], ['velo', e.velo()]])
        break

    case ME_NOTEOFF:
        xml.tag('note-off', [['channel', e.channel()], ['pitch', e.pitch()], ['velo', e.velo()]])
        break

    case ME_CONTROLLER:
        if (e.controller() === CTRL_PROGRAM) {
            if (e.channel() === 0) {
                xml.tag('program', [['value', e.value()]])
            } else {
                xml.tag('program', [['channel', e.channel()], ['value', e.value()]])
            }
        } else {
            if (e.channel() === 0) {
                xml.tag('controller', [['ctrl', e.controller()], ['value', e.value()]])
            } else {
                xml.tag('controller', [['channel', e.channel()], ['ctrl', e.controller()], ['value', e.value()]])
            }
        }
        break
    default:
        // C++ logs "MidiCoreEvent::write: unknown type"
        break
    }
}

// ---------------------------------------------------------
//   writeVoiceMove
//    write <move> and starting <voice> tags to denote
//    change in position.
//    Returns true if <voice> tag was written.
// ---------------------------------------------------------

function writeVoiceMove(xml: XmlWriter, ctx: WriteContext, seg: Segment, startTick: Fraction, track: track_idx_t,
                        lastTrackWritten: { value: number }): boolean {
    let voiceTagWritten = false
    if ((lastTrackWritten.value < track) && !ctx.clipboardmode()) {
        while (lastTrackWritten.value < (track - 1)) {
            xml.tag('voice')
            ++lastTrackWritten.value
        }
        xml.startElement('voice')
        ctx.setCurTick(startTick)
        ctx.setCurTrack(track)
        ++lastTrackWritten.value
        voiceTagWritten = true
    }

    if ((ctx.curTick().ne(seg.tick())) || (track !== ctx.curTrack())) {
        const curr = Location.absolute()
        const dest = Location.absolute()
        curr.setFrac(ctx.curTick())
        dest.setFrac(seg.tick())
        curr.setTrack(ctx.curTrack())
        dest.setTrack(track)

        dest.toRelative(curr)
        dest.setIsTimeTick(seg.isTimeTickType())
        TWrite.writeLocation(dest, xml, ctx)

        ctx.setCurTick(seg.tick())
        ctx.setCurTrack(track)
    }

    return voiceTagWritten
}

function writeTimeSigAt(score: Score, tick: Fraction, xml: XmlWriter, ctx: WriteContext): void {
    const tsf = score.sigmap().timesig(tick).nominal()
    const ts = Factory.createItem(ElementType.TIMESIG, scoreDummy(score).segment()) as TimeSig
    ts.setSig(tsf)
    TWrite.writeTimeSig(ts, xml, ctx)
    ts.masterScore().eidRegister().removeItem(ts)
}
