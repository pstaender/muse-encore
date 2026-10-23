/*
 * SPDX-License-Identifier: GPL-3.0-only
 * MuseEncore — port of MuseScore Studio (https://github.com/musescore/MuseScore)
 * Copyright (C) 2021-2026 MuseScore Limited and others
 *
 * Port of src/notation/internal/notationaccessibility.h/.cpp: the selection info of the status bar.
 * TODO(port): the accessibility tree (AccessibleRoot, screen reader focus)
 */

import { arg, mtrc } from '../../framework/global/translation'
import { simplified } from '../../engraving/dom/textbase'
import type { Score } from '../../engraving/dom/score'

export class NotationAccessibility {
    private m_score: Score

    constructor(score: Score) {
        this.m_score = score
    }

    score(): Score { return this.m_score }

    /** C++ updateAccessibilityInfo() */
    accessibilityInfo(): string {
        const selection = this.score().selection()
        let newAccessibilityInfo = ''

        if (selection.isSingle()) {
            newAccessibilityInfo = this.singleElementAccessibilityInfo()
        } else if (selection.isRange()) {
            newAccessibilityInfo = this.rangeAccessibilityInfo()
        } else if (selection.isList()) {
            newAccessibilityInfo = mtrc('notation', 'List selection')
        }

        // Simplify whitespace and remove newlines
        return simplified(newAccessibilityInfo)
    }

    private rangeAccessibilityInfo(): string {
        const selection = this.score().selection()
        let endSegment = selection.endSegment()

        if (!endSegment) {
            endSegment = this.score().lastSegment()
        } else {
            endSegment = endSegment.prev1MM()
        }

        const startBarbeat = selection.startSegment()!.barbeat()

        // QString::arg(double): the shortest representation
        let start = arg(mtrc('engraving', 'Start measure: %1'), String(startBarbeat.bar))
        if (startBarbeat.displayedBar !== startBarbeat.bar) {
            start += '; ' + arg(mtrc('engraving', 'Start displayed measure: %1'), startBarbeat.displayedBar)
        }
        start += '; ' + arg(mtrc('engraving', 'Start beat: %1'), String(startBarbeat.beat))

        const endBarbeat = endSegment!.barbeat()
        let end = arg(mtrc('engraving', 'End measure: %1'), String(endBarbeat.bar))
        if (endBarbeat.displayedBar !== endBarbeat.bar) {
            end += '; ' + arg(mtrc('engraving', 'End displayed measure: %1'), endBarbeat.displayedBar)
        }
        end += '; ' + arg(mtrc('engraving', 'End beat: %1'), String(endBarbeat.beat))

        return arg(arg(mtrc('notation', 'Range selection; %1; %2'), start), end)
    }

    private singleElementAccessibilityInfo(): string {
        const element = this.score().selection().element()
        if (!element) {
            return ''
        }

        let accessibilityInfo = element.accessibleInfo()
        const barsAndBeats = element.formatBarsAndBeats()

        if (barsAndBeats.length) {
            accessibilityInfo += '; ' + barsAndBeats
        }

        if (element.hasStaff()) {
            const staff = arg(mtrc('notation', 'Staff %1'), String(element.staffIdx() + 1))

            let staffName = element.staff()!.part().longName(element.tick())
            if (!staffName) {
                staffName = element.staff()!.partName()
            }

            if (!staffName) {
                accessibilityInfo = `${accessibilityInfo}; ${staff}`
            } else {
                accessibilityInfo = `${accessibilityInfo}; ${staff} (${staffName})`
            }
        }

        return accessibilityInfo
    }
}
