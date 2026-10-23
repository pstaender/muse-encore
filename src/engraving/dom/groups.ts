/*
 * SPDX-License-Identifier: GPL-3.0-only
 * MuseEncore — port of MuseScore Studio (https://github.com/musescore/MuseScore)
 * Copyright (C) 2021-2026 MuseScore Limited and others
 *
 * Port of src/engraving/dom/groups.h/.cpp and types/groupnode.h
 */

import { Fraction } from '../types/fraction'
import { Constants } from '../types/constants'
import { BeamMode, DurationType } from '../types/types'
import { TDuration } from './durationtype'
import { CrossMeasure, type ChordRest } from './chordrest'
import { SegmentType } from './segment'
import { setGroupsEndingsHook } from './staff'

export interface GroupNode {
    pos: number // tick position, division 32nd
    action: number // bits: cccc bbbb aaaa
    // cc - 1/64  bb - 1/32  aa - 1/16
    // bit pattern xxxx:
    // 1 - start new beam
    // 2 - start new 1/32 subbeam
    // 3 - start new 1/64 subbeam
}

export type GroupNodes = GroupNode[]

export class Groups {
    private m_nodes: GroupNodes

    constructor(nodes: GroupNodes = []) {
        this.m_nodes = nodes.map(n => ({ ...n }))
    }

    clone(): Groups { return new Groups(this.m_nodes) }

    nodes(): GroupNodes { return this.m_nodes }
    empty(): boolean { return this.m_nodes.length === 0 }
    addNode(n: GroupNode): void { this.m_nodes.push({ ...n }) }

    equals(g: Groups): boolean {
        if (g.m_nodes.length !== this.m_nodes.length) {
            return false
        }
        for (let i = 0; i < this.m_nodes.length; ++i) {
            if (g.m_nodes[i].pos !== this.m_nodes[i].pos || g.m_nodes[i].action !== this.m_nodes[i].action) {
                return false
            }
        }
        return true
    }

    // ---------------------------------------------------------
    //   baseBeamMode
    //    returns the beam mode of a ChordRest independent of the beam modes of other ChordRests
    // ---------------------------------------------------------

    static baseBeamMode(cr: ChordRest, prev: ChordRest | null = null): BeamMode {
        // if not grace note and not AUTO, use that
        if (cr.isGrace() || cr.beamMode() !== BeamMode.AUTO) {
            return cr.beamMode()
        }

        const prevTicks = prev ? prev.ticks() : new Fraction(0, 1)
        const maxTickLen = cr.ticks().lt(prevTicks) ? prevTicks : cr.ticks()
        let smallestTickLen = new Fraction(1, 8) // start with 8th
        const tickLenLimit = new Fraction(1, 32) // only check up to 32nds because that's all thats available
        while (smallestTickLen.gt(maxTickLen) || cr.rtick().ticks() % smallestTickLen.ticks() !== 0) {
            smallestTickLen = smallestTickLen.div(2) // proceed to 16th, 32nd, etc
            if (smallestTickLen.lt(tickLenLimit)) {
                smallestTickLen = cr.ticks()
                break
            }
        }
        const bigBeatDuration = new TDuration(smallestTickLen).type()
        const crDuration = cr.durationType()
        const g = cr.staff()!.group(cr.tick())
        const stretch = cr.staff()!.timeStretch(cr.tick())
        const tick = cr.rtick().times(stretch).plus(cr.measure().anacrusisOffset())

        const byType = g.beamMode(tick.ticks(), crDuration.type())
        const byPos = g.beamMode(tick.ticks(), bigBeatDuration)
        let val = byType === BeamMode.AUTO ? byPos : byType

        // context-dependent checks
        if (val === BeamMode.AUTO && tick.isNotZero()) {
            // if current or previous cr is in tuplet (but not both in same tuplet):
            // consider it as if this were next shorter duration
            if (prev && (cr.tuplet() !== prev.tuplet()) && crDuration.equals(prev.durationType())) {
                if (crDuration.ge(new TDuration(DurationType.V_EIGHTH))) {
                    val = g.beamMode(tick.ticks(), DurationType.V_16TH)
                } else if (crDuration.equals(DurationType.V_16TH)) {
                    val = g.beamMode(tick.ticks(), DurationType.V_32ND)
                } else {
                    val = g.beamMode(tick.ticks(), DurationType.V_64TH)
                }
            }
            // if there is a hole between previous and current cr, break beam
            // exclude tuplets from this check; tick calculations can be unreliable
            // and they seem to be handled well anyhow
            if (cr.voice() && prev && !prev.tuplet() && prev.endTick().lt(cr.tick())) {
                val = BeamMode.BEGIN
            }
        }
        return val
    }

    static actualBeamMode(cr: ChordRest, prev: ChordRest | null, beatSubdivision?: Map<number, TDuration>): BeamMode {
        if (!beatSubdivision) {
            // gather information about beat subdivision
            const measure = cr.measure()
            const stf = cr.staff()!
            const ts = stf.timeSig(measure.tick())
            const checkBeats = !!ts && ts.denominator() === 4
            beatSubdivision = new Map()
            if (checkBeats && cr.rtick().isNotZero()) {
                const stretch = ts!.stretch()
                const tick = cr.rtick().times(stretch)
                if ((tick.ticks() % Constants.DIVISION) === 0) {
                    for (let s = measure.first(SegmentType.ChordRest); s; s = s.next(SegmentType.ChordRest)) {
                        const mcr = s.element(cr.track()) as ChordRest | null
                        if (!mcr) {
                            continue
                        }
                        const beat = Math.trunc(mcr.rtick().times(stretch).ticks() / Constants.DIVISION)
                        const cur = beatSubdivision.get(beat)
                        if (cur) {
                            beatSubdivision.set(beat, mcr.durationType().lt(cur) ? mcr.durationType() : cur)
                        } else {
                            beatSubdivision.set(beat, mcr.durationType())
                        }
                    }
                }
            }
        }

        // tests for rests and notes that cannot be beamed
        if (cr.isRest() && cr.beamMode() === BeamMode.AUTO) {
            return BeamMode.NONE
        }
        const durationType = cr.durationType()
        if (cr.isChord() && durationType.hooks() === 0) {
            return BeamMode.NONE
        }
        // if this is the second chord of a cross measure value, don't beam it
        if (durationType.hooks() > 0 && cr.crossMeasure() === CrossMeasure.SECOND) {
            return BeamMode.NONE
        }

        let bm = Groups.baseBeamMode(cr, prev)

        // if beat subdivisions in a given beat don't match, try to break
        if (bm === BeamMode.AUTO) {
            if (cr.rtick().isZero()) {
                return BeamMode.BEGIN
            }
            const measure = cr.measure()
            const stf = cr.staff()!
            const ts = stf.timeSig(measure.tick())
            const checkBeats = !!ts && ts.denominator() === 4
            const stretch = ts ? ts.stretch() : new Fraction(1, 1)
            if (checkBeats) {
                const tick = cr.rtick().times(stretch)
                if ((tick.ticks() % Constants.DIVISION) === 0) {
                    const beat = Math.trunc(tick.ticks() / Constants.DIVISION)
                    const currentMin = beatSubdivision.get(beat) ?? new TDuration(DurationType.V_INVALID)
                    const prevMin = beatSubdivision.get(beat - 1) ?? new TDuration(DurationType.V_INVALID)
                    const minDuration = prevMin.lt(currentMin) ? prevMin : currentMin
                    // set the duration type of the chord to the min duration of this beat and the previous beat
                    // and calculate the beam mode
                    const saveDuration = cr.actualDurationType()
                    const saveCMDuration = cr.crossMeasureDurationType()
                    const saveCrossMeasVal = cr.crossMeasure()
                    cr.setDurationType(minDuration)
                    bm = Groups.baseBeamMode(cr, prev)
                    cr.setDurationType(saveDuration)
                    cr.setCrossMeasure(saveCrossMeasVal)
                    cr.setCrossMeasureDurationType(saveCMDuration)
                }
            }
        }
        return bm === BeamMode.AUTO ? BeamMode.MID : bm
    }

    beamMode(tick: number, d: DurationType): BeamMode {
        let shift: number
        switch (d) {
        case DurationType.V_EIGHTH: shift = 0; break
        case DurationType.V_16TH: shift = 4; break
        case DurationType.V_32ND:
        case DurationType.V_64TH:
        case DurationType.V_128TH:
        case DurationType.V_256TH:
        case DurationType.V_512TH:
        case DurationType.V_1024TH:
            shift = 8
            break
        default:
            return BeamMode.AUTO
        }
        const dm = Constants.DIVISION / 8
        for (const e of this.m_nodes) {
            if (e.pos * dm < tick) {
                continue
            }
            if (e.pos * dm > tick) {
                break
            }
            const action = (e.action >> shift) & 0xf
            switch (action) {
            case 0: return BeamMode.AUTO
            case 1: return BeamMode.BEGIN
            case 2: return BeamMode.BEGIN16
            case 3: return BeamMode.BEGIN32
            default:
                return BeamMode.AUTO
            }
        }
        return BeamMode.AUTO
    }

    static endings(f: Fraction): Groups {
        for (const g of noteGroups) {
            if (g.timeSig.identical(f)) {
                return g.endings
            }
        }
        const g: NoteGroup = { timeSig: f, endings: new Groups() }
        noteGroups.push(g)

        let pos = 0
        switch (f.denominator()) {
        case 2: pos = 16; break
        case 4: pos = 8; break
        case 8: pos = 4; break
        case 16: pos = 2; break
        case 32: pos = 1; break
        default: break
        }
        for (let i = 1; i < f.numerator(); ++i) {
            g.endings.addNode({ pos: pos * i, action: 0x111 })
        }
        return g.endings
    }

    addStop(pos: number, d: DurationType, bm: BeamMode): void {
        let shift: number
        switch (d) {
        case DurationType.V_EIGHTH: shift = 0; break
        case DurationType.V_16TH: shift = 4; break
        case DurationType.V_32ND: shift = 8; break
        default:
            return
        }
        let action: number
        if (bm === BeamMode.BEGIN) {
            action = 1
        } else if (bm === BeamMode.BEGIN16) {
            action = 2
        } else if (bm === BeamMode.BEGIN32) {
            action = 3
        } else {
            return
        }
        pos = Math.trunc(pos / 60)
        action <<= shift

        let i = 0
        for (; i < this.m_nodes.length; ++i) {
            if (this.m_nodes[i].pos === pos) {
                this.m_nodes[i].action = (this.m_nodes[i].action & ~(0xf << shift)) | action
                return
            }
            if (this.m_nodes[i].pos > pos) {
                break
            }
        }
        this.m_nodes.splice(i, 0, { pos, action })
    }
}

interface NoteGroup {
    timeSig: Fraction
    endings: Groups
}

const n = (pos: number, action: number): GroupNode => ({ pos, action })

const noteGroups: NoteGroup[] = [
    { timeSig: new Fraction(2, 2),
      endings: new Groups([n(4, 0x200), n(8, 0x110), n(12, 0x200), n(16, 0x111), n(20, 0x200), n(24, 0x110), n(28, 0x200)]) },
    { timeSig: new Fraction(3, 2),
      endings: new Groups([n(4, 0x200), n(8, 0x110), n(12, 0x200), n(16, 0x111), n(20, 0x200), n(24, 0x110), n(28, 0x200),
          n(32, 0x111), n(36, 0x200), n(40, 0x110), n(44, 0x200)]) },
    { timeSig: new Fraction(4, 2),
      endings: new Groups([n(4, 0x200), n(8, 0x110), n(12, 0x200), n(16, 0x111), n(20, 0x200), n(24, 0x110), n(28, 0x200),
          n(32, 0x111), n(36, 0x200), n(40, 0x110), n(44, 0x200), n(48, 0x111), n(52, 0x200), n(56, 0x110), n(60, 0x200)]) },
    { timeSig: new Fraction(2, 4),
      endings: new Groups([n(4, 0x200), n(8, 0x111), n(12, 0x200)]) },
    { timeSig: new Fraction(3, 4),
      endings: new Groups([n(4, 0x200), n(8, 0x111), n(12, 0x200), n(16, 0x111), n(20, 0x200)]) },
    { timeSig: new Fraction(4, 4),
      endings: new Groups([n(4, 0x200), n(8, 0x110), n(12, 0x200), n(16, 0x111), n(20, 0x200), n(24, 0x110), n(28, 0x200)]) },
    { timeSig: new Fraction(5, 4),
      endings: new Groups([n(4, 0x200), n(8, 0x110), n(12, 0x200), n(16, 0x110), n(20, 0x200), n(24, 0x111), n(28, 0x200),
          n(32, 0x110), n(36, 0x200)]) },
    { timeSig: new Fraction(6, 4),
      endings: new Groups([n(4, 0x200), n(8, 0x110), n(12, 0x200), n(16, 0x110), n(20, 0x200), n(24, 0x111), n(28, 0x200),
          n(32, 0x110), n(36, 0x200), n(40, 0x110), n(44, 0x200)]) },
    { timeSig: new Fraction(3, 8),
      endings: new Groups([n(4, 0x200), n(8, 0x200)]) },
    { timeSig: new Fraction(5, 8),
      endings: new Groups([n(4, 0x200), n(8, 0x200), n(12, 0x111), n(16, 0x200)]) },
    { timeSig: new Fraction(6, 8),
      endings: new Groups([n(4, 0x200), n(8, 0x200), n(12, 0x111), n(16, 0x200), n(20, 0x200)]) },
    { timeSig: new Fraction(7, 8),
      endings: new Groups([n(4, 0x200), n(8, 0x200), n(12, 0x111), n(16, 0x200), n(20, 0x111), n(24, 0x200)]) },
    { timeSig: new Fraction(9, 8),
      endings: new Groups([n(4, 0x200), n(8, 0x200), n(12, 0x111), n(16, 0x200), n(20, 0x200), n(24, 0x111), n(28, 0x200),
          n(32, 0x200)]) },
    { timeSig: new Fraction(12, 8),
      endings: new Groups([n(4, 0x200), n(8, 0x200), n(12, 0x111), n(16, 0x200), n(20, 0x200), n(24, 0x111), n(28, 0x200),
          n(32, 0x200), n(36, 0x111), n(40, 0x200), n(44, 0x200)]) },
]

setGroupsEndingsHook(Groups.endings)
