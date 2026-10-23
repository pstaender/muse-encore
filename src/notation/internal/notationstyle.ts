/*
 * SPDX-License-Identifier: GPL-3.0-only
 * MuseScore-Web — port of MuseScore Studio (https://github.com/musescore/MuseScore)
 * Copyright (C) 2021-2026 MuseScore Limited and others
 *
 * Port of src/notation/internal/notationstyle.h/.cpp: the style of the notation for the Style and Page Settings
 * dialogs (style values with undo, load/save of style files). Files are passed as their content: loadStyle takes the
 * text of a .mss file, saveStyle returns it.
 */

import { TranslatableString } from '../../framework/global/types/translatablestring'
import { DefaultStyle } from '../../engraving/style/defaultstyle'
import { Sid } from '../../engraving/style/styledef'
import { ChangeStyle } from '../../engraving/editing/editstyle'
import { XmlReader } from '../../engraving/rw/xmlreader'
import { XmlWriter } from '../../engraving/rw/xmlwriter'
import { propertyValueEquals, type PropertyValue } from '../../engraving/types/propertyvalue'
import type { Score } from '../../engraving/dom/score'
import { Notification, type NotationUndoStack } from './notationundostack'

export class NotationStyle {
    private m_styleChanged = new Notification()

    constructor(private m_getScore: () => Score, private m_undoStack: NotationUndoStack) {}

    styleValue(styleId: Sid): PropertyValue {
        return this.score().style().styleV(styleId)
    }

    defaultStyleValue(styleId: Sid): PropertyValue {
        return DefaultStyle.defaultStyle().value(styleId)
    }

    setStyleValue(styleId: Sid, newValue: PropertyValue): void {
        if (propertyValueEquals(this.styleValue(styleId), newValue)) {
            return
        }

        if (styleId === Sid.concertPitch) {
            this.score().cmdConcertPitchChanged(newValue as boolean)
        } else {
            this.score().undoChangeStyleVal(styleId, newValue)
            this.score().update()
        }

        this.m_styleChanged.notify()
    }

    resetStyleValue(styleId: Sid): void {
        this.score().resetStyleValue(styleId)
        this.score().update()
        this.m_styleChanged.notify()
    }

    resetStyleValues(styleIds: readonly Sid[]): void {
        for (const id of styleIds) {
            this.score().resetStyleValue(id)
        }
        this.score().update()
        this.m_styleChanged.notify()
    }

    canApplyToAllParts(): boolean {
        return !this.score().isMaster() // In parts only
    }

    applyToAllParts(): void {
        if (!this.canApplyToAllParts()) {
            return
        }

        const style = this.score().style()

        for (const excerpt of this.score().masterScore().excerpts()) {
            const excerptScore = excerpt.excerptScore()
            if (!excerptScore) {
                continue
            }
            excerptScore.undo(new ChangeStyle(excerptScore, style))
            excerptScore.update()
        }
    }

    resetAllStyleValues(exceptTheseOnes: ReadonlySet<Sid> = new Set()): void {
        this.score().cmdResetAllStyles(exceptTheseOnes)
        this.score().update()
        this.m_styleChanged.notify()
    }

    styleChanged(): Notification { return this.m_styleChanged }

    /** C++ MStyle::isValid(IODevice*): the data is a style document */
    static isValidStyleFile(data: string): boolean {
        const e = new XmlReader(data)
        while (!e.isError() && e.readNextStartElement()) {
            if (e.name() === 'museScore') {
                while (e.readNextStartElement()) {
                    if (e.name() === 'Style') {
                        return true
                    }
                }
            }
        }
        return false
    }

    /** loads the style file content (as one undoable command) */
    loadStyle(data: string, allowAnyVersion: boolean): boolean {
        this.m_undoStack.prepareChanges(new TranslatableString('undoableAction', 'Load style'))
        const result = this.score().loadStyle(data, allowAnyVersion)
        this.m_undoStack.commitChanges()

        if (result) {
            this.m_styleChanged.notify()
        }

        return result
    }

    /** C++ saveStyle(path) -> Score::saveStyle -> MStyle::write: the content of the .mss file */
    saveStyle(): string {
        const xml = new XmlWriter()
        this.score().style().write(xml)
        return xml.text()
    }

    private score(): Score {
        return this.m_getScore()
    }
}
