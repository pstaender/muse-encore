/*
 * SPDX-License-Identifier: GPL-3.0-only
 * MuseEncore — port of MuseScore Studio (https://github.com/musescore/MuseScore)
 * Copyright (C) 2021-2026 MuseScore Limited and others
 *
 * Port of src/engraving/rendering/score/scorerenderer.h/.cpp
 *
 * TODO(port): painting (paintScore/paintItem), layoutTextLineBaseSegment
 */

import type { Fraction } from '../../types/fraction'
import { LayoutMode, scoreRendererHooks, type Score } from '../../dom/score'
import type { Beam } from '../../dom/beam'
import type { Chord } from '../../dom/chord'
import { chordRestRenderer, type ChordRest } from '../../dom/chordrest'
import { ldataShapeHooks, type EngravingItem } from '../../dom/engravingitem'
import { anchorsLayoutHooks } from '../../dom/anchors'
import type { GuitarBendSegment } from '../../dom/guitarbend'
import type { TrillSegment } from '../../dom/trill'
import type { Tuplet } from '../../dom/tuplet'
import { ElementType } from '../../types/types'
import { LayoutContext } from './layoutcontext'
import { ScoreLayout, ScorePageViewLayout } from './scorelayout'
import { TLayout } from './tlayout'
import { ChordLayout } from './chordlayout'
import { MeasureLayout } from './measurelayout'
import { textBaseRenderer, type TextBase } from '../../dom/textbase'
import type { Harmony } from '../../dom/harmony'
import { TextLayout } from './textlayout'
import { HarmonyLayout } from './harmonylayout'
// the layout uses the undo functions of the editing modules (e.g. Measure.undoGetSegment -> Score.undoAddElement)
import '../../editing/edit'
import '../../editing/cmd'

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

    static layoutText1(item: TextBase, base = false): void {
        const ctx = new LayoutContext(item.score())
        if (base) {
            TextLayout.layoutBaseTextBase1(item)
        } else if (item.isHarmony()) {
            HarmonyLayout.layoutHarmony(item as unknown as Harmony, ctx)
        } else {
            TextLayout.layoutBaseTextBase1(item)
        }
    }
}

scoreRendererHooks.layoutScore = (score, st, et) => ScoreRenderer.layoutScore(score, st, et)
scoreRendererHooks.layoutItem = (e) => ScoreRenderer.layoutItem(e)
chordRestRenderer.layoutBeam1 = (b) => ScoreRenderer.layoutBeam1(b)
chordRestRenderer.layoutStem = (c) => ScoreRenderer.layoutStem(c)
textBaseRenderer.layoutText1 = (t, base) => ScoreRenderer.layoutText1(t, base)
textBaseRenderer.layoutItem = (e) => ScoreRenderer.layoutItem(e)

// C++ EngravingItem::LayoutData::shape(): "Temporary fix" refilling shapes on access
ldataShapeHooks[ElementType.GUITAR_BEND_SEGMENT] = (item) => TLayout.fillGuitarBendSegmentShape(item as GuitarBendSegment)
ldataShapeHooks[ElementType.TRILL_SEGMENT] = (item) => TLayout.fillTrillSegmentShape(item as TrillSegment)
ldataShapeHooks[ElementType.TUPLET] = (item) => TLayout.fillTupletShape(item as Tuplet)
// ChordLayout::checkAndFillShape(): "Temporary fix" until the layout order of the elements is figured out
const fillChordRestShape = (item: EngravingItem): void => ChordLayout.fillShape(item as ChordRest, new LayoutContext(item.score()))
anchorsLayoutHooks.layoutTimeTickAnchors = (measure) => MeasureLayout.layoutTimeTickAnchors(measure, new LayoutContext(measure.score()))

ldataShapeHooks[ElementType.CHORD] = fillChordRestShape
ldataShapeHooks[ElementType.REST] = fillChordRestShape
ldataShapeHooks[ElementType.MEASURE_REPEAT] = fillChordRestShape
ldataShapeHooks[ElementType.MMREST] = fillChordRestShape
