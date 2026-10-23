/*
 * SPDX-License-Identifier: GPL-3.0-only
 * MuseScore-Web — port of MuseScore Studio (https://github.com/musescore/MuseScore)
 * Copyright (C) 2021-2026 MuseScore Limited and others
 *
 * Port of src/notationscene/qml/MuseScore/NotationScene/notationcontextmenumodel.h/.cpp: the items of the score's
 * context menu for the element type of the selection (NotationViewInputController::selectionType). The items are
 * action codes with an optional title (MuseScore's TranslatableString: [context, source]); the app shows them.
 */

import { ElementType } from '../engraving/types/types'
import { LayoutMode } from '../engraving/dom/score'
import type { EngravingItem } from '../engraving/dom/engravingitem'
import type { FretDiagram } from '../engraving/dom/fret'
import type { GradualTempoChangeSegment } from '../engraving/dom/gradualtempochange'
import type { Harmony } from '../engraving/dom/harmony'
import type { HairpinSegment } from '../engraving/dom/hairpin'
import type { NotationInteraction } from '../notation/internal/notationinteraction'
import { EditStyleUtils } from './editstyleutils'

/** [context, source text] of a translatable title */
export type ContextMenuTitle = readonly [string, string]

export type ContextMenuItem =
    | { kind: 'action'; code: string; title?: ContextMenuTitle; checked?: boolean; args?: string[] }
    | { kind: 'menu'; title: ContextMenuTitle; items: ContextMenuItem[] }
    | { kind: 'separator' }

const makeMenuItem = (code: string, title?: ContextMenuTitle): ContextMenuItem => ({ kind: 'action', code, title })
const makeMenu = (title: ContextMenuTitle, items: ContextMenuItem[]): ContextMenuItem => ({ kind: 'menu', title, items })
const makeSeparator = (): ContextMenuItem => ({ kind: 'separator' })

export class NotationContextMenuModel {
    constructor(private m_interaction: NotationInteraction) {}

    /** NotationViewInputController::selectionType(): the element type the context menu is for */
    selectionType(): ElementType {
        const selection = this.m_interaction.score().selection()

        const hitElement = this.m_interaction.hitElementContext().element
        if (hitElement) {
            return hitElement.type()
        } else if (selection.isRange()) {
            return ElementType.MEASURE
        } else if (selection.element()) {
            return selection.element()!.type()
        }

        return ElementType.PAGE
    }

    loadItems(elementType: ElementType = this.selectionType()): ContextMenuItem[] {
        return this.makeItemsByElementType(elementType)
    }

    private makeItemsByElementType(elementType: ElementType): ContextMenuItem[] {
        switch (elementType) {
        case ElementType.MEASURE:
            return this.makeMeasureItems()
        case ElementType.PAGE:
            return this.makePageItems()
        case ElementType.STAFF_TEXT:
            return this.makeStaffTextItems()
        case ElementType.SYSTEM_TEXT:
        case ElementType.TRIPLET_FEEL:
            return this.makeSystemTextItems()
        case ElementType.TIMESIG:
            return this.makeTimeSignatureItems()
        case ElementType.INSTRUMENT_NAME:
            return this.makeInstrumentNameItems()
        case ElementType.HARMONY:
            return this.makeHarmonyItems()
        case ElementType.FRET_DIAGRAM:
            return this.makeFretboardDiagramItems()
        case ElementType.INSTRUMENT_CHANGE:
            return this.makeChangeInstrumentItems()
        case ElementType.VBOX:
            return this.makeVerticalBoxItems()
        case ElementType.HBOX:
            return this.makeHorizontalBoxItems()
        case ElementType.HAIRPIN_SEGMENT:
            return this.makeHairpinItems()
        case ElementType.GRADUAL_TEMPO_CHANGE_SEGMENT:
            return this.makeGradualTempoChangeItems()
        case ElementType.TEXT:
            return this.makeTextItems()
        default:
            break
        }

        return this.makeElementItems()
    }

    private makePageItems(): ContextMenuItem[] {
        return [
            makeMenuItem('edit-style'),
            makeMenuItem('page-settings'),
            makeMenuItem('load-style'),
        ]
    }

    private makeDefaultCopyPasteItems(): ContextMenuItem[] {
        return [
            makeMenuItem('action://notation/cut'),
            makeMenuItem('action://notation/copy'),
            makeMenuItem('action://notation/paste'),
            makeMenuItem('notation-swap'),
            makeMenuItem('action://notation/delete'),
        ]
    }

    private makeMeasureItems(): ContextMenuItem[] {
        const items: ContextMenuItem[] = [
            makeMenuItem('action://notation/cut'),
            makeMenuItem('action://notation/copy'),
            makeMenuItem('action://notation/paste'),
            makeMenuItem('notation-swap'),
        ]

        items.push(makeSeparator())

        items.push(makeMenuItem('action://notation/delete', ['notation', 'Clear measures']))
        items.push(makeMenuItem('time-delete', ['notation', 'Delete measures']))

        items.push(makeSeparator())

        if (this.isDrumsetStaff()) {
            items.push(makeMenuItem('customize-kit'))
        }

        items.push(makeMenuItem('staff-properties'))
        items.push(makeSeparator())
        items.push(makeMenu(['notation', 'Insert measures'], this.makeInsertMeasuresItems()))
        if (this.m_interaction.score().layoutMode() === LayoutMode.PAGE) {
            items.push(makeMenu(['notation', 'Move measures'], this.makeMoveMeasureItems()))
        }
        items.push(makeMenuItem('make-into-system', ['notation', 'Create system from selection']))
        items.push(makeSeparator())
        items.push(makeMenuItem('measure-properties'))

        return items
    }

    private makeStaffTextItems(): ContextMenuItem[] {
        return [...this.makeElementItems(), makeSeparator(), makeMenuItem('staff-text-properties')]
    }

    private makeSystemTextItems(): ContextMenuItem[] {
        return [...this.makeElementItems(), makeSeparator(), makeMenuItem('system-text-properties')]
    }

    private makeTimeSignatureItems(): ContextMenuItem[] {
        return [...this.makeElementItems(), makeSeparator(), makeMenuItem('time-signature-properties')]
    }

    private makeInstrumentNameItems(): ContextMenuItem[] {
        return [...this.makeElementItems(), makeSeparator(), makeMenuItem('staff-properties')]
    }

    private makeHarmonyItems(): ContextMenuItem[] {
        const element = this.currentElement()
        if (element && (element as Harmony).isInFretBox()) {
            return this.makeElementInFretBoxItems()
        }

        const items = this.makeElementItems()
        items.push(makeSeparator())

        if (element) {
            const parent = element.isHarmony() ? element.explicitParent() : null
            const hasLinkedFretboardDiagram = !!parent && parent.isFretDiagram()
            if (!hasLinkedFretboardDiagram) {
                items.push(makeMenuItem('add-fretboard-diagram'))
            }
        }

        items.push(makeMenuItem('realize-chord-symbols'))

        return items
    }

    private makeFretboardDiagramItems(): ContextMenuItem[] {
        const element = this.currentElement()
        if (element && (element as FretDiagram).isInFretBox()) {
            return this.makeElementInFretBoxItems()
        }

        const items = this.makeElementItems()

        const fretDiagram = element as FretDiagram | null
        if (fretDiagram && !fretDiagram.harmony()) {
            items.push(makeSeparator())
            items.push(makeMenuItem('chord-text', ['notation', 'Add c&hord symbol']))
        }

        return items
    }

    private makeElementInFretBoxItems(): ContextMenuItem[] {
        const items: ContextMenuItem[] = [makeMenuItem('action://notation/copy')]

        // C++: the action without its icon
        items.push(makeMenuItem('action://notation/delete', ['notation', 'Hide']))
        items.push(makeSeparator())

        const selectItems = this.makeSelectItems()

        if (selectItems.length) {
            items.push(makeMenu(['notation', 'Select'], selectItems))
            items.push(makeSeparator())
        }

        items.push(this.makeEditStyle())

        return items
    }

    private makeSelectItems(): ContextMenuItem[] {
        if (this.isSingleSelection()) {
            return [makeMenuItem('select-similar'), makeMenuItem('select-similar-staff'), makeMenuItem('select-dialog')]
        } else if (this.canSelectSimilarInRange()) {
            return [makeMenuItem('select-similar-range'), makeMenuItem('select-dialog')]
        } else if (this.canSelectSimilar()) {
            return [makeMenuItem('select-dialog')]
        }

        return []
    }

    private makeElementItems(): ContextMenuItem[] {
        const items = this.makeDefaultCopyPasteItems()

        if (this.m_interaction.isTextEditingStarted()) {
            return items
        }

        const selectItems = this.makeSelectItems()

        if (selectItems.length) {
            items.push(makeMenu(['notation', 'Select'], selectItems))
        }

        const element = this.currentElement()

        if (element && element.isEditable()) {
            items.push(makeSeparator())
            items.push(makeMenuItem('edit-element'))
        }

        items.push(makeSeparator())
        items.push(this.makeEditStyle())

        return items
    }

    private makeInsertMeasuresItems(): ContextMenuItem[] {
        return [
            makeMenuItem('insert-measures-after-selection', ['notation', 'After selection…']),
            makeMenuItem('insert-measures', ['notation', 'Before selection…']),
            makeSeparator(),
            makeMenuItem('insert-measures-at-start-of-score', ['notation', 'At start of score…']),
            makeMenuItem('append-measures', ['notation', 'At end of score…']),
        ]
    }

    private makeMoveMeasureItems(): ContextMenuItem[] {
        return [
            makeMenuItem('move-measure-to-prev-system', ['notation', 'To previous system']),
            makeMenuItem('move-measure-to-next-system', ['notation', 'To next system']),
        ]
    }

    private makeChangeInstrumentItems(): ContextMenuItem[] {
        return [...this.makeElementItems(), makeSeparator(), makeMenuItem('change-instrument')]
    }

    private makeVerticalBoxItems(): ContextMenuItem[] {
        const addMenuItems = [
            makeMenuItem('frame-text'),
            makeMenuItem('title-text'),
            makeMenuItem('subtitle-text'),
            makeMenuItem('composer-text'),
            makeMenuItem('poet-text'),
            makeMenuItem('part-text'),
            makeMenuItem('add-image'),
        ]

        return [...this.makeElementItems(), makeSeparator(), makeMenu(['notation', 'Add'], addMenuItems)]
    }

    private makeHorizontalBoxItems(): ContextMenuItem[] {
        const addMenuItems = [makeMenuItem('frame-text'), makeMenuItem('add-image')]

        return [...this.makeElementItems(), makeSeparator(), makeMenu(['notation', 'Add'], addMenuItems)]
    }

    private makeHairpinItems(): ContextMenuItem[] {
        const items = this.makeElementItems()

        const element = this.currentElement()
        if (!element || !element.isHairpinSegment() || !this.isSingleSelection()) {
            return items
        }

        items.push(makeSeparator())

        const h = (element as unknown as HairpinSegment).hairpin()
        items.push({ kind: 'action', code: 'toggle-snap-to-previous', checked: h.snapToItemBefore() })
        items.push({ kind: 'action', code: 'toggle-snap-to-next', checked: h.snapToItemAfter() })

        return items
    }

    private makeGradualTempoChangeItems(): ContextMenuItem[] {
        const items = this.makeElementItems()

        const element = this.currentElement()
        if (!element || !element.isGradualTempoChangeSegment() || !this.isSingleSelection()) {
            return items
        }

        items.push(makeSeparator())

        const gtc = (element as unknown as GradualTempoChangeSegment).tempoChange()
        items.push({ kind: 'action', code: 'toggle-snap-to-next', checked: gtc.snapToItemAfter() })

        return items
    }

    private makeTextItems(): ContextMenuItem[] {
        const element = this.currentElement()
        if (!(element && element.parentItem() && element.parentItem()!.isBarLine())) {
            // Regular text
            return this.makeElementItems()
        }

        // Play count text
        const items: ContextMenuItem[] = []

        if (this.m_interaction.isTextEditingStarted()) {
            return items
        }

        const selectItems = this.makeSelectItems()

        if (selectItems.length) {
            items.push(makeMenu(['notation', 'Select'], selectItems))
        }

        items.push(makeSeparator())
        items.push(this.makeEditStyle())

        return items
    }

    /** "Style…" with the page (and text style sub page) of the element as the action's arguments */
    private makeEditStyle(): ContextMenuItem {
        const item = makeMenuItem('edit-style')

        const element = this.m_interaction.score().selection().element()
        if (element && item.kind === 'action') {
            const pageCode = EditStyleUtils.pageCodeForElement(element)

            if (pageCode) {
                const subPageCode = EditStyleUtils.subPageCodeForElement(element)
                item.args = subPageCode ? [pageCode, subPageCode] : [pageCode]
            }
        }

        return item
    }

    private isSingleSelection(): boolean {
        return !!this.m_interaction.score().selection().element()
    }

    private canSelectSimilar(): boolean {
        return !!this.currentElement()
    }

    private canSelectSimilarInRange(): boolean {
        return this.canSelectSimilar() && this.m_interaction.score().selection().isRange()
    }

    private isDrumsetStaff(): boolean {
        const ctx = this.m_interaction.hitElementContext()
        if (!ctx.staff) {
            return false
        }

        const tick = ctx.element ? ctx.element.tick() : null
        return !!ctx.staff.part().instrument(tick ?? undefined).drumset()
    }

    private currentElement(): EngravingItem | null {
        const element = this.m_interaction.hitElementContext().element
        if (element) {
            return element
        }

        return this.m_interaction.score().selection().element()
    }
}
