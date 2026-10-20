/*
 * SPDX-License-Identifier: GPL-3.0-only
 * MuseScore-Web — port of MuseScore Studio (https://github.com/musescore/MuseScore)
 * Copyright (C) 2021-2026 MuseScore Limited and others
 *
 * Port of src/engraving/rendering/score/scorerenderer.h/.cpp
 *
 * TODO(port): painting (paintScore/paintItem), layoutText1, layoutTextLineBaseSegment
 */

import type { Fraction } from '../../types/fraction'
import { LayoutMode, type Score } from '../../dom/score'
import type { Beam } from '../../dom/beam'
import type { Chord } from '../../dom/chord'
import { chordRestRenderer } from '../../dom/chordrest'
import { ldataShapeHooks, type EngravingItem } from '../../dom/engravingitem'
import type { GuitarBendSegment } from '../../dom/guitarbend'
import { ElementType } from '../../types/types'
import { LayoutContext } from './layoutcontext'
import { ScoreLayout, ScorePageViewLayout } from './scorelayout'
import { TLayout } from './tlayout'
import { ChordLayout } from './chordlayout'

export class ScoreRenderer {
    static layoutScore(score: Score, st: Fraction, et: Fraction): void {
        ScoreLayout.layoutRange(score, st, et)
    }

    static layoutHeadersFooters(score: Score): void {
        const ctx = new LayoutContext(score)
        if (!ctx.conf().isMode(LayoutMode.PAGE) && !ctx.conf().isMode(LayoutMode.FLOAT)) {
            return
        }
        ScorePageViewLayout.layoutHeadersFooters(ctx)
    }

    static layoutItem(item: EngravingItem): void {
        TLayout.layoutItem(item, new LayoutContext(item.score()))
    }

    static layoutBeam1(item: Beam): void {
        TLayout.layoutBeam1(item, new LayoutContext(item.score()))
    }

    static layoutStem(item: Chord): void {
        ChordLayout.layoutStem(item, new LayoutContext(item.score()))
    }
}

chordRestRenderer.layoutBeam1 = (b) => ScoreRenderer.layoutBeam1(b)
chordRestRenderer.layoutStem = (c) => ScoreRenderer.layoutStem(c)

// C++ EngravingItem::LayoutData::shape(): "Temporary fix" refilling shapes on access
ldataShapeHooks[ElementType.GUITAR_BEND_SEGMENT] = (item) => TLayout.fillGuitarBendSegmentShape(item as GuitarBendSegment)
