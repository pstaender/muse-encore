/*
 * SPDX-License-Identifier: GPL-3.0-only
 * MuseEncore — port of MuseScore Studio (https://github.com/musescore/MuseScore)
 * Copyright (C) 2021-2026 MuseScore Limited and others
 *
 * Port of src/engraving/rendering/score/passresetlayoutdata.cpp and passlayoutindependentitems.cpp
 * (C++ RootItem is the score itself here)
 */

import { ElementType } from '../../types/types'
import type { EngravingItem } from '../../dom/engravingitem'
import type { EngravingObject } from '../../dom/engravingobject'
import type { Score } from '../../dom/score'
import type { Measure } from '../../dom/measure'
import type { ChordRest } from '../../dom/chordrest'
import { SegmentType } from '../../dom/segment'
import type { LayoutContext } from './layoutcontext'
import { TLayout } from './tlayout'

function childrenItems(o: EngravingObject): EngravingItem[] {
    return o.children().filter(c => c.isEngravingItem()) as EngravingItem[]
}

function resetLayoutData(item: EngravingObject): void {
    if (item.isEngravingItem()) {
        (item as EngravingItem).mutldata().reset()
    }
    for (const ch of childrenItems(item)) {
        resetLayoutData(ch)
    }
}

export class PassResetLayoutData {
    run(score: Score, ctx: LayoutContext): void {
        if (ctx.state().isLayoutAll()) {
            resetLayoutData(score)
            // C++ resets the tree of the RootItem: ScorePageViewLayout::prepareScore has deleted the systems and pages,
            // ~EngravingObject moved their children (measures, spanner segments) to the dummy, multimeasure rests
            // are moved there explicitly and spanners are children of the dummy anyway. In the port these objects
            // keep their detached parents, so they are reset here explicitly.
            for (let mb = score.first(); mb; mb = mb.next()) {
                resetLayoutData(mb)
                if (mb.isMeasure() && (mb as Measure).mmRest()) {
                    resetLayoutData((mb as Measure).mmRest()!)
                }
                if (mb.isMeasure()) {
                    // beams are children of their system
                    for (let s = (mb as Measure).first(SegmentType.ChordRest); s; s = s.next(SegmentType.ChordRest)) {
                        for (const e of s.elist()) {
                            const beam = e && e.isChordRest() ? (e as ChordRest).beam() : null
                            if (beam && beam.elements()[0] === e) {
                                resetLayoutData(beam)
                            }
                        }
                    }
                }
            }
            for (const sp of [...score.spanner(), ...score.unmanagedSpanners()]) {
                resetLayoutData(sp)
                for (const ss of sp.spannerSegments()) {
                    resetLayoutData(ss)
                }
            }
        } else {
            let m = ctx.mutState().nextMeasure()
            while (m && m.tick().le(ctx.state().endTick())) {
                resetLayoutData(m)
                m = m.next()
            }
        }
    }
}

export class PassLayoutIndependentItems {
    run(score: Score, ctx: LayoutContext): void {
        for (const ch of childrenItems(score)) {
            this.scan(ch, ctx)
        }
    }

    private scan(item: EngravingItem, ctx: LayoutContext): void {
        switch (item.type()) {
        case ElementType.ACCIDENTAL:
        case ElementType.ACTION_ICON:
        case ElementType.AMBITUS:
        case ElementType.BREATH:
        case ElementType.CLEF:
        case ElementType.DEAD_SLAPPED:
        case ElementType.HARMONY:
        case ElementType.HOOK:
        case ElementType.INSTRUMENT_NAME:
        case ElementType.KEYSIG:
        case ElementType.LAYOUT_BREAK:
        case ElementType.NOTE:
        case ElementType.NOTEDOT:
        case ElementType.STAFF_STATE:
        case ElementType.STAFFTYPE_CHANGE:
        case ElementType.STEM:
        case ElementType.SYMBOL:
        case ElementType.FSYMBOL:
        case ElementType.SYSTEM_DIVIDER:
        case ElementType.TIMESIG:
        case ElementType.TREMOLOBAR:
            TLayout.layoutItem(item, ctx)
            break
        default:
            break
        }
        for (const ch of childrenItems(item)) {
            if (ch.isType(ElementType.DUMMY)) {
                continue
            }
            this.scan(ch, ctx)
        }
    }
}
