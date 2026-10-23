/*
 * SPDX-License-Identifier: GPL-3.0-only
 * MuseEncore — port of MuseScore Studio (https://github.com/musescore/MuseScore)
 * Copyright (C) 2021-2026 MuseScore Limited and others
 *
 * Port of LinkedObjects::mainElement() (src/engraving/dom/linkedobjects.cpp); the port's LinkedObjects is the plain
 * array shared by EngravingObject.links()
 */

import { Sid } from '../style/styledef'
import type { EngravingObject } from './engravingobject'
import type { EngravingItem } from './engravingitem'
import type { Staff } from './staff'

/** the element that is written first (the others are written with <linkedTo>) */
export function linkedObjectsMainElement(links: readonly EngravingObject[]): EngravingObject | null {
    if (!links.length) {
        return null
    }
    const ms = links[0].score().masterScore()
    const elements = links[0].isEngravingItem()
    const staves = links[0].isStaff()
    const less = (s1: EngravingObject, s2: EngravingObject): boolean => {
        if (s1.score() === ms && s2.score() !== ms) {
            return true
        }
        if (s1.score() !== s2.score()) {
            return false
        }
        if (staves) {
            return (s1 as Staff).idx() < (s2 as Staff).idx()
        }
        if (elements) {
            // Now we compare either two elements from master score
            // or two elements from excerpt.
            const e1 = s1 as EngravingItem
            const e2 = s2 as EngravingItem
            const tr1 = e1.track()
            const tr2 = e2.track()
            if (tr1 === tr2) {
                const tick1 = e1.tick()
                const tick2 = e2.tick()
                if (tick1.eq(tick2)) {
                    const m1 = e1.findMeasure()
                    const m2 = e2.findMeasure()
                    if (!m1 || !m2) {
                        return false
                    }
                    // MM rests are written in the following order: 1) first measure of the MM rest (hasMMRest()),
                    // 2) the MM rest itself, 3) the other measures of the MM rest
                    if (m1.isMMRest() === m2.isMMRest()) {
                        return false
                    }
                    // MM rests may be generated but not written (e.g. if saving right after disabling MM rests)
                    let mmRestsWritten = e1.style().styleB(Sid.createMultiMeasureRests)
                    if (m1.tick().eq(m2.tick())) {
                        const oneIsMMRestCoveringOther = m1.mmRest() === m2 || m2.mmRest() === m1
                        mmRestsWritten &&= oneIsMMRestCoveringOther
                    }
                    if (m1.isMMRest()) {
                        // m1 is earlier if m2 is *not* the first MM rest measure
                        return mmRestsWritten && !m2.hasMMRest()
                    }
                    if (m2.isMMRest()) {
                        // m1 is earlier if it *is* the first MM rest measure
                        return !mmRestsWritten || m1.hasMMRest()
                    }
                    return false
                }
                return tick1.lt(tick2)
            }
            return tr1 < tr2
        }
        return false
    }
    // std::min_element: the first smallest element
    let min = links[0]
    for (let i = 1; i < links.length; ++i) {
        if (less(links[i], min)) {
            min = links[i]
        }
    }
    return min
}
