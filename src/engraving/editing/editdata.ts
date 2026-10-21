/*
 * SPDX-License-Identifier: GPL-3.0-only
 * MuseScore-Web — port of MuseScore Studio (https://github.com/musescore/MuseScore)
 * Copyright (C) 2021-2026 MuseScore Limited and others
 *
 * Port of src/engraving/editing/editdata.h/.cpp (no view: C++ EditData::view() is used by the fingering text tab
 * only)
 */

import { PointF, RectF } from '../../framework/draw/types/geometry'
import { nidx, type track_idx_t } from '../types/types'
import type { EngravingItem } from '../dom/engravingitem'
import type { ElementEditData } from './elementeditdata'

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

const isMacPlatform = typeof navigator !== 'undefined' && /Mac|iPhone|iPad/.test(navigator.platform || navigator.userAgent || '')

/** C++ TextEditingControlModifier: Alt on macOS (Q_OS_MAC), else Control */
export const TextEditingControlModifier: KeyboardModifier = isMacPlatform ? KeyboardModifier.AltModifier : KeyboardModifier.ControlModifier

/** the Qt key codes used by the editing code (C++ KeyboardKey) */
export enum KeyboardKey {
    Key_Escape = 0x01000000,
    Key_Tab = 0x01000001,
    Key_Backtab = 0x01000002,
    Key_Backspace = 0x01000003,
    Key_Return = 0x01000004,
    Key_Enter = 0x01000005,
    Key_Insert = 0x01000006,
    Key_Delete = 0x01000007,
    Key_Home = 0x01000010,
    Key_End = 0x01000011,
    Key_Left = 0x01000012,
    Key_Up = 0x01000013,
    Key_Right = 0x01000014,
    Key_Down = 0x01000015,
    Key_PageUp = 0x01000016,
    Key_PageDown = 0x01000017,
    Key_Shift = 0x01000020,
    Key_Control = 0x01000021,
    Key_Meta = 0x01000022,
    Key_Alt = 0x01000023,
    Key_F2 = 0x01000031,
    Key_Space = 0x20,
    Key_QuoteDbl = 0x22,
    Key_NumberSign = 0x23,
    Key_Apostrophe = 0x27,
    Key_Minus = 0x2d,
    Key_0 = 0x30,
    Key_1 = 0x31,
    Key_2 = 0x32,
    Key_3 = 0x33,
    Key_4 = 0x34,
    Key_5 = 0x35,
    Key_6 = 0x36,
    Key_7 = 0x37,
    Key_8 = 0x38,
    Key_9 = 0x39,
    Key_Colon = 0x3a,
    Key_Semicolon = 0x3b,
    Key_A = 0x41,
    Key_B = 0x42,
    Key_C = 0x43,
    Key_D = 0x44,
    Key_E = 0x45,
    Key_F = 0x46,
    Key_G = 0x47,
    Key_H = 0x48,
    Key_I = 0x49,
    Key_J = 0x4a,
    Key_K = 0x4b,
    Key_L = 0x4c,
    Key_M = 0x4d,
    Key_N = 0x4e,
    Key_O = 0x4f,
    Key_P = 0x50,
    Key_Q = 0x51,
    Key_R = 0x52,
    Key_S = 0x53,
    Key_T = 0x54,
    Key_U = 0x55,
    Key_V = 0x56,
    Key_W = 0x57,
    Key_X = 0x58,
    Key_Y = 0x59,
    Key_Z = 0x5a,
    Key_Underscore = 0x5f,
    Key_AsciiTilde = 0x7e,
    Key_periodcentered = 0x0b7,
}

export enum MouseButton {
    NoButton = 0x00000000,
    LeftButton = 0x00000001,
    RightButton = 0x00000002,
    MiddleButton = 0x00000004,
}

export class EditData {
    isEditMode = false // refers to the legacy concept of "edit mode"

    grip: RectF[] = []
    grips = 0 // number of grips
    curGrip = Grip.NO_GRIP

    pos = new PointF()
    startMove = new PointF()
    normalizedStartMove = new PointF() // Introduced for transition of drag logic. Don't use in new code.
    lastPos = new PointF()
    delta = new PointF() // This property is deprecated, use evtDelta or moveDelta instead. In normal drag equals to moveDelta, in edit drag - to evtDelta
    evtDelta = new PointF() // Mouse offset for the last mouse move event
    moveDelta = new PointF() // Mouse offset from the start of mouse move
    hRaster = false
    vRaster = false
    isHairpinDragCreatedFromDynamic = false

    key = 0
    /** KeyboardModifier flags */
    modifiers = 0
    s = ''
    preeditString = ''

    /** MouseButton flags */
    buttons = MouseButton.NoButton

    // drop data:
    dragOffset = new PointF()
    element: EngravingItem | null = null
    dropElement: EngravingItem | null = null
    track: track_idx_t = nidx

    private m_data: ElementEditData[] = []

    /** C++ *this = EditData(m_view) */
    clear(): void {
        Object.assign(this, new EditData())
    }

    /** C++ copy constructor (the element data are shared like the shared_ptrs) */
    clone(): EditData {
        const ed = new EditData()
        Object.assign(ed, this)
        ed.grip = this.grip.map(r => r.clone())
        ed.m_data = [...this.m_data]
        return ed
    }

    getData(e: EngravingItem | null): ElementEditData | null {
        for (const ed of this.m_data) {
            if (ed.e === e) {
                return ed
            }
        }
        return null
    }

    addData(ed: ElementEditData | null): void {
        if (ed) {
            this.m_data.push(ed)
        }
    }

    control(textEditing = false): boolean {
        if (textEditing) {
            return (this.modifiers & TextEditingControlModifier) !== 0
        }
        return (this.modifiers & KeyboardModifier.ControlModifier) !== 0
    }

    shift(): boolean { return (this.modifiers & KeyboardModifier.ShiftModifier) !== 0 }
    isStartEndGrip(): boolean { return this.curGrip === Grip.START || this.curGrip === Grip.END }
    hasCurrentGrip(): boolean { return this.curGrip !== Grip.NO_GRIP }
}
