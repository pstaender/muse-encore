/*
 * SPDX-License-Identifier: GPL-3.0-only
 * MuseEncore — port of MuseScore Studio (https://github.com/musescore/MuseScore)
 * Copyright (C) 2021-2026 MuseScore Limited and others
 *
 * Port of the logic of src/notationscene/widgets/selectdialog.cpp and selectnotedialog.cpp: "Select > More…" of the
 * context menu (action "select-dialog", NotationActionController::openSelectionMoreOptions) for the context item.
 * The app's dialog shows the labels and the check boxes (values) and calls apply() on OK.
 * TODO(port): WidgetStateStore (the dialogs' geometry)
 */

import { Fraction } from '../engraving/types/fraction'
import { SelectType } from '../engraving/dom/select'
import { NoteCaseType, tpc2name } from '../engraving/dom/pitchspelling'
import { NoteSpellingType } from '../engraving/types/types'
import { TConv } from '../engraving/types/typesconv'
import { FilterElementsOptions, FilterNotesOptions } from '../notation/notationtypes'
import { NotationElements } from '../notation/internal/notationelements'
import { arg, qtrc } from '../framework/global/translation'
import type { EngravingItem } from '../engraving/dom/engravingitem'
import type { Note } from '../engraving/dom/note'
import type { Rest } from '../engraving/dom/rest'
import type { SpannerSegment } from '../engraving/dom/spanner'
import type { System } from '../engraving/dom/system'
import type { NotationInteraction } from '../notation/internal/notationinteraction'

/** the radio buttons of the "Action" group ("Search in selection" is hidden in MuseScore) */
export type SelectDialogAction = 'replace' | 'add' | 'subtract' | 'fromSelection'

export interface SelectDialogValues {
    sameSubtype: boolean
    sameStaff: boolean
    sameVoice: boolean
    sameDuration: boolean
    sameBeat: boolean
    sameMeasure: boolean
    sameSystem: boolean
    inSelection: boolean
    action: SelectDialogAction
}

export interface SelectNoteDialogValues {
    sameNotehead: boolean
    samePitch: boolean
    sameString: boolean
    sameType: boolean
    sameDurationType: boolean
    sameDurationTicks: boolean
    sameName: boolean
    sameStaff: boolean
    inSelection: boolean
    sameVoice: boolean
    sameSystem: boolean
    sameBeat: boolean
    sameMeasure: boolean
    action: SelectDialogAction
}

/** the common part of SelectDialog::apply and SelectNoteDialog::apply */
function applySelection(interaction: NotationInteraction, options: FilterElementsOptions, isInSelection: boolean,
    action: SelectDialogAction): void {
    const notationElements = new NotationElements(interaction.score())

    const selectedElement = interaction.contextItem()
    if (!selectedElement) {
        return
    }

    let elements = notationElements.elements(options)
    if (elements.length === 0) {
        return
    }
    if (isInSelection) {
        const selectedElements = interaction.score().selection().elements()
        elements = elements.filter(e => selectedElements.includes(e))
    }

    if (action === 'replace') {
        interaction.clearSelection()
        interaction.select(elements, SelectType.ADD)
    } else if (action === 'subtract') {
        const selectionElements = interaction.score().selection().elements().filter(e => !elements.includes(e))

        interaction.clearSelection()
        interaction.select(selectionElements, SelectType.ADD)
    } else if (action === 'add') {
        const selectionElements = interaction.score().selection().elements()
        elements.push(...selectionElements)
        interaction.select(elements, SelectType.ADD)
    }
}

export class SelectDialog {
    private m_element: EngravingItem | null

    /** the labels */
    readonly type: string = ''
    readonly subtype: string = ''
    /** the enabled state of the check boxes and the subtype label */
    readonly sameSubtypeEnabled: boolean = false
    readonly subtypeEnabled: boolean = false
    readonly inSelectionEnabled: boolean = false
    readonly sameDurationEnabled: boolean = false

    values: SelectDialogValues = {
        sameSubtype: false, sameStaff: false, sameVoice: false, sameDuration: false, sameBeat: false,
        sameMeasure: false, sameSystem: false, inSelection: false, action: 'replace',
    }

    constructor(private m_interaction: NotationInteraction) {
        this.m_element = m_interaction.contextItem()
        const element = this.m_element
        if (!element) {
            return
        }

        this.type = element.translatedTypeUserName()
        this.subtype = element.translatedSubtypeUserName()

        this.sameSubtypeEnabled = element.subtype() !== -1
        if (element.isHairpinSegment() || element.isHarmony()) {
            this.values.sameSubtype = true
        }
        this.subtypeEnabled = element.subtype() !== -1

        const isSingleSelection = element.score().selection().isSingle()
        this.values.inSelection = !isSingleSelection
        this.inSelectionEnabled = !isSingleSelection

        this.sameDurationEnabled = element.isRest()
    }

    isValid(): boolean { return this.m_element !== null }

    element(): EngravingItem | null { return this.m_element }

    elementOptions(): FilterElementsOptions {
        const element = this.m_element!
        const v = this.values
        const options = new FilterElementsOptions()
        options.elementType = element.type()
        options.subtype = element.subtype()

        if (v.sameStaff) {
            options.staffStart = element.staffIdx()
            options.staffEnd = element.staffIdx() + 1
        } else if (v.inSelection) {
            options.staffStart = element.score().selection().staffStart()
            options.staffEnd = element.score().selection().staffEnd()
        } else {
            options.staffStart = -1
            options.staffEnd = -1
        }

        if (v.sameDuration && element.isRest()) {
            const rest = element as unknown as Rest
            options.durationTicks = rest.actualTicks()
        } else {
            options.durationTicks = new Fraction(-1, 1)
        }

        if (v.sameBeat) {
            options.beat = element.beat()
        } else {
            options.beat = new Fraction(0, 0)
        }

        if (v.sameMeasure) {
            let m = element.findMeasure()
            if (!m && element.isSpannerSegment()) {
                const s = (element as unknown as SpannerSegment).spanner()
                const se = s ? s.startElement() : null
                const mse = se ? se.findMeasure() : null
                if (mse) {
                    m = mse
                }
            }
            options.measure = m
        } else {
            options.measure = null
        }

        options.voice = v.sameVoice ? element.voice() : -1
        options.bySubtype = v.sameSubtype

        if (v.sameSystem) {
            options.system = this.elementSystem(element)
        }

        return options
    }

    private elementSystem(element: EngravingItem): System | null {
        let e: EngravingItem | null = element
        do {
            if (e.isSystem()) {
                return e as unknown as System
            }
            e = e.parentItem()
        } while (e)

        return null
    }

    apply(): void {
        if (!this.m_element) {
            return
        }
        applySelection(this.m_interaction, this.elementOptions(), this.values.inSelection, this.values.action)
    }
}

export class SelectNoteDialog {
    private m_note: Note | null = null

    /** the labels */
    readonly notehead: string = ''
    readonly pitch: string = ''
    readonly string: string = ''
    readonly type: string = ''
    readonly durationType: string = ''
    readonly durationTicks: string = ''
    readonly name: string = ''
    readonly inSelectionEnabled: boolean = false

    values: SelectNoteDialogValues = {
        sameNotehead: false, samePitch: false, sameString: false, sameType: false, sameDurationType: false,
        sameDurationTicks: false, sameName: false, sameStaff: false, inSelection: false, sameVoice: false,
        sameSystem: false, sameBeat: false, sameMeasure: false, action: 'replace',
    }

    constructor(private m_interaction: NotationInteraction) {
        const item = m_interaction.contextItem()
        if (!item || !item.isNote()) {
            return
        }
        const note = item as unknown as Note
        this.m_note = note

        this.notehead = TConv.userNameNoteHeadGroup(note.headGroup()).translated()
        this.pitch = note.tpcUserName(false)
        this.string = String(note.string() + 1)
        this.type = note.noteTypeUserName()

        //: %1 is a note duration. If your language does not have different terms for
        //: "quarter note" and "quarter" (for example), or if the translations for the
        //: durations as separate strings are not suitable to be used as adjectives here,
        //: translate this string with "%1", so that just the duration will be shown.
        this.durationType = arg(qtrc('notation', '%1 note'), TConv.translatedUserNameDurationType(note.chord().durationType().type()))

        this.durationTicks = note.chord().durationUserName()

        this.name = tpc2name(note.tpc(), NoteSpellingType.STANDARD, NoteCaseType.AUTO, false)

        const isSingleSelection = note.score().selection().isSingle()
        this.values.inSelection = !isSingleSelection
        this.inSelectionEnabled = !isSingleSelection
    }

    isValid(): boolean { return this.m_note !== null }

    noteOptions(): FilterNotesOptions {
        const note = this.m_note!
        const v = this.values
        const options = new FilterNotesOptions()
        options.elementType = note.type()
        if (v.sameNotehead) {
            options.notehead = note.headGroup()
        }
        if (v.samePitch) {
            options.pitch = note.pitch()
        }
        if (v.sameString) {
            options.string = note.string()
        }
        if (v.sameName) {
            options.tpc = note.tpc()
        }
        if (v.sameType) {
            options.noteType = note.noteType()
        }
        if (v.sameDurationType) {
            options.durationType = note.chord().actualDurationType()
        }

        if (v.sameDurationTicks) {
            options.durationTicks = note.chord().actualTicks()
        } else {
            options.durationTicks = new Fraction(-1, 1)
        }

        if (v.sameBeat) {
            options.beat = note.beat()
        } else {
            options.beat = new Fraction(0, 0)
        }

        if (v.sameMeasure) {
            options.measure = note.findMeasure()
        } else {
            options.measure = null
        }

        if (v.sameStaff) {
            options.staffStart = note.staffIdx()
            options.staffEnd = note.staffIdx() + 1
        } else if (v.inSelection) {
            options.staffStart = note.score().selection().staffStart()
            options.staffEnd = note.score().selection().staffEnd()
        } else {
            options.staffStart = -1
            options.staffEnd = -1
        }

        options.voice = v.sameVoice ? note.voice() : -1
        options.system = null
        if (v.sameSystem) {
            options.system = note.chord().segment()!.system()
        }

        return options
    }

    apply(): void {
        if (!this.m_note) {
            return
        }
        applySelection(this.m_interaction, this.noteOptions(), this.values.inSelection, this.values.action)
    }
}
