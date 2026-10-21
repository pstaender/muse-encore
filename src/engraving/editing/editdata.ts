/*
 * SPDX-License-Identifier: GPL-3.0-only
 * MuseScore-Web — port of MuseScore Studio (https://github.com/musescore/MuseScore)
 * Copyright (C) 2021-2026 MuseScore Limited and others
 *
 * Port of src/engraving/editing/editdata.h/.cpp (the parts used by undo and drop; no grips/drag data, no
 * ElementEditData, no view)
 */

import { PointF } from '../../framework/draw/types/geometry'
import { nidx, type track_idx_t } from '../types/types'
import type { EngravingItem } from '../dom/engravingitem'

export enum Grip {
    NO_GRIP = -1,
    START = 0, END = 1, // arpeggio etc.
    LEFT = START, RIGHT = END, // aliases for dynamic
    MIDDLE = 2, APERTURE = 3, // Line
    BEZIER1 = 2, SHOULDER = 3, BEZIER2 = 4, DRAG = 5, // Slur
    GRIPS = 6, // number of grips for slur
}

export enum KeyboardModifier {
    NoModifier = 0x00000000,
    ShiftModifier = 0x02000000,
    ControlModifier = 0x04000000,
    AltModifier = 0x08000000,
    MetaModifier = 0x10000000,
    KeypadModifier = 0x20000000,
    GroupSwitchModifier = 0x40000000,
}

export class EditData {
    isEditMode = false // refers to the legacy concept of "edit mode"
    curGrip = Grip.NO_GRIP

    pos = new PointF()
    startMove = new PointF()
    lastPos = new PointF()
    delta = new PointF()
    evtDelta = new PointF()
    moveDelta = new PointF()
    hRaster = false
    vRaster = false

    key = 0
    /** KeyboardModifier flags */
    modifiers = 0
    s = ''

    // drop data:
    dragOffset = new PointF()
    element: EngravingItem | null = null
    dropElement: EngravingItem | null = null
    track: track_idx_t = nidx

    clear(): void {
        this.element = null
        this.dropElement = null
        this.track = nidx
        this.curGrip = Grip.NO_GRIP
        this.modifiers = 0
        this.s = ''
        this.key = 0
    }

    control(_textEditing = false): boolean { return (this.modifiers & KeyboardModifier.ControlModifier) !== 0 }
    shift(): boolean { return (this.modifiers & KeyboardModifier.ShiftModifier) !== 0 }
    isStartEndGrip(): boolean { return this.curGrip === Grip.START || this.curGrip === Grip.END }
    hasCurrentGrip(): boolean { return this.curGrip !== Grip.NO_GRIP }
}
