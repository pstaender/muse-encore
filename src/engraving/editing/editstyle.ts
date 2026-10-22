/*
 * SPDX-License-Identifier: GPL-3.0-only
 * MuseScore-Web — port of MuseScore Studio (https://github.com/musescore/MuseScore)
 * Copyright (C) 2021-2026 MuseScore Limited and others
 *
 * Port of src/engraving/editing/editstyle.h/.cpp
 */

import { propertyValueEquals, type PropertyValue } from '../types/propertyvalue'
import { Sid } from '../style/styledef'
import type { MStyle } from '../style/style'
import { ChordStylePreset } from '../types/types'
import type { EngravingObject } from '../dom/engravingobject'
import type { EngravingItem } from '../dom/engravingitem'
import type { Score } from '../dom/score'
import { CommandType, UndoCommand } from './undo'
import type { EditData } from './editdata'

function changeChordStyle(score: Score): void {
    const style = score.style()
    score.chordList().unload()
    const emag = style.styleD(Sid.chordExtensionMag)
    const eadjust = style.styleD(Sid.chordExtensionAdjust)
    const mmag = style.styleD(Sid.chordModifierMag)
    const madjust = style.styleD(Sid.chordModifierAdjust)
    const stackedmmag = style.styleD(Sid.chordStackedModifierMag)
    const mstackModifiers = style.styleB(Sid.verticallyStackModifiers)
    const mexcludeModsHAlign = style.styleB(Sid.chordAlignmentExcludeModifiers)
    const msymbolFont = style.styleSt(Sid.musicalTextFont)
    const preset = style.styleV(Sid.chordStyle) as ChordStylePreset
    score.chordList().configureAutoAdjust(emag, eadjust, mmag, madjust, stackedmmag, mstackModifiers, mexcludeModsHAlign,
        msymbolFont, preset)
    if (score.style().styleB(Sid.chordsXmlFile)) {
        score.chordList().read('chords.xml')
    }
    score.chordList().read(style.styleSt(Sid.chordDescriptionFile) ?? '')
    score.chordList().setCustomChordList(preset === ChordStylePreset.CUSTOM)
}

/**
 * C++ Score::styleChanged() also updates the styled properties of all elements (updateStyle) and the staff types;
 * the port's Score.styleChanged() (also used by the readers) only resets the cached font data.
 * TODO(port): StaffType::styleChanged(), createPaddingTable()
 */
function scoreStyleChanged(score: Score): void {
    score.styleChanged()
    score.scanElements((e: EngravingItem) => {
        const v = e.generated()
        e.styleChanged()
        e.setGenerated(v)
    })
    score.setLayoutAll()
}

// ---------------------------------------------------------
//   ChangeStyle
// ---------------------------------------------------------

export class ChangeStyle extends UndoCommand {
    private score: Score
    private style: MStyle
    private overlap: boolean

    constructor(s: Score, st: MStyle, overlapOnly = false) {
        super()
        this.score = s
        this.style = st.clone()
        this.overlap = overlapOnly
    }

    changedIds(): Set<Sid> {
        const result = new Set<Sid>()
        for (let sid = 0; sid < Sid.STYLES; ++sid) {
            if (!propertyValueEquals(this.score.style().styleV(sid as Sid), this.style.value(sid as Sid))) {
                result.add(sid as Sid)
            }
        }
        return result
    }

    override type(): CommandType { return CommandType.ChangeStyle }
    override name(): string { return 'ChangeStyle' }
    override objectItems(): EngravingObject[] { return [this.score] }

    override undo(ed: EditData | null): void {
        this.overlap = false
        super.undo(ed)
    }

    protected override flip(_ed: EditData | null): void {
        const tmp = this.score.style().clone()

        // TODO(port): cmdConcertPitchChanged() when Sid::concertPitch changes
        this.score.setStyle(this.style, this.overlap)
        changeChordStyle(this.score)
        // TODO(port): spatiumChanged() (EngravingItem::spatiumChanged scales user offsets)
        scoreStyleChanged(this.score)
        this.style = tmp
    }
}

// ---------------------------------------------------------
//   ChangeStyleValues
// ---------------------------------------------------------

function changeStyleValue(score: Score, idx: Sid, _oldValue: PropertyValue, newValue: PropertyValue): void {
    score.style().set(idx, newValue)
    switch (idx) {
    case Sid.chordExtensionMag:
    case Sid.chordExtensionAdjust:
    case Sid.chordModifierMag:
    case Sid.chordModifierAdjust:
    case Sid.chordDescriptionFile:
    case Sid.verticallyStackModifiers:
    case Sid.chordAlignmentExcludeModifiers:
    case Sid.musicalTextFont:
        changeChordStyle(score)
        break
    case Sid.spatium:
        // TODO(port): Score::spatiumChanged (EngravingItem::spatiumChanged scales user offsets)
        break
    case Sid.defaultsVersion:
        score.style().setDefaultStyleVersion(newValue as number)
        break
    case Sid.createMultiMeasureRests:
        // TODO(port): EditSystemLocks::removeSystemLocksContainingMMRests
        break
    default:
        break
    }
}

export class ChangeStyleValues extends UndoCommand {
    private m_score: Score | null
    private m_values: Map<Sid, PropertyValue>

    constructor(s: Score | null, values: Map<Sid, PropertyValue>) {
        super()
        this.m_score = s
        this.m_values = new Map(values)
    }

    values(): ReadonlyMap<Sid, PropertyValue> { return this.m_values }
    changedIds(): Iterable<Sid> { return this.m_values.keys() }

    override type(): CommandType { return CommandType.ChangeStyleValues }
    override name(): string { return 'ChangeStyleValues' }
    override objectItems(): EngravingObject[] { return this.m_score ? [this.m_score] : [] }

    protected override flip(_ed: EditData | null): void {
        if (!this.m_score) {
            return
        }

        let styleChanged = false
        const style = this.m_score.style()

        for (const [sid, value] of this.m_values) {
            const oldValue = style.styleV(sid)
            if (propertyValueEquals(oldValue, value)) {
                continue
            }

            changeStyleValue(this.m_score, sid, oldValue, value)
            this.m_values.set(sid, oldValue)

            styleChanged = true
        }

        if (styleChanged) {
            scoreStyleChanged(this.m_score)
        }
    }
}
