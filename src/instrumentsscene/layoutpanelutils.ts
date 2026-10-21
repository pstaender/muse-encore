/*
 * SPDX-License-Identifier: GPL-3.0-only
 * MuseScore-Web — port of MuseScore Studio (https://github.com/musescore/MuseScore)
 * Copyright (C) 2021-2026 MuseScore Limited and others
 *
 * Port of src/instrumentsscene/qml/MuseScore/InstrumentsScene/internal/layoutpanelutils.h
 * and collectSystemObjects() of src/engraving/dom/utils.cpp
 */

import type { EngravingItem } from '../engraving/dom/engravingitem'
import type { Score } from '../engraving/dom/score'
import { CHORD_REST_OR_TIME_TICK_TYPE, SegmentType } from '../engraving/dom/segment'
import type { Staff } from '../engraving/dom/staff'
import { Sid } from '../engraving/style/styledef'
import { TConv } from '../engraving/types/typesconv'
import { ElementType, MeasureNumberPlacement, TimeSigPlacement } from '../engraving/types/types'

export interface SystemObjectsGroup {
    type: ElementType
    items: EngravingItem[]
    staff: Staff | null
}

export type SystemObjectGroups = SystemObjectsGroup[]
export type SystemObjectGroupsByStaff = Map<Staff, SystemObjectGroups>

/**
 * C++ collectSystemObjects (engraving/dom/utils.cpp): the system objects of the given staves, or the top system
 * objects if `staves` is empty.
 * TODO(port): belongs to engraving/dom/utils.ts (also used by editpart.cpp); kept here until editing needs it
 */
export function collectSystemObjects(score: Score, staves: readonly Staff[] = []): EngravingItem[] {
    const result: EngravingItem[] = []

    const timeSigPlacement = score.style().styleV(Sid.timeSigPlacement) as TimeSigPlacement
    const isOnStaffTimeSig = timeSigPlacement !== TimeSigPlacement.NORMAL

    for (let measure = score.firstMeasure(); measure; measure = measure.nextMeasure()) {
        for (const measureElement of measure.el()) {
            if (!measureElement || !measureElement.systemFlag() || measureElement.isLayoutBreak()) {
                continue
            }
            if (staves.length) {
                if (staves.includes(measureElement.staff()!)) {
                    result.push(measureElement)
                }
            } else if (measureElement.isTopSystemObject()) {
                result.push(measureElement)
            }
        }

        for (const seg of measure.segments()) {
            if (seg.segmentType() & (CHORD_REST_OR_TIME_TICK_TYPE | SegmentType.EndBarLine)) {
                for (const annotation of seg.annotations()) {
                    if (!annotation || !annotation.systemFlag()) {
                        continue
                    }
                    if (staves.length) {
                        if (staves.includes(annotation.staff()!)) {
                            result.push(annotation)
                        }
                    } else if (annotation.isTopSystemObject()) {
                        result.push(annotation)
                    }
                }
            }

            if (isOnStaffTimeSig && (seg.segmentType() & SegmentType.TimeSigType)) {
                for (const item of seg.elist()) {
                    if (!item || !item.isTimeSig()) {
                        continue
                    }
                    if (staves.length) {
                        if (staves.includes(item.staff()!)) {
                            result.push(item)
                        }
                    } else if (item.staffIdx() === 0) {
                        result.push(item)
                    }
                }
            }
        }
    }

    for (const spanner of score.spanner()) {
        if (!spanner.systemFlag()) {
            continue
        }
        if (staves.length) {
            if (staves.includes(spanner.staff()!)) {
                result.push(spanner)
            }
        } else if (spanner.isTopSystemObject()) {
            result.push(spanner)
        }
    }

    return result
}

export function collectSystemObjectGroups(staves: readonly Staff[]): SystemObjectGroupsByStaff {
    const result: SystemObjectGroupsByStaff = new Map()
    if (!staves.length) {
        return result
    }

    const groupsOf = (staff: Staff): SystemObjectGroups => {
        let groups = result.get(staff)
        if (!groups) {
            groups = []
            result.set(staff, groups)
        }
        return groups
    }

    const systemObjects = collectSystemObjects(staves[0].score(), staves)
    for (const obj of systemObjects) {
        const groups = groupsOf(obj.staff()!)
        const group = groups.find(g => g.type === obj.type())
        if (group) {
            group.items.push(obj)
        } else {
            groups.push({ type: obj.type(), items: [obj], staff: obj.staff() })
        }
    }

    const style = staves[0].style()
    const collectMeasureNumbers = (style.styleV(Sid.measureNumberPlacementMode) as MeasureNumberPlacement)
        === MeasureNumberPlacement.ON_SYSTEM_OBJECT_STAVES
    if (collectMeasureNumbers) {
        for (const staff of staves) {
            groupsOf(staff).push({ type: ElementType.MEASURE_NUMBER, items: [], staff })
        }
    }

    return result
}

export function collectSystemObjectGroupsOfStaff(systemObjectsStaff: Staff): SystemObjectGroups {
    return collectSystemObjectGroups([systemObjectsStaff]).get(systemObjectsStaff) ?? []
}

export function isSystemObjectsGroupVisible(group: SystemObjectsGroup): boolean {
    if (group.type === ElementType.MEASURE_NUMBER) {
        return !!group.staff && group.staff.shouldShowMeasureNumbers()
    }
    return group.items.some(item => item.visible())
}

export function translatedSystemObjectsGroupName(group: SystemObjectsGroup): string {
    return TConv.userNameElementType(group.type).translated(group.items.length)
}

export function translatedSystemObjectsGroupCapitalizedName(group: SystemObjectsGroup): string {
    return TConv.capitalizedUserNameElementType(group.type).translated(group.items.length)
}
