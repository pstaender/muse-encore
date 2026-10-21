/*
 * SPDX-License-Identifier: GPL-3.0-only
 * MuseScore-Web — port of MuseScore Studio (https://github.com/musescore/MuseScore)
 * Copyright (C) 2021-2026 MuseScore Limited and others
 *
 * Port of src/engraving/editing/textedit.h/.cpp: TextEditData, the undo commands of text editing (ChangeTextProperties,
 * InsertText, RemoveText, SplitText, JoinText) and the edit functions of TextBase (editInsertText, startEdit, endEdit,
 * commitText, insertSym, insertText, isEditAllowed, edit, movePosition, drop, paste, endHexState,
 * deleteSelectedText). The TextBase functions are added to the class by this module, so it must be imported before
 * texts are edited.
 *
 * TODO(port): accessibility notifications (notifyAboutTextCursorChanged/Inserted/Removed), the fingering text tab
 * (EditData::view()->textTab), partial lyrics lines (findPrevPartialLyricsLineDash), FSymbol drops.
 */

import { FontStyle } from '../types/types'
import { TranslatableString } from '../../framework/global/types/translatablestring'
import { SymId } from '../types/symid'
import { SymNames } from '../types/symnames'
import type { PropertyValue } from '../types/propertyvalue'
import { Pid, PropertyFlags } from '../dom/property'
import { SelectType } from '../dom/select'
import {
    CharFormat, FormatId, TextBase, TextCursor, TextCursorMoveMode, TextCursorMoveOperation, textBaseRenderer,
} from '../dom/textbase'
import type { EngravingItem } from '../dom/engravingitem'
import type { EngravingObject } from '../dom/engravingobject'
import type { Lyrics } from '../dom/lyrics'
import type { Symbol } from '../dom/symbol'
import type { FretDiagram } from '../dom/fret'
import { prevLyrics } from '../dom/navigate'
import { CommandType, UndoCommand, UndoCommandFilter } from './undo'
import { ElementEditData, EditDataType } from './elementeditdata'
import { KeyboardKey, KeyboardModifier, TextEditingControlModifier, type EditData } from './editdata'

// ---------------------------------------------------------------------------------------------------------------------
//   TextEditData
// ---------------------------------------------------------------------------------------------------------------------

export class TextEditData extends ElementEditData {
    oldXmlText = ''
    startUndoIdx = 0

    deleteText = false

    selectedText = ''
    selectedPlainText = ''
    static readonly mimeRichTextFormat = 'application/musescore/richtext'

    constructor(private m_textBase: TextBase) {
        super()
    }

    cursor(): TextCursor { return this.m_textBase.cursor() }

    override type(): EditDataType { return EditDataType.TextEditData }

    setDeleteText(val: boolean): void { this.deleteText = val }
}

// ---------------------------------------------------------------------------------------------------------------------
//   TextEditUndoCommand
// ---------------------------------------------------------------------------------------------------------------------

export class TextEditUndoCommand extends UndoCommand {
    protected m_cursor: TextCursor

    constructor(tc: TextCursor) {
        super()
        this.m_cursor = tc.clone() // C++ stores a copy
    }

    override type(): CommandType { return CommandType.TextEdit }
    override name(): string { return 'TextEdit' }
    override objectItems(): EngravingObject[] { return [this.m_cursor.text()] }

    override isFiltered(f: UndoCommandFilter, target: EngravingItem): boolean {
        return f === UndoCommandFilter.TextEdit && this.m_cursor.text() === target
    }

    cursor(): TextCursor { return this.m_cursor }
}

// ---------------------------------------------------------------------------------------------------------------------
//   ChangeTextProperties
// ---------------------------------------------------------------------------------------------------------------------

export class ChangeTextProperties extends TextEditUndoCommand {
    private m_xmlText = ''
    private m_propertyId: Pid
    private m_propertyVal: PropertyValue
    private m_existingStyle = FontStyle.Normal
    private m_flags: PropertyFlags

    constructor(tc: TextCursor, propId: Pid, propVal: PropertyValue, flags: PropertyFlags) {
        super(tc)
        this.m_propertyId = propId
        this.m_propertyVal = propVal
        this.m_flags = flags
        if (this.m_propertyId === Pid.FONT_STYLE) {
            this.m_existingStyle = this.cursor().text().getProperty(propId) as FontStyle
        }
    }

    override name(): string { return 'ChangeTextProperties' }

    private restoreSelection(): void {
        const tc = this.cursor()
        tc.text().cursor().setSelectLine(tc.selectLine())
        tc.text().cursor().setSelectColumn(tc.selectColumn())
        tc.text().cursor().setRow(tc.row())
        tc.text().cursor().setColumn(tc.column())
    }

    override undo(_ed: EditData | null): void {
        this.cursor().text().resetFormatting()
        this.cursor().text().setXmlText(this.m_xmlText)
        this.restoreSelection()
        textBaseRenderer.layoutText1(this.cursor().text())
    }

    override redo(_ed: EditData | null): void {
        this.m_xmlText = this.cursor().text().xmlText()
        this.restoreSelection()
        this.cursor().text().setPropertyFlags(this.m_propertyId, this.m_flags)

        if (this.m_propertyId === Pid.FONT_STYLE) {
            const setStyle = this.m_propertyVal as FontStyle
            const tc = this.cursor().text().cursor()
            // user turned on bold/italic/underline/strike for text where it's not set, or turned it off for text where it is set,
            // note this logic only works because the user can only click one at a time
            if ((setStyle & FontStyle.Bold) !== (this.m_existingStyle & FontStyle.Bold)) {
                tc.setFormat(FormatId.Bold, (setStyle & FontStyle.Bold) !== 0)
            }
            if ((setStyle & FontStyle.Italic) !== (this.m_existingStyle & FontStyle.Italic)) {
                tc.setFormat(FormatId.Italic, (setStyle & FontStyle.Italic) !== 0)
            }
            if ((setStyle & FontStyle.Underline) !== (this.m_existingStyle & FontStyle.Underline)) {
                tc.setFormat(FormatId.Underline, (setStyle & FontStyle.Underline) !== 0)
            }
            if ((setStyle & FontStyle.Strike) !== (this.m_existingStyle & FontStyle.Strike)) {
                tc.setFormat(FormatId.Strike, (setStyle & FontStyle.Strike) !== 0)
            }
        } else {
            this.cursor().text().setProperty(this.m_propertyId, this.m_propertyVal)
        }
    }
}

// ---------------------------------------------------------------------------------------------------------------------
//   ChangeText, InsertText, RemoveText
// ---------------------------------------------------------------------------------------------------------------------

export abstract class ChangeText extends TextEditUndoCommand {
    private m_s: string
    private m_format: CharFormat

    constructor(tc: TextCursor, t: string) {
        super(tc)
        this.m_s = t
        this.m_format = tc.format().clone()
    }

    string(): string { return this.m_s }

    protected insertText(ed: EditData | null): void {
        const tc = this.m_cursor.clone()
        tc.setFormatObj(this.m_format) // To undo TextCursor::updateCursorFormat()
        tc.text().editInsertText(tc, this.m_s)
        if (ed) {
            const ttc = tc.text().cursorFromEditData(ed)
            ttc.assign(tc)
        }
    }

    protected removeText(ed: EditData | null): void {
        const tc = this.m_cursor.clone()
        const l = this.m_cursor.curLine()
        const column = this.m_cursor.column()
        this.m_format = l.formatAt(column + this.m_s.length - 1)!.clone()

        for (let n = 0; n < this.m_s.length; ++n) {
            l.remove(column, this.m_cursor)
        }
        this.m_cursor.text().triggerLayout()
        if (ed) {
            this.m_cursor.text().cursorFromEditData(ed).assign(tc)
        }
        this.m_cursor.text().setTextInvalid()
    }
}

export class InsertText extends ChangeText {
    override redo(ed: EditData | null): void { this.insertText(ed) }
    override undo(ed: EditData | null): void { this.removeText(ed) }
    override name(): string { return 'InsertText' }
}

export class RemoveText extends ChangeText {
    override redo(ed: EditData | null): void { this.removeText(ed) }
    override undo(ed: EditData | null): void { this.insertText(ed) }
    override name(): string { return 'RemoveText' }
}

// ---------------------------------------------------------------------------------------------------------------------
//   SplitJoinText, SplitText, JoinText
// ---------------------------------------------------------------------------------------------------------------------

export class SplitJoinText extends TextEditUndoCommand {
    protected join(ed: EditData | null): void {
        const t = this.m_cursor.text()
        const line = this.m_cursor.row()
        t.setTextInvalid()
        t.triggerLayout()

        const ldata = t.mutldata()
        const charFmt = this.m_cursor.format().clone() // take current format
        const col = ldata.textBlock(line - 1).columns()
        const eol = ldata.textBlock(line).eol()
        const fragmentsList = ldata.textBlock(line).fragmentsWithoutEmpty()

        if (fragmentsList.length > 0) {
            ldata.textBlock(line - 1).removeEmptyFragment()
        }
        ldata.textBlock(line - 1).fragments().push(...fragmentsList)

        ldata.blocks.splice(line, 1)

        this.m_cursor.setRow(line - 1)
        this.m_cursor.curLine().setEol(eol)
        this.m_cursor.setColumn(col)
        this.m_cursor.setFormatObj(charFmt) // restore orig. format at new line
        this.m_cursor.clearSelection()

        if (ed) {
            t.cursorFromEditData(ed).assign(this.m_cursor)
        }
        this.m_cursor.text().setTextInvalid()
    }

    protected split(ed: EditData | null): void {
        const t = this.m_cursor.text()
        const line = this.m_cursor.row()
        const eol = this.m_cursor.curLine().eol()
        t.setTextInvalid()
        t.triggerLayout()

        const ldata = t.mutldata()
        const charFmt = this.m_cursor.format().clone() // take current format
        // C++ passes t->cursorFromEditData(*ed) (the text's cursor)
        ldata.blocks.splice(line + 1, 0, this.m_cursor.curLine().split(this.m_cursor.column(), t.cursor()))
        this.m_cursor.curLine().setEol(true)

        this.m_cursor.setRow(line + 1)
        this.m_cursor.curLine().setEol(eol)
        this.m_cursor.setColumn(0)
        this.m_cursor.setFormatObj(charFmt) // restore orig. format at new line
        this.m_cursor.clearSelection()

        if (ed) {
            t.cursorFromEditData(ed).assign(this.m_cursor)
        }
        this.m_cursor.text().setTextInvalid()
    }
}

export class SplitText extends SplitJoinText {
    override undo(ed: EditData | null): void { this.join(ed) }
    override redo(ed: EditData | null): void { this.split(ed) }
    override name(): string { return 'SplitText' }
}

export class JoinText extends SplitJoinText {
    override undo(ed: EditData | null): void { this.split(ed) }
    override redo(ed: EditData | null): void { this.join(ed) }
    override name(): string { return 'JoinText' }
}

// ---------------------------------------------------------------------------------------------------------------------
//   TextBase edit functions
// ---------------------------------------------------------------------------------------------------------------------

declare module '../dom/textbase' {
    interface TextBase {
        editInsertText(cursor: TextCursor, s: string): void
        commitText(): void
        insertSym(ed: EditData, id: SymId): void
        insertText(ed: EditData, s: string): void
        movePosition(ed: EditData, op: TextCursorMoveOperation): void
        paste(ed: EditData, txt: string): void
        endHexState(ed: EditData): void
        deleteSelectedText(ed: EditData): boolean
    }
}

TextBase.prototype.editInsertText = function (this: TextBase, cursor: TextCursor, s: string): void {
    const ldata = this.ldata()
    if (ldata.layoutInvalid) {
        return
    }

    this.setTextInvalid()

    let col = 0
    for (let i = 0; i < s.length; ++i) {
        const c = s.charCodeAt(i)
        if (!(c >= 0xD800 && c <= 0xDBFF)) { // isHighSurrogate
            ++col
        }
    }

    const block = ldata.blocks[cursor.row()]
    const previousFormat = block.formatAt(Math.max(cursor.column() - 1, 0))
    if (previousFormat && previousFormat.fontFamily() === 'ScoreText' && s === ' ') {
        // This space would be ignored by the xml parser (see #15629)
        // We must use the nonBreaking space character instead
        const nonBreakingSpace = ' '
        cursor.curLine().insert(cursor, nonBreakingSpace)
    } else {
        cursor.curLine().insert(cursor, s)
    }

    cursor.setColumn(cursor.column() + col)
    cursor.clearSelection()

    this.triggerLayout()
}

TextBase.prototype.startEdit = function (this: TextBase, ed: EditData): void {
    const ted = new TextEditData(this)
    ted.e = this
    ted.cursor().startEdit()

    // C++ asserts: make sure we are not in a Cmd (!score()->undoStack()->hasActiveCommand())

    ted.oldXmlText = this.xmlText()
    ted.startUndoIdx = this.score().undoStack().currentIndex()

    const ldata = this.ldata()
    if (ldata.layoutInvalid) {
        textBaseRenderer.layoutItem(this)
    }

    //! NOTE: startMove will be null if we didn't use the mouse (e.g. we added a lyric with the spacebar)
    if (!ed.startMove.isNull() && !ted.cursor().set(ed.startMove)) {
        this.resetFormatting()
    }
    ed.addData(ted)
}

TextBase.prototype.endEdit = function (this: TextBase, ed: EditData): void {
    const ted = ed.getData(this) as TextEditData | null
    if (!ted || !ted.cursor()) {
        return
    }

    ted.cursor().endEdit()

    const undo = this.score().undoStack()

    const actualXmlText = this.xmlText()
    const actualPlainText = this.plainText()

    // replace all undo/redo records collected during text editing with
    // one property change

    //! NOTE: Current index can be less than the start index if the text element is newly added and immediately removed through
    //! undo (the "add element" command will have been popped from the stack before the calling of this method)...
    const textWasEdited = undo.currentIndex() > ted.startUndoIdx
    if (textWasEdited) {
        undo.mergeCommands(ted.startUndoIdx)
        undo.last()!.filterChildren(UndoCommandFilter.TextEdit, this)
    } else {
        // No text changes in "undo" part of undo stack,
        // hence nothing to merge and filter.
        undo.cleanRedoStack() // prevent text editing commands from remaining in undo stack

        // already removed, no further processing required...
        if (!ed.element) {
            return
        }
    }

    const newlyAdded = ted.oldXmlText.length === 0
    if (newlyAdded) {
        const ucmd = textWasEdited ? undo.prev() : undo.last()
        if (ucmd && ucmd.hasFilteredChildren(UndoCommandFilter.AddElement, this)) {
            // We have just added this element to a score.
            // Combine undo records of text creation with text editing.
            undo.mergeCommands(ted.startUndoIdx - 1)
        }
    }

    // TBox'es manage their Text themselves and are not removed if text is empty
    const removeTextIfEmpty = !(this.explicitParent() && this.explicitParent()!.isTBox())

    if (actualPlainText.length === 0 && removeTextIfEmpty) {
        // C++: LOGD("actual text is empty")

        // If this assertion fails, no undo command relevant to this text
        // resides on undo stack and reopen() would corrupt the previous
        // command. Text shouldn't happen to be empty in other cases though.
        // assert(newlyAdded || textWasEdited)

        undo.reopen()
        if (newlyAdded) {
            this.score().endCmd(true) // rollback the "add element" command
            ted.deleteText = true
        } else {
            this.score().undoRemoveElement(this)

            // TODO(port): lyrics: remove the partial dash before (findPrevPartialLyricsLineDash)

            this.commitText()
        }
        ed.element = null

        if (this.isLyrics()) {
            const prev = prevLyrics(this as unknown as Lyrics)
            if (prev) {
                prev.setNeedRemoveInvalidSegments()
                textBaseRenderer.layoutItem(prev)
            }
        }

        if (this.isHarmony() && this.explicitParent()!.isFretDiagram()) {
            this.score().select(this.explicitParent() as unknown as FretDiagram, SelectType.SINGLE)
        }

        return
    }

    if (textWasEdited) {
        this.setXmlText(ted.oldXmlText) // reset text to value before editing
        undo.reopen()
        this.resetFormatting()

        // change property to set text to actual value again - this also changes text of linked elements
        this.undoChangeProperty(Pid.TEXT, actualXmlText)

        if (this.isDynamic()) {
            this.undoChangeProperty(Pid.DYNAMIC_TYPE, actualXmlText)
        }

        textBaseRenderer.layoutText1(this)
    }

    this.triggerLayout() // force relayout even if text did not change

    if (this.isLyrics()) {
        // we must adjust previous lyrics before the call to commitText(), in order to make the adjustments
        // part of the same undo command. there is logic above that will skip this call if the text is empty
        (this as unknown as Lyrics).adjustPrevious()
    }

    this.commitText()
}

TextBase.prototype.commitText = function (this: TextBase): void {
    this.score().endCmd()
}

TextBase.prototype.insertSym = function (this: TextBase, ed: EditData, id: SymId): void {
    const cursor = this.cursorFromEditData(ed)

    this.deleteSelectedText(ed)
    const s = this.score().engravingFont().toString(id)
    cursor.format().setFontFamily('ScoreText')
    this.score().undo(new InsertText(cursor, s), ed)
}

TextBase.prototype.insertText = function (this: TextBase, ed: EditData, s: string): void {
    const cursor = this.cursorFromEditData(ed)
    this.score().undo(new InsertText(cursor, s), ed)
}

const ControlModifier = KeyboardModifier.ControlModifier
const ShiftModifier = KeyboardModifier.ShiftModifier
const AltModifier = KeyboardModifier.AltModifier
const KeypadModifier = KeyboardModifier.KeypadModifier
const K = KeyboardKey

TextBase.prototype.isEditAllowed = function (this: TextBase, ed: EditData): boolean {
    // Keep this method closely in sync with TextBase::edit()!

    if (ed.key === K.Key_Shift || ed.key === K.Key_Escape || ed.key === K.Key_Tab) {
        return false
    }

    const ctrlPressed = (ed.modifiers & ControlModifier) !== 0
    const shiftPressed = (ed.modifiers & ShiftModifier) !== 0
    const altPressed = (ed.modifiers & AltModifier) !== 0

    // Hex
    if (ed.modifiers === (ControlModifier | ShiftModifier | KeypadModifier)) {
        if (ed.key >= K.Key_0 && ed.key <= K.Key_9) {
            return true
        }
    } else if (ed.modifiers === (ControlModifier | ShiftModifier)) {
        if (ed.key >= K.Key_A && ed.key <= K.Key_F) {
            return true
        }
    }

    switch (ed.key) {
    // Basic editing / navigation
    case K.Key_Enter:
    case K.Key_Return:
    case K.Key_Delete:
    case K.Key_Backspace:
    case K.Key_Left:
    case K.Key_Right:
    case K.Key_Up:
    case K.Key_Down:
    case K.Key_Home:
    case K.Key_End:
    case K.Key_Space:
    case K.Key_Minus:
    case K.Key_Underscore:
        return true
    // Select all is handled by us
    case K.Key_A:
        if (ctrlPressed && !shiftPressed) {
            return true
        }
        break
    // Several commands
    // TODO: looks like we're hard-coding keyboard shortcuts here, but what if user has edited those?
    case K.Key_B:
    case K.Key_C:
    case K.Key_I:
    case K.Key_U:
    case K.Key_V:
    case K.Key_X:
    case K.Key_Y:
    case K.Key_Z:
        if (ctrlPressed && !shiftPressed) {
            return false // handled at application level
        }
        break
    default:
        break
    }

    // Insert special characters
    if (ctrlPressed && shiftPressed) {
        switch (ed.key) {
        case K.Key_U:
        case K.Key_B:
        case K.Key_NumberSign: // e.g. QWERTY (US)
        case K.Key_AsciiTilde: // e.g. QWERTY (GB)
        case K.Key_Apostrophe: // e.g. QWERTZ (DE)
        case K.Key_periodcentered: // e.g. QWERTY (ES)
        case K.Key_3: // e.g. AZERTY (FR, BE)
        case K.Key_H:
        case K.Key_Space:
        case K.Key_F:
        case K.Key_M:
        case K.Key_N:
        case K.Key_P:
        case K.Key_S:
        case K.Key_R:
        case K.Key_Z:
            return true
        }
    }
    if (ctrlPressed && altPressed) {
        if (ed.key === K.Key_Minus) {
            return true
        }
        // C++ (Q_OS_WIN): special characters typed with AltGr / Ctrl+Alt
        if (ed.s.length && (ed.key < K.Key_A || ed.key > K.Key_Z) && (ed.key < K.Key_0 || ed.key > K.Key_9)) {
            return true
        }
    }

    // At least on non-macOS, sometimes ed.s is not empty even if Ctrl is pressed
    return !ctrlPressed && ed.s.length > 0
}

TextBase.prototype.edit = function (this: TextBase, ed: EditData): boolean {
    // Keep this method closely in sync with TextBase::isEditAllowed()!

    if (!this.isEditAllowed(ed)) {
        return false
    }

    const ted = ed.getData(this) as TextEditData | null
    if (!ted) {
        return false
    }
    const cursor = ted.cursor()
    const currentFormat = cursor.format()

    let s = ed.s
    const ctrlPressed = (ed.modifiers & ControlModifier) !== 0
    const shiftPressed = (ed.modifiers & ShiftModifier) !== 0
    const altPressed = (ed.modifiers & AltModifier) !== 0

    const mm = shiftPressed ? TextCursorMoveMode.KeepAnchor : TextCursorMoveMode.MoveAnchor

    let wasHex = false
    if (this.m_hexState >= 0) {
        if (ed.modifiers === (ControlModifier | ShiftModifier | KeypadModifier)) {
            if (ed.key >= K.Key_0 && ed.key <= K.Key_9) {
                s = String.fromCharCode(ed.key)
                ++this.m_hexState
                wasHex = true
            }
        } else if (ed.modifiers === (ControlModifier | ShiftModifier)) {
            if (ed.key >= K.Key_A && ed.key <= K.Key_F) {
                s = String.fromCharCode(ed.key)
                ++this.m_hexState
                wasHex = true
            }
        }
    }

    if (!wasHex) {
        switch (ed.key) {
        case K.Key_Enter:
        case K.Key_Return:
            this.deleteSelectedText(ed)
            this.score().undo(new SplitText(cursor), ed)
            return true

        case K.Key_Delete: {
            if (ctrlPressed) {
                // delete next word
                cursor.movePosition(TextCursorMoveOperation.NextWord, TextCursorMoveMode.KeepAnchor)
                s = ''
                this.deleteSelectedText(ed)
            } else {
                if (!this.deleteSelectedText(ed)) {
                    // if you are on the end of the line, delete the newline char
                    if (cursor.column() === cursor.columns()) {
                        const cursorRow = cursor.row()
                        cursor.movePosition(TextCursorMoveOperation.Down)
                        if (cursor.row() !== cursorRow) {
                            cursor.movePosition(TextCursorMoveOperation.StartOfLine)
                            this.score().undo(new JoinText(cursor), ed)
                        }
                    } else {
                        this.score().undo(new RemoveText(cursor, cursor.currentCharacter()), ed)
                    }
                }
            }
            return true
        }

        case K.Key_Backspace: {
            if (ctrlPressed) {
                // delete last word
                cursor.movePosition(TextCursorMoveOperation.WordLeft, TextCursorMoveMode.KeepAnchor)
                s = ''
                this.deleteSelectedText(ed)
            } else {
                if (!this.deleteSelectedText(ed)) {
                    if (cursor.column() === 0 && this.cursor().row() !== 0) {
                        this.score().undo(new JoinText(cursor), ed)
                    } else {
                        if (!cursor.movePosition(TextCursorMoveOperation.Left)) {
                            return false
                        }
                        this.score().undo(new RemoveText(cursor, cursor.currentCharacter()), ed)
                    }
                }
            }
            return true
        }

        case K.Key_Left:
            if (!this.cursor().movePosition(ctrlPressed ? TextCursorMoveOperation.WordLeft : TextCursorMoveOperation.Left, mm)
                && this.isLyrics()) {
                return false
            }
            s = ''
            break

        case K.Key_Right:
            if (!this.cursor().movePosition(ctrlPressed ? TextCursorMoveOperation.NextWord : TextCursorMoveOperation.Right, mm)
                && this.isLyrics()) {
                return false
            }
            s = ''
            break

        case K.Key_Up:
            // C++ (Q_OS_MAC): Up moves to the start of the line when there is no line above
            if (!cursor.movePosition(TextCursorMoveOperation.Up, mm) && isMac()) {
                cursor.movePosition(TextCursorMoveOperation.StartOfLine, mm)
            }
            s = ''
            break

        case K.Key_Down:
            if (!cursor.movePosition(TextCursorMoveOperation.Down, mm) && isMac()) {
                cursor.movePosition(TextCursorMoveOperation.EndOfLine, mm)
            }
            s = ''
            break

        case K.Key_Home:
            if (ctrlPressed) {
                cursor.movePosition(TextCursorMoveOperation.Start, mm)
            } else {
                cursor.movePosition(TextCursorMoveOperation.StartOfLine, mm)
            }
            s = ''
            break

        case K.Key_End:
            if (ctrlPressed) {
                cursor.movePosition(TextCursorMoveOperation.End, mm)
            } else {
                cursor.movePosition(TextCursorMoveOperation.EndOfLine, mm)
            }
            s = ''
            break

        case K.Key_Space:
            if ((ed.modifiers & TextEditingControlModifier) || currentFormat.fontFamily() === 'ScoreText') {
                s = ' ' // non-breaking space
            } else {
                // TODO(port): fingering: ed.view()->textTab (the space moves to the next note)
                s = ' '
            }
            ed.modifiers = 0
            break

        case K.Key_Minus:
            if (ed.modifiers === 0) {
                s = '-'
            }
            break

        case K.Key_Underscore:
            if (ed.modifiers === 0) {
                s = '_'
            }
            break

        case K.Key_A:
            if (ctrlPressed && !shiftPressed) {
                cursor.movePosition(TextCursorMoveOperation.Start, TextCursorMoveMode.MoveAnchor)
                cursor.movePosition(TextCursorMoveOperation.End, TextCursorMoveMode.KeepAnchor)
                s = ''
            }
            break
        case K.Key_B:
        case K.Key_C:
        case K.Key_I:
        case K.Key_U:
        case K.Key_V:
        case K.Key_X:
        case K.Key_Y:
        case K.Key_Z:
            if (ctrlPressed && !shiftPressed) {
                return false // handled at application level
            }
            break
        default:
            break
        }
        if (ctrlPressed && shiftPressed) {
            switch (ed.key) {
            case K.Key_U:
                if (this.m_hexState === -1) {
                    this.m_hexState = 0
                    s = 'u'
                }
                break
            case K.Key_B:
                s = '♭' // Unicode flat
                break
            case K.Key_NumberSign: // e.g. QWERTY (US)
            case K.Key_AsciiTilde: // e.g. QWERTY (GB)
            case K.Key_Apostrophe: // e.g. QWERTZ (DE)
            case K.Key_periodcentered: // e.g. QWERTY (ES)
            case K.Key_3: // e.g. AZERTY (FR, BE)
                s = '♯' // Unicode sharp
                break
            case K.Key_H:
                s = '♮' // Unicode natural
                break
            case K.Key_Space:
                this.insertSym(ed, SymId.space)
                return true
            case K.Key_F:
                this.insertSym(ed, SymId.dynamicForte)
                return true
            case K.Key_M:
                this.insertSym(ed, SymId.dynamicMezzo)
                return true
            case K.Key_N:
                this.insertSym(ed, SymId.dynamicNiente)
                return true
            case K.Key_P:
                this.insertSym(ed, SymId.dynamicPiano)
                return true
            case K.Key_S:
                this.insertSym(ed, SymId.dynamicSforzando)
                return true
            case K.Key_R:
                this.insertSym(ed, SymId.dynamicRinforzando)
                return true
            case K.Key_Z:
                // Ctrl+Z is normally "undo"
                // but this code gets hit even if you are also holding Shift
                // so Shift+Ctrl+Z works
                this.insertSym(ed, SymId.dynamicZ)
                return true
            }
        }
        if (ctrlPressed && altPressed) {
            if (ed.key === K.Key_Minus || ed.key === K.Key_Underscore) {
                this.insertSym(ed, SymId.lyricsElision)
                return true
            }
        }
    }
    if (s.length) {
        this.deleteSelectedText(ed)
        if (currentFormat.fontFamily() === 'ScoreText') {
            currentFormat.setFontFamily(this.propertyDefault(Pid.FONT_FACE) as string)
        }
        this.score().undo(new InsertText(this.cursor(), s), ed)
    }
    return true
}

TextBase.prototype.movePosition = function (this: TextBase, ed: EditData, op: TextCursorMoveOperation): void {
    const cursor = this.cursorFromEditData(ed)
    cursor.movePosition(op)
}

TextBase.prototype.drop = function (this: TextBase, ed: EditData): EngravingItem | null {
    const e = ed.dropElement!

    if (e.isSymbol()) {
        const id = (e as unknown as Symbol).sym()
        this.insertSym(ed, id)
    } else {
        // TODO(port): FSYMBOL (font symbols); C++: LOGD("drop <%s> not handled", e->typeName())
    }
    return null
}

TextBase.prototype.paste = function (this: TextBase, ed: EditData, txt: string): void {
    let state = 0
    let token = ''
    let sym = ''
    let symState = false
    const format = this.cursorFromEditData(ed).format().clone()

    this.score().startCmd(new TranslatableString('undoableAction', 'Paste text'))
    for (let i = 0; i < txt.length; i++) {
        const c = txt[i]
        if (state === 0) {
            if (c === '<') {
                state = 1
                token = ''
            } else if (c === '&') {
                state = 2
                token = ''
            } else {
                if (symState) {
                    sym += c
                } else {
                    this.deleteSelectedText(ed)
                    this.cursorFromEditData(ed).setFormatObj(format)
                    const code = c.charCodeAt(0)
                    if (code >= 0xD800 && code <= 0xDBFF && i + 1 < txt.length) {
                        i++
                        this.insertText(ed, c + txt[i])
                    } else {
                        this.insertText(ed, c)
                    }
                }
            }
        } else if (state === 1) {
            if (c === '>') {
                state = 0
                if (token === 'sym') {
                    symState = true
                    sym = ''
                } else if (token === '/sym') {
                    symState = false
                    this.cursorFromEditData(ed).setFormatObj(format)
                    this.insertSym(ed, SymNames.symIdByName(sym))
                } else {
                    this.prepareFormat(token, format)
                }
            } else {
                token += c
            }
        } else if (state === 2) {
            if (c === ';') {
                state = 0
                if (token === 'lt') {
                    this.insertText(ed, '<')
                } else if (token === 'gt') {
                    this.insertText(ed, '>')
                } else if (token === 'amp') {
                    this.insertText(ed, '&')
                } else if (token === 'quot') {
                    this.insertText(ed, '"')
                } else {
                    this.insertSym(ed, SymNames.symIdByName(token))
                }
            } else if (!/\p{L}/u.test(c)) {
                state = 0
                this.insertText(ed, '&')
                this.insertText(ed, token)
                this.insertText(ed, c)
            } else {
                token += c
            }
        }
    }
    if (state === 2) {
        this.insertText(ed, '&')
        this.insertText(ed, token)
    }
    this.score().endCmd()
}

TextBase.prototype.endHexState = function (this: TextBase, ed: EditData): void {
    const cursor = this.cursorFromEditData(ed)

    if (this.m_hexState >= 0) {
        if (this.m_hexState > 0) {
            const c2 = cursor.column()
            const c1 = c2 - (this.m_hexState + 1)

            const t = this.mutldata().blocks[cursor.row()]
            const ss = t.removeRange(c1, this.m_hexState + 1, cursor)
            const code = parseInt(ss.substring(1), 16)
            cursor.setColumn(c1)
            cursor.clearSelection()
            if (!isNaN(code)) {
                this.editInsertText(cursor, String.fromCodePoint(code))
            }
        }
        this.m_hexState = -1
    }
}

TextBase.prototype.deleteSelectedText = function (this: TextBase, ed: EditData): boolean {
    const cursor = this.cursorFromEditData(ed)

    if (!cursor.hasSelection()) {
        return false
    }

    let r1 = cursor.selectLine()
    let c1 = cursor.selectColumn()

    if (r1 > cursor.row() || (r1 === cursor.row() && c1 > cursor.column())) {
        // swap start end of selection
        r1 = cursor.row()
        c1 = cursor.column()
        cursor.setRow(this.cursor().selectLine())
        cursor.setColumn(cursor.selectColumn())
    }

    cursor.clearSelection()
    for (;;) {
        if (r1 === cursor.row() && c1 === cursor.column()) {
            break
        }
        if (cursor.column() === 0 && cursor.row() !== 0) {
            this.score().undo(new JoinText(cursor), ed)
        } else {
            // move cursor left:
            if (!this.cursor().movePosition(TextCursorMoveOperation.Left)) {
                break
            }
            const undoCursor = this.cursor().clone()
            this.score().undo(new RemoveText(undoCursor, this.cursor().currentCharacter()), ed)
        }
    }
    return true
}

function isMac(): boolean {
    return TextEditingControlModifier === KeyboardModifier.AltModifier
}
