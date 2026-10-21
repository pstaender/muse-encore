/*
 * SPDX-License-Identifier: GPL-3.0-only
 * The data of the current drag inside the app (MuseScore's DragController: QML drags carry their mime data there).
 * HTML drag and drop only reveals the data on drop, but the score view and the palettes need it while dragging over
 * them (drop target, insert position): the drag source puts it here too.
 * Score elements dragged out of the score view (Shift+Ctrl+drag) are not HTML drags (the view has the pointer
 * captured): the view dispatches ELEMENT_DROP_EVENT on the element under the pointer at the end.
 */

/** MuseScore's mime formats of the drag data */
export interface AppDragData {
    /** mimeSymbolFormat: the element */
    symbol?: string
    /** PaletteCell::mimeDataFormat: the cell */
    cell?: string
    /** a palette cell being dragged: its palette and id (null: a cell of the search or of "More") */
    source?: { paletteId: string | null; cellId: string; pool: 'main' | 'more' | 'custom' }
}

let s_drag: AppDragData | null = null

export function setDragData(data: AppDragData | null): void {
    s_drag = data
}

export function dragData(): AppDragData | null {
    return s_drag
}

/** the event the score view dispatches when an element dragged out of the score is released over the app */
export const ELEMENT_DROP_EVENT = 'musescore-element-drop'

export interface ElementDropDetail {
    /** mimeSymbolFormat data */
    mimeData: string
    clientX: number
    clientY: number
}

/** the event while an element dragged out of the score is over the app (for drop indicators) */
export const ELEMENT_DRAG_OVER_EVENT = 'musescore-element-dragover'
