/*
 * SPDX-License-Identifier: GPL-3.0-only
 * MuseScore-Web — port of src/engraving/dom/factory.h/.cpp
 * Copyright (C) 2021-2026 MuseScore Limited and others
 *
 * Only the element types that are ported so far can be created; createItem() returns null for others.
 * C++ uses score()->dummy() sub-elements as temporary parents; here the score itself is used.
 */

import { ElementType } from '../types/types'
import { TConv } from '../types/typesconv'
import { itemFactories, type EngravingItem } from './engravingitem'
import type { EngravingObject } from './engravingobject'
import { Accidental } from './accidental'
import { ActionIcon } from './actionicon'
import { BagpipeEmbellishment } from './bagpembell'
import { PlayTechAnnotation } from './playtechannotation'
import { Arpeggio } from './arpeggio'
import { Articulation } from './articulation'
import { BarLine } from './barline'
import { Beam } from './beam'
import { HBox, TBox, VBox, FBox } from './box'
import { Fraction } from '../types/fraction'
import { Bracket } from './bracket'
import { BracketItem } from './bracketitem'
import { Chord } from './chord'
import { Clef } from './clef'
import { Hook } from './hook'
import { InstrumentName } from './instrumentname'
import { KeySig } from './keysig'
import { LayoutBreak } from './layoutbreak'
import { LedgerLine } from './ledgerline'
import { Lyrics } from './lyrics'
import { Measure } from './measure'
import { MeasureNumber } from './measurenumber'
import { Note } from './note'
import { NoteDot } from './notedot'
import { Rest } from './rest'
import type { Segment } from './segment'
import type { ChordRest } from './chordrest'
import type { MeasureBase } from './measurebase'
import { scoreDummy, type DummyElement } from '../compat/dummyelement'
import { Slur, SlurSegment } from './slur'
import { Spacer } from './spacer'
import { StaffLines } from './stafflines'
import { Staff } from './staff'
import type { Part } from './part'
import { Stem } from './stem'
import { StemSlash } from './stemslash'
import { Symbol } from './symbol'
import { NoteHead } from './notehead'
import { Text } from './text'
import { System } from './system'
import { Tie, TieSegment } from './tie'
import { TimeSig } from './timesig'
import { Tuplet } from './tuplet'
import { StaffText, SystemText } from './stafftextbase'
import { TempoText } from './tempotext'
import { RehearsalMark } from './rehearsalmark'
import { Expression } from './expression'
import { Dynamic } from './dynamic'
import { Fermata } from './fermata'
import { Breath } from './breath'
import { MMRest } from './mmrest'
import { Hairpin, HairpinSegment } from './hairpin'
import { TextLine, TextLineSegment } from './textline'
import { Volta, VoltaSegment } from './volta'
import { Ottava, OttavaSegment } from './ottava'
import { Pedal, PedalSegment } from './pedal'
import { LyricsLine } from './lyricsline'
import { LetRing, LetRingSegment } from './letring'
import { PalmMute, PalmMuteSegment } from './palmmute'
import { Marker } from './marker'
import { Jump } from './jump'
import { Parenthesis } from './parenthesis'
import { Harmony } from './harmony'
import { FretDiagram } from './fret'
import { Ornament, ornamentFactories } from './ornament'
import { Trill, TrillSegment } from './trill'
import { TremoloSingleChord } from './tremolosinglechord'
import { TremoloTwoChord } from './tremolotwochord'
import { StaffTypeChange } from './stafftypechange'
import { LaissezVib, LaissezVibSegment } from './laissezvib'
import { PartialTie, PartialTieSegment } from './partialtie'
import { MeasureRepeat } from './measurerepeat'
import { GuitarBend } from './guitarbend'
import { WhammyBar, WhammyBarSegment } from './whammybar'
import { Vibrato, VibratoSegment } from './vibrato'
import { Glissando, GlissandoSegment } from './glissando'
import { GradualTempoChange, GradualTempoChangeSegment } from './gradualtempochange'
import { HammerOnPullOff, HammerOnPullOffSegment } from './hammeronpulloff'
import { Fingering } from './fingering'
import { ChordLine } from './chordline'
import { Ambitus } from './ambitus'
import { InstrumentChange } from './instrchange'

type Parent = EngravingObject | null

const asItem = (p: Parent): EngravingItem | null => (p && p.isEngravingItem() ? p as EngravingItem : null)
const ofType = <T>(p: Parent, t: ElementType): T | null => (p && p.type() === t ? p as unknown as T : null)

export class Factory {
    static createItem(type: ElementType, parent: Parent): EngravingItem | null {
        const dummy = (): DummyElement => scoreDummy(parent!.score())
        const segmentOrDummy = (): Segment => ofType<Segment>(parent, ElementType.SEGMENT) ?? dummy().segment()
        const chordOrDummy = (): Chord => ofType<Chord>(parent, ElementType.CHORD) ?? dummy().chord()
        const measureOrDummy = (): Measure => ofType<Measure>(parent, ElementType.MEASURE) ?? dummy().measure()
        const itemOrDummy = (): EngravingItem => asItem(parent) ?? dummy()
        switch (type) {
        case ElementType.CLEF: return new Clef(segmentOrDummy())
        case ElementType.KEYSIG: return new KeySig(segmentOrDummy())
        case ElementType.TIMESIG: return new TimeSig(segmentOrDummy())
        case ElementType.BAR_LINE: return new BarLine(segmentOrDummy())
        case ElementType.ARPEGGIO: return new Arpeggio(chordOrDummy())
        case ElementType.CHORDLINE: return new ChordLine(chordOrDummy())
        case ElementType.AMBITUS: return new Ambitus(segmentOrDummy())
        case ElementType.INSTRUMENT_CHANGE: return new InstrumentChange(segmentOrDummy())
        case ElementType.FINGERING: return new Fingering(parent && parent.isNote() ? parent as unknown as Note : dummy().note())
        case ElementType.STAFFTYPE_CHANGE: return new StaffTypeChange(parent as MeasureBase)
        case ElementType.LAISSEZ_VIB: return new LaissezVib(parent as Note)
        case ElementType.MEASURE_REPEAT: return new MeasureRepeat(parent)
        case ElementType.PARTIAL_TIE: return new PartialTie(parent as Note)
        case ElementType.GUITAR_BEND: return new GuitarBend(parent && parent.isNote() ? parent : dummy().note())
        case ElementType.PARTIAL_TIE_SEGMENT: return new PartialTieSegment(null)
        case ElementType.LAISSEZ_VIB_SEGMENT: return new LaissezVibSegment(null)
        case ElementType.TREMOLO_SINGLECHORD: return new TremoloSingleChord(chordOrDummy())
        case ElementType.TREMOLO_TWOCHORD: return new TremoloTwoChord(chordOrDummy())
        case ElementType.BRACKET: return new Bracket(itemOrDummy())
        case ElementType.ARTICULATION: return new Articulation(parent && parent.isChordRest() ? parent : dummy().chord())
        case ElementType.ACCIDENTAL: return new Accidental(itemOrDummy())
        case ElementType.TEXT: return new Text(itemOrDummy())
        case ElementType.MEASURE_NUMBER: return new MeasureNumber(measureOrDummy())
        case ElementType.INSTRUMENT_NAME: return new InstrumentName(dummy().system())
        case ElementType.SLUR_SEGMENT: return new SlurSegment(dummy().system())
        case ElementType.TIE_SEGMENT: return new TieSegment(dummy().system())
        case ElementType.STEM_SLASH: return new StemSlash(chordOrDummy())
        case ElementType.LEDGER_LINE: return new LedgerLine(itemOrDummy())
        case ElementType.STAFF_LINES: return new StaffLines(itemOrDummy())
        case ElementType.SYMBOL: return new Symbol(itemOrDummy())
        case ElementType.NOTEHEAD: return new NoteHead(itemOrDummy())
        case ElementType.MEASURE: return new Measure(dummy().system())
        case ElementType.TUPLET: return new Tuplet(measureOrDummy())
        case ElementType.SLUR: return new Slur(itemOrDummy())
        case ElementType.HAMMER_ON_PULL_OFF: return new HammerOnPullOff(itemOrDummy())
        case ElementType.HAMMER_ON_PULL_OFF_SEGMENT: return new HammerOnPullOffSegment(dummy().system())
        case ElementType.TIE: return new Tie(itemOrDummy())
        case ElementType.SPACER: return new Spacer(measureOrDummy())
        case ElementType.PARENTHESIS: return new Parenthesis(itemOrDummy())
        case ElementType.ORNAMENT: return new Ornament(chordOrDummy())
        case ElementType.TRILL: return new Trill(itemOrDummy())
        case ElementType.TRILL_SEGMENT: return new TrillSegment(null, dummy().system())
        case ElementType.HARMONY: return new Harmony(segmentOrDummy())
        case ElementType.FRET_DIAGRAM: return new FretDiagram(segmentOrDummy())
        case ElementType.MARKER: return new Marker(measureOrDummy())
        case ElementType.JUMP: return new Jump(measureOrDummy())
        case ElementType.LAYOUT_BREAK: return new LayoutBreak(parent && parent.isMeasureBase() ? parent as MeasureBase : dummy().measure())
        case ElementType.LYRICS: return new Lyrics(parent && parent.isChordRest() ? parent as unknown as ChordRest : dummy().chord())
        case ElementType.HBOX: return new HBox(dummy().system())
        case ElementType.VBOX: return new VBox(dummy().system())
        case ElementType.TBOX: return new TBox(dummy().system())
        case ElementType.FBOX: return new FBox(dummy().system())
        case ElementType.NOTE: return new Note(chordOrDummy())
        case ElementType.NOTEDOT: return new NoteDot(parent && (parent.isNote() || parent.isRest()) ? parent as unknown as Note : dummy().note())
        case ElementType.CHORD: return new Chord(segmentOrDummy())
        case ElementType.REST: return new Rest(segmentOrDummy())
        case ElementType.MMREST: return new MMRest(segmentOrDummy())
        case ElementType.HAIRPIN: return new Hairpin(itemOrDummy())
        case ElementType.HAIRPIN_SEGMENT: return new HairpinSegment(null, dummy().system())
        case ElementType.TEXTLINE: return new TextLine(itemOrDummy())
        case ElementType.TEXTLINE_SEGMENT: return new TextLineSegment(null, dummy().system())
        case ElementType.VOLTA: return new Volta(itemOrDummy())
        case ElementType.VOLTA_SEGMENT: return new VoltaSegment(null, dummy().system())
        case ElementType.OTTAVA: return new Ottava(itemOrDummy())
        case ElementType.OTTAVA_SEGMENT: return new OttavaSegment(null, dummy().system())
        case ElementType.LET_RING: return new LetRing(itemOrDummy())
        case ElementType.LET_RING_SEGMENT: return new LetRingSegment(null, dummy().system())
        case ElementType.WHAMMY_BAR: return new WhammyBar(itemOrDummy())
        case ElementType.VIBRATO: return new Vibrato(itemOrDummy())
        case ElementType.GLISSANDO: return new Glissando(itemOrDummy())
        case ElementType.GRADUAL_TEMPO_CHANGE: return new GradualTempoChange(itemOrDummy())
        case ElementType.GRADUAL_TEMPO_CHANGE_SEGMENT: return new GradualTempoChangeSegment(null, dummy().system())
        case ElementType.GLISSANDO_SEGMENT: return new GlissandoSegment(null, dummy().system())
        case ElementType.VIBRATO_SEGMENT: return new VibratoSegment(null, dummy().system())
        case ElementType.WHAMMY_BAR_SEGMENT: return new WhammyBarSegment(null, dummy().system())
        case ElementType.PALM_MUTE: return new PalmMute(itemOrDummy())
        case ElementType.PALM_MUTE_SEGMENT: return new PalmMuteSegment(null, dummy().system())
        case ElementType.PEDAL: return new Pedal(itemOrDummy())
        case ElementType.PEDAL_SEGMENT: return new PedalSegment(null, dummy().system())
        case ElementType.LYRICSLINE: return new LyricsLine(itemOrDummy())
        case ElementType.BEAM: return new Beam(dummy().system())
        case ElementType.HOOK: return new Hook(chordOrDummy())
        case ElementType.STEM: return new Stem(chordOrDummy())
        case ElementType.BRACKET_ITEM: return new BracketItem(itemOrDummy())
        case ElementType.STAFF_TEXT: return new StaffText(segmentOrDummy())
        case ElementType.SYSTEM_TEXT: return new SystemText(segmentOrDummy())
        case ElementType.TEMPO_TEXT: return new TempoText(segmentOrDummy())
        case ElementType.REHEARSAL_MARK: return new RehearsalMark(segmentOrDummy())
        case ElementType.EXPRESSION: return new Expression(segmentOrDummy())
        case ElementType.DYNAMIC: return new Dynamic(segmentOrDummy())
        case ElementType.FERMATA: return new Fermata(itemOrDummy())
        case ElementType.BREATH: return new Breath(segmentOrDummy())
        case ElementType.ACTION_ICON: return new ActionIcon(itemOrDummy())
        case ElementType.BAGPIPE_EMBELLISHMENT: return new BagpipeEmbellishment(itemOrDummy())
        case ElementType.PLAYTECH_ANNOTATION: return new PlayTechAnnotation(segmentOrDummy())
        default:
            // TODO(port): element type not ported yet
            return null
        }
    }

    static createSystem(parent: EngravingItem): System {
        const s = new System(parent)
        s.setScore(parent.score())
        return s
    }

    static createBracket(parent: EngravingItem): Bracket {
        const b = new Bracket(parent)
        b.setScore(parent.score())
        return b
    }

    static createBeam(parent: EngravingItem): Beam {
        const b = new Beam(parent)
        b.setScore(parent.score())
        return b
    }

    static createStemSlash(parent: Chord): StemSlash {
        const s = new StemSlash(parent)
        s.setScore(parent.score())
        return s
    }

    static createTitleVBox(parent: System): VBox {
        const b = new VBox(parent)
        b.setSizeIsSpatiumDependent(false)
        b.setTick(new Fraction(0, 1))
        return b
    }

    static createStaff(part: Part): Staff {
        const s = new Staff(part)
        s.setScore(part.score())
        return s
    }

    static createItemByName(name: string, parent: Parent): EngravingItem | null {
        const type = TConv.fromXmlElementType(name, ElementType.INVALID)
        if (type === ElementType.INVALID) {
            return null
        }
        return Factory.createItem(type, parent)
    }
}

ornamentFactories.createChord = (parent: Segment): Chord => new Chord(parent)
itemFactories.createItem = (type: ElementType, parent: Parent): EngravingItem | null => Factory.createItem(type, parent)
