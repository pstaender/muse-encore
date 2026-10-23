/*
 * SPDX-License-Identifier: GPL-3.0-only
 * MuseEncore — port of MuseScore Studio (https://github.com/musescore/MuseScore)
 * Copyright (C) 2021-2026 MuseScore Limited and others
 *
 * Port of src/engraving/dom/durationelement.h/.cpp
 */

import { Fraction } from '../types/fraction'
import type { PropertyValue } from '../types/propertyvalue'
import type { ElementType } from '../types/types'
import { EngravingItem, ElementFlag } from './engravingitem'
import type { EngravingObject } from './engravingobject'
import { Pid } from './property'
import type { Measure } from './measure'
import type { Tuplet } from './tuplet'
import type { Beam } from './beam'

export abstract class DurationElement extends EngravingItem {
    private m_duration = new Fraction(0, 1)
    private m_tuplet: Tuplet | null = null

    constructor(type: ElementType, parent: EngravingObject | null = null, f: number = ElementFlag.MOVABLE | ElementFlag.ON_STAFF) {
        super(type, parent, f)
    }

    /** C++ copy constructor: the tuplet is not copied */
    protected override onCloned(original: this): void {
        super.onCloned(original)
        this.m_tuplet = null
    }

    measure(): Measure { return this.explicitParent() as unknown as Measure }

    readAddTuplet(t: Tuplet): void {
        this.setTuplet(t)
        t.add(this)
    }

    setTuplet(t: Tuplet | null): void {
        if (this.m_tuplet) {
            this.m_tuplet.removeDurationElement(this)
        }
        this.m_tuplet = t
        if (this.m_tuplet) {
            this.m_tuplet.addDurationElement(this)
        }
    }

    tuplet(): Tuplet | null { return this.m_tuplet }

    topTuplet(): Tuplet | null {
        let t = this.tuplet()
        if (t) {
            while (t.tuplet()) {
                t = t.tuplet()!
            }
        }
        return t
    }

    beam(): Beam | null { return null }

    globalTicks(): Fraction {
        let f = this.m_duration
        for (let t = this.tuplet(); t; t = t.tuplet()) {
            f = f.div(t.ratio())
        }
        return f
    }

    timeStretchFactor(): number {
        const nominalDuration = this.m_duration.ticks()
        const actualDuration = this.actualTicks().ticks()
        return actualDuration / nominalDuration
    }

    actualTicksAt(tick: Fraction): Fraction {
        return this.globalTicks().div(this.staff()!.timeStretch(tick))
    }

    actualTicks(): Fraction { return this.actualTicksAt(this.tick()) }
    endTick(): Fraction { return this.tick().plus(this.actualTicks()) }
    ticks(): Fraction { return this.m_duration }
    setTicks(f: Fraction): void { this.m_duration = f }

    override getProperty(propertyId: Pid): PropertyValue {
        if (propertyId === Pid.DURATION) {
            return this.m_duration
        }
        return super.getProperty(propertyId)
    }

    override setProperty(propertyId: Pid, v: PropertyValue): boolean {
        if (propertyId === Pid.DURATION) {
            this.setTicks(v as Fraction)
            return true
        }
        return super.setProperty(propertyId, v)
    }
}
