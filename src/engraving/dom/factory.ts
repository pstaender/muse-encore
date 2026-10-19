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
import type { EngravingItem } from './engravingitem'
import type { EngravingObject } from './engravingobject'
import { Accidental } from './accidental'
import { Arpeggio } from './arpeggio'
import { Articulation } from './articulation'
import { BarLine } from './barline'
import { Beam } from './beam'
import { HBox, TBox, VBox } from './box'
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
import { Text } from './text'
import { Tie, TieSegment } from './tie'
import { TimeSig } from './timesig'
import { Tuplet } from './tuplet'

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
        case ElementType.MEASURE: return new Measure(dummy().system())
        case ElementType.TUPLET: return new Tuplet(measureOrDummy())
        case ElementType.SLUR: return new Slur(itemOrDummy())
        case ElementType.TIE: return new Tie(itemOrDummy())
        case ElementType.SPACER: return new Spacer(measureOrDummy())
        case ElementType.LAYOUT_BREAK: return new LayoutBreak(parent && parent.isMeasureBase() ? parent as MeasureBase : dummy().measure())
        case ElementType.LYRICS: return new Lyrics(parent && parent.isChordRest() ? parent as unknown as ChordRest : dummy().chord())
        case ElementType.HBOX: return new HBox(dummy().system())
        case ElementType.VBOX: return new VBox(dummy().system())
        case ElementType.TBOX: return new TBox(dummy().system())
        case ElementType.NOTE: return new Note(chordOrDummy())
        case ElementType.NOTEDOT: return new NoteDot(parent && (parent.isNote() || parent.isRest()) ? parent as unknown as Note : dummy().note())
        case ElementType.CHORD: return new Chord(segmentOrDummy())
        case ElementType.REST: return new Rest(segmentOrDummy())
        case ElementType.BEAM: return new Beam(dummy().system())
        case ElementType.HOOK: return new Hook(chordOrDummy())
        case ElementType.STEM: return new Stem(chordOrDummy())
        case ElementType.BRACKET_ITEM: return new BracketItem(itemOrDummy())
        default:
            // TODO(port): element type not ported yet
            return null
        }
    }

    static createStemSlash(parent: Chord): StemSlash {
        const s = new StemSlash(parent)
        s.setScore(parent.score())
        return s
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
