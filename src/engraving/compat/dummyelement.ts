/*
 * SPDX-License-Identifier: GPL-3.0-only
 * MuseScore-Web — port of MuseScore Studio (https://github.com/musescore/MuseScore)
 * Copyright (C) 2021-2026 MuseScore Limited and others
 *
 * Port of src/engraving/compat/dummyelement.h/.cpp:
 * a tree of dummy elements used as temporary parents while reading
 */

import { Fraction } from '../types/fraction'
import { ElementType } from '../types/types'
import { EngravingItem } from '../dom/engravingitem'
import { Page } from '../dom/page'
import { System } from '../dom/system'
import { Measure } from '../dom/measure'
import { Segment, SegmentType } from '../dom/segment'
import { Chord } from '../dom/chord'
import { Note } from '../dom/note'
import type { Score } from '../dom/score'

export class DummyElement extends EngravingItem {
    private m_page: Page
    private m_system: System
    private m_measure: Measure
    private m_segment: Segment
    private m_chord: Chord
    private m_note: Note

    constructor(score: Score) {
        super(ElementType.DUMMY, score)
        this.m_page = new Page(this)
        this.m_system = new System(this.m_page)
        this.m_measure = new Measure(this.m_system)
        this.m_segment = new Segment(this.m_measure, SegmentType.ChordRest, new Fraction(0, 1))
        this.m_chord = new Chord(this.m_segment)
        this.m_note = new Note(this.m_chord)
    }

    page(): Page { return this.m_page }
    system(): System { return this.m_system }
    measure(): Measure { return this.m_measure }
    segment(): Segment { return this.m_segment }
    chord(): Chord { return this.m_chord }
    note(): Note { return this.m_note }
}

const s_dummies = new WeakMap<Score, DummyElement>()

/** Score::dummy() */
export function scoreDummy(score: Score): DummyElement {
    let d = s_dummies.get(score)
    if (!d) {
        d = new DummyElement(score)
        s_dummies.set(score, d)
    }
    return d
}
