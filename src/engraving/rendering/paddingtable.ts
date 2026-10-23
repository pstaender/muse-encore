/*
 * SPDX-License-Identifier: GPL-3.0-only
 * MuseEncore — port of MuseScore Studio (https://github.com/musescore/MuseScore)
 * Copyright (C) 2021-2026 MuseScore Limited and others
 *
 * Port of src/engraving/rendering/paddingtable.h/.cpp
 */

import { ElementType } from '../types/types'
import { Sid } from '../style/styledef'
import type { MStyle } from '../style/style'
import type { Score } from '../dom/score'
import type { EngravingItem } from '../dom/engravingitem'

export const TOT_ELEMENT_TYPES = ElementType.MAXTYPE

/** padding between two element types: table.at(type1, type2) */
export class PaddingTable {
    private m_table = new Float64Array(TOT_ELEMENT_TYPES * TOT_ELEMENT_TYPES)

    at(t1: ElementType, t2: ElementType): number { return this.m_table[t1 * TOT_ELEMENT_TYPES + t2] }
    set(t1: ElementType, t2: ElementType, v: number): void { this.m_table[t1 * TOT_ELEMENT_TYPES + t2] = v }

    /** table[t].fill(v) */
    fillRow(t: ElementType, v: number): void {
        for (let j = 0; j < TOT_ELEMENT_TYPES; ++j) {
            this.set(t, j, v)
        }
    }

    /** for (auto& elem : table) elem[t] = v */
    fillColumn(t: ElementType, v: number | ((row: ElementType) => number)): void {
        for (let i = 0; i < TOT_ELEMENT_TYPES; ++i) {
            this.set(i, t, typeof v === 'number' ? v : v(i))
        }
    }

    /** table[dst] = table[src] */
    copyRow(dst: ElementType, src: ElementType): void {
        for (let j = 0; j < TOT_ELEMENT_TYPES; ++j) {
            this.set(dst, j, this.at(src, j))
        }
    }

    private initPaddingTable(minPadUnit: number): void {
        this.m_table.fill(minPadUnit)
    }

    createTable(style: MStyle): void {
        const T = ElementType
        const spatium = style.spatium()
        const minPadUnit = 0.1 * spatium
        this.initPaddingTable(minPadUnit)
        const ledgerPad = 0.25 * spatium
        const ledgerLength = style.styleMM(Sid.ledgerLineLength)
        const s = (a: ElementType, b: ElementType, v: number): void => this.set(a, b, v)
        const g = (a: ElementType, b: ElementType): number => this.at(a, b)

        s(T.NOTE, T.NOTE, minPadUnit)
        s(T.NOTE, T.LEDGER_LINE, 0.35 * spatium)
        s(T.NOTE, T.ACCIDENTAL, Math.max(style.styleMM(Sid.accidentalNoteDistance), 0.35 * spatium))
        s(T.NOTE, T.REST, 0.5 * spatium)
        s(T.NOTE, T.CLEF, 0.8 * spatium)
        s(T.NOTE, T.ARPEGGIO, 0.6 * spatium)
        s(T.NOTE, T.BAR_LINE, style.styleMM(Sid.noteBarDistance))
        s(T.NOTE, T.KEYSIG, 0.75 * spatium)
        s(T.NOTE, T.TIMESIG, 0.75 * spatium)

        s(T.LEDGER_LINE, T.NOTE, g(T.NOTE, T.LEDGER_LINE))
        s(T.LEDGER_LINE, T.LEDGER_LINE, ledgerPad)
        s(T.LEDGER_LINE, T.ACCIDENTAL, Math.max(style.styleMM(Sid.accidentalNoteDistance),
            g(T.NOTE, T.ACCIDENTAL) - ledgerLength / 2))
        s(T.LEDGER_LINE, T.REST, g(T.LEDGER_LINE, T.NOTE))
        s(T.LEDGER_LINE, T.CLEF, Math.max(g(T.NOTE, T.CLEF) - ledgerLength / 2, ledgerPad))
        s(T.LEDGER_LINE, T.ARPEGGIO, 0.5 * spatium)
        s(T.LEDGER_LINE, T.BAR_LINE, Math.max(g(T.NOTE, T.BAR_LINE) - ledgerLength, ledgerPad))
        s(T.LEDGER_LINE, T.KEYSIG, Math.max(g(T.NOTE, T.KEYSIG) - ledgerLength / 2, ledgerPad))
        s(T.LEDGER_LINE, T.TIMESIG, Math.max(g(T.NOTE, T.TIMESIG) - ledgerLength / 2, ledgerPad))

        s(T.HOOK, T.NOTE, 0.35 * spatium)
        s(T.HOOK, T.LEDGER_LINE, Math.max(g(T.HOOK, T.NOTE) - ledgerLength, ledgerPad))
        s(T.HOOK, T.ACCIDENTAL, 0.35 * spatium)
        s(T.HOOK, T.REST, g(T.HOOK, T.NOTE))
        s(T.HOOK, T.CLEF, 0.5 * spatium)
        s(T.HOOK, T.ARPEGGIO, 0.35 * spatium)
        s(T.HOOK, T.BAR_LINE, 1 * spatium)
        s(T.HOOK, T.KEYSIG, 1.15 * spatium)
        s(T.HOOK, T.TIMESIG, 1.15 * spatium)

        s(T.NOTEDOT, T.NOTE, Math.max(style.styleMM(Sid.dotNoteDistance), style.styleMM(Sid.dotDotDistance)))
        s(T.NOTEDOT, T.LEDGER_LINE, Math.max(g(T.NOTEDOT, T.NOTE) - ledgerLength, ledgerPad))
        s(T.NOTEDOT, T.ACCIDENTAL, 0.35 * spatium)
        s(T.NOTEDOT, T.REST, g(T.NOTEDOT, T.NOTE))
        s(T.NOTEDOT, T.CLEF, 1.0 * spatium)
        s(T.NOTEDOT, T.ARPEGGIO, 0.5 * spatium)
        s(T.NOTEDOT, T.BAR_LINE, 0.8 * spatium)
        s(T.NOTEDOT, T.KEYSIG, 1.35 * spatium)
        s(T.NOTEDOT, T.TIMESIG, 1.35 * spatium)

        s(T.REST, T.NOTE, g(T.NOTE, T.REST))
        s(T.REST, T.LEDGER_LINE, Math.max(g(T.REST, T.NOTE) - ledgerLength / 2, ledgerPad))
        s(T.REST, T.ACCIDENTAL, 0.45 * spatium)
        s(T.REST, T.REST, g(T.REST, T.NOTE))
        s(T.REST, T.CLEF, g(T.NOTE, T.CLEF))
        s(T.REST, T.BAR_LINE, 1.65 * spatium)
        s(T.REST, T.KEYSIG, 1.5 * spatium)
        s(T.REST, T.TIMESIG, 1.5 * spatium)

        s(T.CLEF, T.NOTE, style.styleMM(Sid.clefKeyRightMargin))
        s(T.CLEF, T.LEDGER_LINE, Math.max(g(T.CLEF, T.NOTE) - ledgerLength / 2, ledgerPad))
        s(T.CLEF, T.ACCIDENTAL, 0.6 * spatium)
        s(T.CLEF, T.REST, g(T.CLEF, T.NOTE))
        s(T.CLEF, T.CLEF, 0.75 * spatium)
        s(T.CLEF, T.ARPEGGIO, 0.65 * spatium)
        s(T.CLEF, T.BAR_LINE, style.styleMM(Sid.clefBarlineDistance))
        s(T.CLEF, T.KEYSIG, style.styleMM(Sid.clefKeyDistance))
        s(T.CLEF, T.TIMESIG, style.styleMM(Sid.clefTimesigDistance))

        s(T.BAR_LINE, T.NOTE, style.styleMM(Sid.barNoteDistance))
        s(T.BAR_LINE, T.LEDGER_LINE, Math.max(g(T.BAR_LINE, T.NOTE) - ledgerLength, ledgerPad))
        s(T.BAR_LINE, T.ACCIDENTAL, style.styleMM(Sid.barAccidentalDistance))
        s(T.BAR_LINE, T.REST, style.styleMM(Sid.barNoteDistance))
        s(T.BAR_LINE, T.CLEF, style.styleMM(Sid.clefLeftMargin))
        s(T.BAR_LINE, T.ARPEGGIO, 0.65 * spatium)
        s(T.BAR_LINE, T.BAR_LINE, 1.35 * spatium)
        s(T.BAR_LINE, T.KEYSIG, style.styleMM(Sid.keysigLeftMargin))
        s(T.BAR_LINE, T.TIMESIG, style.styleMM(Sid.timesigLeftMargin))

        s(T.KEYSIG, T.NOTE, 1.75 * spatium)
        s(T.KEYSIG, T.LEDGER_LINE, Math.max(g(T.KEYSIG, T.NOTE) - ledgerLength, ledgerPad))
        s(T.KEYSIG, T.ACCIDENTAL, 1.6 * spatium)
        s(T.KEYSIG, T.REST, g(T.KEYSIG, T.NOTE))
        s(T.KEYSIG, T.CLEF, 1.0 * spatium)
        s(T.KEYSIG, T.ARPEGGIO, 1.35 * spatium)
        s(T.KEYSIG, T.BAR_LINE, style.styleMM(Sid.keyBarlineDistance))
        s(T.KEYSIG, T.KEYSIG, 1 * spatium)
        s(T.KEYSIG, T.TIMESIG, style.styleMM(Sid.keyTimesigDistance))

        s(T.TIMESIG, T.NOTE, 1.35 * spatium)
        s(T.TIMESIG, T.LEDGER_LINE, Math.max(g(T.TIMESIG, T.NOTE) - ledgerLength, ledgerPad))
        s(T.TIMESIG, T.ACCIDENTAL, 0.8 * spatium)
        s(T.TIMESIG, T.REST, g(T.TIMESIG, T.NOTE))
        s(T.TIMESIG, T.CLEF, 1.0 * spatium)
        s(T.TIMESIG, T.ARPEGGIO, 1.35 * spatium)
        s(T.TIMESIG, T.BAR_LINE, style.styleMM(Sid.timesigBarlineDistance))
        s(T.TIMESIG, T.KEYSIG, style.styleMM(Sid.keyTimesigDistance))
        s(T.TIMESIG, T.TIMESIG, 1.0 * spatium)

        // Ambitus
        this.fillRow(T.AMBITUS, style.styleMM(Sid.ambitusMargin))
        this.fillColumn(T.AMBITUS, style.styleMM(Sid.ambitusMargin))

        // Arpeggio
        s(T.ARPEGGIO, T.NOTE, style.styleMM(Sid.arpeggioNoteDistance))
        s(T.ARPEGGIO, T.LEDGER_LINE, 0.3 * spatium)
        s(T.ARPEGGIO, T.ACCIDENTAL, style.styleMM(Sid.arpeggioAccidentalDistance))

        // Chord bracket
        const chordBracketDist = style.styleMM(Sid.chordBracketNoteDistance)
        this.fillRow(T.CHORD_BRACKET, chordBracketDist)
        this.fillColumn(T.CHORD_BRACKET, (row) => g(row, T.ARPEGGIO))

        // Breath
        this.fillRow(T.BREATH, 1.0 * spatium)
        this.fillColumn(T.BREATH, 1.0 * spatium)

        // Harmony
        s(T.BAR_LINE, T.HARMONY, 0.5 * style.styleMM(Sid.harmonyHarmonyDistance))
        s(T.HARMONY, T.HARMONY, style.styleMM(Sid.harmonyHarmonyDistance))

        // Chordlines
        s(T.HARMONY, T.FRET_DIAGRAM, 0.3 * spatium)
        s(T.FRET_DIAGRAM, T.HARMONY, 0.3 * spatium)
        s(T.FRET_DIAGRAM, T.FRET_DIAGRAM, 0.25 * spatium)

        this.fillRow(T.CHORDLINE, 0.35 * spatium)
        this.fillColumn(T.CHORDLINE, 0.35 * spatium)
        s(T.BAR_LINE, T.CHORDLINE, 0.65 * spatium)
        s(T.CHORDLINE, T.BAR_LINE, 0.65 * spatium)

        // For the x -> fingering padding use the same values as x -> accidental
        this.fillColumn(T.FINGERING, (row) => g(row, T.ACCIDENTAL))

        // This is needed for beamlets, not beams themselves
        this.fillRow(T.BEAM, 0.35 * spatium)
        this.copyRow(T.TREMOLO_SINGLECHORD, T.BEAM)

        // Lyrics
        const lyricsSpacing = style.styleMM(Sid.lyricsMinDistance)
        this.fillRow(T.LYRICS, lyricsSpacing)
        this.fillColumn(T.LYRICS, lyricsSpacing)
        // Allows lyrics to be closer to notes when the note has a melisma
        s(T.NOTE, T.LYRICS, style.styleMM(Sid.lyricsMelismaPad))

        // Accidental -> padding (used by accidental placement algorithm)
        s(T.ACCIDENTAL, T.NOTE, style.styleMM(Sid.accidentalNoteDistance))
        s(T.ACCIDENTAL, T.LEDGER_LINE, 0.18 * spatium)

        s(T.ARTICULATION, T.NOTE, 0.25 * spatium)
        s(T.ARTICULATION, T.REST, 0.25 * spatium)
        s(T.ARTICULATION, T.ACCIDENTAL, 0.25 * spatium)

        s(T.LAISSEZ_VIB_SEGMENT, T.NOTE, 0.5 * spatium)
        s(T.LAISSEZ_VIB_SEGMENT, T.REST, 0.5 * spatium)
        s(T.LAISSEZ_VIB_SEGMENT, T.ACCIDENTAL, 0.35 * spatium)
        s(T.LAISSEZ_VIB_SEGMENT, T.BAR_LINE, 0.35 * spatium)

        // Measure repeat
        this.copyRow(T.MEASURE_REPEAT, T.NOTE)
        this.fillColumn(T.MEASURE_REPEAT, (row) => g(row, T.NOTE))

        // Stems
        this.copyRow(T.STEM, T.NOTE)
        this.fillColumn(T.STEM, (row) => g(row, T.NOTE))
        s(T.NOTE, T.STEM, style.styleMM(Sid.minNoteDistance))
        s(T.REST, T.STEM, g(T.NOTE, T.STEM))
        s(T.CLEF, T.STEM, 0.75 * spatium)
        s(T.ACCIDENTAL, T.STEM, g(T.ACCIDENTAL, T.NOTE))
        s(T.LAISSEZ_VIB_SEGMENT, T.STEM, 0.35 * spatium)
        s(T.STEM, T.NOTE, style.styleMM(Sid.minNoteDistance))
        s(T.STEM, T.STEM, 0.85 * spatium)
        s(T.STEM, T.ACCIDENTAL, 0.35 * spatium)
        s(T.STEM, T.LEDGER_LINE, 0.35 * spatium)
        s(T.LEDGER_LINE, T.STEM, 0.35 * spatium)

        // Ottava
        const articulationAndFermataPadding = 0.35 * spatium
        this.fillRow(T.ARTICULATION, articulationAndFermataPadding)
        this.fillColumn(T.ARTICULATION, articulationAndFermataPadding)
        this.fillRow(T.FERMATA, articulationAndFermataPadding)
        this.fillColumn(T.FERMATA, articulationAndFermataPadding)
        this.copyRow(T.TAPPING, T.ARTICULATION)
        this.fillColumn(T.TAPPING, (row) => g(row, T.ARTICULATION))
        this.copyRow(T.TAPPING_HALF_SLUR_SEGMENT, T.ARTICULATION)
        this.fillColumn(T.TAPPING_HALF_SLUR_SEGMENT, (row) => g(row, T.ARTICULATION))
    }
}

const s_tables = new WeakMap<Score, { spatium: number, table: PaddingTable }>()

/**
 * Score::paddingTable(): C++ recreates the table on style changes (Score::createPaddingTable());
 * here it is cached per score and rebuilt when the spatium changes.
 */
export function paddingTable(score: Score): PaddingTable {
    const sp = score.style().spatium()
    let e = s_tables.get(score)
    if (!e || e.spatium !== sp) {
        const table = new PaddingTable()
        table.createTable(score.style())
        e = { spatium: sp, table }
        s_tables.set(score, e)
    }
    return e.table
}

export function resetPaddingTable(score: Score): void { s_tables.delete(score) }

/** padding between a parenthesis and the items before / after it */
export abstract class ParenPaddingTable {
    protected m_parenBefore = new Float64Array(TOT_ELEMENT_TYPES)
    protected m_parenAfter = new Float64Array(TOT_ELEMENT_TYPES)

    abstract createTable(style: MStyle): void

    padding(type1: ElementType, type2: ElementType): number {
        const row = type1 === ElementType.PARENTHESIS ? this.m_parenAfter : this.m_parenBefore
        const otherType = type1 === ElementType.PARENTHESIS ? type2 : type1
        return row[otherType]
    }

    static getPaddingTable(parent: EngravingItem): ParenPaddingTable {
        let table: ParenPaddingTable
        switch (parent.type()) {
        case ElementType.NOTE:
        case ElementType.CHORD:
            table = new NoteParenPaddingTable()
            break
        case ElementType.KEYSIG:
            table = new KeySigParenPaddingTable()
            break
        case ElementType.TIMESIG:
            table = new TimeSigParenPaddingTable()
            break
        case ElementType.CLEF:
            table = new ClefParenPaddingTable()
            break
        default:
            throw new Error('Not a valid parenthesised type')
        }

        const spatium = parent.style().spatium()
        const minPadUnit = 0.1 * spatium
        table.initPaddingTable(minPadUnit)

        table.createTable(parent.style())

        return table
    }

    protected initPaddingTable(minPadUnit: number): void {
        this.m_parenBefore.fill(minPadUnit)
        this.m_parenAfter.fill(minPadUnit)
    }
}

class NoteParenPaddingTable extends ParenPaddingTable {
    createTable(style: MStyle): void {
        const T = ElementType
        const spatium = style.spatium()
        const b = this.m_parenBefore
        const a = this.m_parenAfter

        b[T.ARPEGGIO] = style.styleMM(Sid.arpeggioAccidentalDistance)
        b[T.BAR_LINE] = style.styleMM(Sid.barAccidentalDistance)
        b[T.CLEF] = 0.6 * spatium
        b[T.HOOK] = 0.35 * spatium
        b[T.KEYSIG] = 1.6 * spatium
        b[T.LEDGER_LINE] = style.styleMM(Sid.accidentalNoteDistance)
        b[T.NOTEDOT] = 0.35 * spatium
        b[T.NOTE] = 0.35 * spatium
        b[T.REST] = 0.45 * spatium
        b[T.STEM] = 0.35 * spatium
        b[T.TIMESIG] = 0.8 * spatium
        b[T.PARENTHESIS] = style.styleMM(Sid.minNoteDistance) * 0.5

        a[T.ACCIDENTAL] = Math.max(style.styleMM(Sid.accidentalNoteDistance), 0.35 * spatium)
        a[T.ARPEGGIO] = 0.6 * spatium
        a[T.BAR_LINE] = style.styleMM(Sid.noteBarDistance)
        a[T.CLEF] = 0.8 * spatium
        a[T.KEYSIG] = 0.75 * spatium
        a[T.LEDGER_LINE] = 0.35 * spatium
        a[T.NOTE] = Math.max(style.styleMM(Sid.accidentalNoteDistance), 0.35 * spatium)
        a[T.REST] = style.styleMM(Sid.minNoteDistance)
        a[T.STEM] = style.styleMM(Sid.minNoteDistance)
        a[T.TIMESIG] = 0.75 * spatium
        a[T.PARENTHESIS] = style.styleMM(Sid.minNoteDistance) * 0.5
    }
}

class KeySigParenPaddingTable extends ParenPaddingTable {
    createTable(style: MStyle): void {
        const T = ElementType
        const spatium = style.spatium()
        const b = this.m_parenBefore
        const a = this.m_parenAfter

        b[T.BAR_LINE] = 0.5 * spatium
        b[T.CLEF] = 0.25 * spatium
        b[T.HOOK] = 0.35 * spatium
        b[T.KEYSIG] = 0.25 * spatium
        b[T.NOTEDOT] = 0.35 * spatium
        b[T.NOTE] = style.styleMM(Sid.noteBarDistance)
        b[T.REST] = b[T.NOTE]
        b[T.STEM] = 0.35 * spatium
        b[T.TIMESIG] = 0.25 * spatium
        b[T.PARENTHESIS] = 1.0 * spatium

        a[T.BAR_LINE] = 0.5 * spatium
        a[T.CLEF] = 0.2 * spatium
        a[T.HOOK] = 0.35 * spatium
        a[T.KEYSIG] = 0.25 * spatium
        a[T.NOTEDOT] = 0.35 * spatium
        a[T.NOTE] = style.styleMM(Sid.barNoteDistance)
        a[T.REST] = a[T.NOTE]
        a[T.STEM] = 0.35 * spatium
        a[T.TIMESIG] = 0.25 * spatium
        a[T.PARENTHESIS] = 1.0 * spatium
    }
}

class TimeSigParenPaddingTable extends ParenPaddingTable {
    createTable(style: MStyle): void {
        const T = ElementType
        const spatium = style.spatium()
        const b = this.m_parenBefore
        const a = this.m_parenAfter

        b[T.BAR_LINE] = 0.5 * spatium
        b[T.CLEF] = 0.25 * spatium
        b[T.HOOK] = 0.35 * spatium
        b[T.KEYSIG] = 0.25 * spatium
        b[T.NOTEDOT] = 0.35 * spatium
        b[T.NOTE] = style.styleMM(Sid.noteBarDistance)
        b[T.REST] = b[T.NOTE]
        b[T.STEM] = 0.35 * spatium
        b[T.TIMESIG] = 0.25 * spatium
        b[T.PARENTHESIS] = 1.0 * spatium

        a[T.BAR_LINE] = 0.5 * spatium
        a[T.CLEF] = 0.2 * spatium
        a[T.HOOK] = 0.35 * spatium
        a[T.KEYSIG] = 0.35 * spatium
        a[T.NOTEDOT] = 0.2 * spatium
        a[T.NOTE] = style.styleMM(Sid.barNoteDistance)
        a[T.REST] = a[T.NOTE]
        a[T.STEM] = 0.35 * spatium
        a[T.TIMESIG] = 0.25 * spatium
        a[T.PARENTHESIS] = 1.0 * spatium
    }
}

class ClefParenPaddingTable extends ParenPaddingTable {
    createTable(style: MStyle): void {
        const T = ElementType
        const spatium = style.spatium()
        const b = this.m_parenBefore
        const a = this.m_parenAfter

        b[T.BAR_LINE] = 0.5 * spatium
        b[T.CLEF] = 0.25 * spatium
        b[T.HOOK] = 0.35 * spatium
        b[T.KEYSIG] = 0.25 * spatium
        b[T.NOTEDOT] = 0.35 * spatium
        b[T.NOTE] = style.styleMM(Sid.noteBarDistance)
        b[T.REST] = b[T.NOTE]
        b[T.STEM] = 0.35 * spatium
        b[T.TIMESIG] = 0.25 * spatium
        b[T.PARENTHESIS] = 1.0 * spatium

        a[T.BAR_LINE] = 0.5 * spatium
        a[T.CLEF] = 0.25 * spatium
        a[T.HOOK] = 0.35 * spatium
        a[T.KEYSIG] = 0.35 * spatium
        a[T.NOTEDOT] = 0.35 * spatium
        a[T.NOTE] = style.styleMM(Sid.barNoteDistance)
        a[T.REST] = a[T.NOTE]
        a[T.STEM] = 0.35 * spatium
        a[T.TIMESIG] = 0.2 * spatium
        a[T.PARENTHESIS] = 1.0 * spatium
    }
}
