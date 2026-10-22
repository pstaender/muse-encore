/*
 * SPDX-License-Identifier: GPL-3.0-only
 * MuseScore-Web — port of MuseScore Studio (https://github.com/musescore/MuseScore)
 * Copyright (C) 2021-2026 MuseScore Limited and others
 *
 * Port of src/engraving/editing/editvoicing.h/.cpp
 */

import { VOICES, VoiceAssignment, nidx, type staff_idx_t, type track_idx_t } from '../types/types'
import type { Fraction } from '../types/fraction'
import type { Segment } from '../dom/segment'
import { Pid } from '../dom/property'
import type { EngravingObject } from '../dom/engravingobject'
import type { Measure } from '../dom/measure'
import { CommandType, UndoCommand } from './undo'
import type { EditData } from './editdata'

export class ExchangeVoice extends UndoCommand {
    constructor(private measure: Measure, private val1: track_idx_t, private val2: track_idx_t, private staff: staff_idx_t) {
        super()
    }

    override type(): CommandType { return CommandType.ExchangeVoice }
    override name(): string { return 'ExchangeVoice' }
    override objectItems(): EngravingObject[] { return [this.measure] }

    override undo(_ed: EditData | null): void {
        this.measure.exchangeVoice(this.val2, this.val1, this.staff)
        this.measure.checkMultiVoices(this.staff)
    }

    override redo(_ed: EditData | null): void {
        this.measure.exchangeVoice(this.val1, this.val2, this.staff)
    }
}

/** copies a voice (Score::cloneVoice) for explode and implode; otrack nidx: the source voice is deleted after the copy */
export class CloneVoice extends UndoCommand {
    private first = true // first redo

    constructor(private sourceSeg: Segment, private lTick: Fraction, private destSeg: Segment, private strack: track_idx_t,
        private dtrack: track_idx_t, private otrack: track_idx_t, private linked = true) {
        super()
    }

    override type(): CommandType { return CommandType.CloneVoice }
    override name(): string { return 'CloneVoice' }
    override objectItems(): EngravingObject[] { return [this.sourceSeg, this.destSeg] }

    override undo(_ed: EditData | null): void {
        const s = this.destSeg.score()
        const ticks = this.destSeg.tick().plus(this.lTick).minus(this.sourceSeg.tick())
        const sTrack = this.otrack === nidx ? this.dtrack : this.otrack // use the correct source / destination if deleting the source
        const dTrack = this.otrack === nidx ? this.strack : this.dtrack

        // Clear destination voice (in case of not linked and otrack = -1 we would delete our source
        if (this.otrack !== nidx && this.linked) {
            for (let seg: Segment | null = this.destSeg; seg && seg.tick().lt(ticks); seg = seg.next1()) {
                const el = seg.element(dTrack)
                if (el && el.isChordRest()) {
                    el.unlink()
                    seg.setElement(dTrack, null)
                }
            }
        }

        if (this.otrack === nidx && !this.linked) {
            // On the first run get going the undo redo action for adding/deleting elements and slurs
            if (this.first) {
                s.cloneVoice(sTrack, dTrack, this.sourceSeg, ticks, this.linked)
                const spanners = s.spannerMap().findOverlapping(this.sourceSeg.tick().ticks(), this.lTick.ticks())
                for (const sp of spanners) {
                    if (sp.isSlur() && (sp.track() === sTrack || sp.track2() === sTrack)) {
                        s.undoRemoveElement(sp)
                    }
                    if (sp.isHairpin() && (sp.track() === dTrack || sp.track2() === dTrack)) {
                        s.undoRemoveElement(sp)
                    }
                }
                for (let seg: Segment | null = this.destSeg; seg && seg.tick().lt(ticks); seg = seg.next1()) {
                    const el = seg.element(sTrack)
                    if (el && el.isChordRest()) {
                        s.undoRemoveElement(el)
                    }

                    const annotations = [...seg.annotations()]
                    for (const annotation of annotations) {
                        if (annotation && annotation.hasVoiceAssignmentProperties() && annotation.track() === dTrack) {
                            // Remove extra all voice annotations which have been created
                            const voiceAssignment = annotation.getProperty(Pid.VOICE_ASSIGNMENT) as VoiceAssignment
                            if (voiceAssignment !== VoiceAssignment.CURRENT_VOICE_ONLY) {
                                s.undoRemoveElement(annotation)
                            }
                        }
                    }
                }
            }
            // Set rests if first voice in a staff
            if (!(sTrack % VOICES)) {
                s.setRest(this.destSeg.tick(), sTrack, ticks, false, null)
            }
        } else {
            s.cloneVoice(sTrack, dTrack, this.sourceSeg, ticks, this.linked)
            if (!this.linked && !(dTrack % VOICES)) {
                s.setRest(this.destSeg.tick(), dTrack, ticks, false, null)
            }

            // Remove annotations
            for (let seg: Segment | null = this.destSeg; seg && seg.tick().lt(ticks); seg = seg.next1()) {
                const annotations = [...seg.annotations()]
                for (const annotation of annotations) {
                    if (annotation && annotation.hasVoiceAssignmentProperties() && annotation.track() === dTrack) {
                        // Remove extra all voice annotations which have been created
                        const voiceAssignment = annotation.getProperty(Pid.VOICE_ASSIGNMENT) as VoiceAssignment
                        if (voiceAssignment !== VoiceAssignment.CURRENT_VOICE_ONLY) {
                            s.undoRemoveElement(annotation)
                        }
                    }
                }
            }

            const spanners = s.spannerMap().findOverlapping(this.sourceSeg.tick().ticks(), this.lTick.ticks())
            for (const sp of spanners) {
                if (sp.hasVoiceAssignmentProperties() && (sp.track() === dTrack || sp.track2() === dTrack)) {
                    // Remove extra all voice annotations which have been created
                    const voiceAssignment = sp.getProperty(Pid.VOICE_ASSIGNMENT) as VoiceAssignment
                    if (voiceAssignment !== VoiceAssignment.CURRENT_VOICE_ONLY) {
                        s.undoRemoveElement(sp)
                    }
                }
            }
        }

        this.first = false
    }

    override redo(_ed: EditData | null): void {
        const s = this.destSeg.score()
        const ticks = this.destSeg.tick().plus(this.lTick).minus(this.sourceSeg.tick())

        // Clear destination voice (in case of not linked and otrack = -1 we would delete our source
        if (this.otrack !== nidx && this.linked) {
            for (let seg: Segment | null = this.destSeg; seg && seg.tick().lt(ticks); seg = seg.next1()) {
                const el = seg.element(this.dtrack)
                if (el && el.isChordRest()) {
                    el.unlink()
                    seg.setElement(this.dtrack, null)
                }
            }
        }

        if (this.otrack === nidx && !this.linked) {
            // On the first run get going the undo redo action for adding/deleting elements and slurs
            if (this.first) {
                s.cloneVoice(this.strack, this.dtrack, this.sourceSeg, ticks, this.linked)
                const spanners = s.spannerMap().findOverlapping(this.sourceSeg.tick().ticks(), this.lTick.ticks())
                for (const sp of spanners) {
                    if (sp.isSlur() && (sp.track() === this.strack || sp.track2() === this.strack)) {
                        s.undoRemoveElement(sp)
                    }
                }
                for (let seg: Segment | null = this.destSeg; seg && seg.tick().lt(ticks); seg = seg.next1()) {
                    const el = seg.element(this.strack)
                    if (el && el.isChordRest()) {
                        s.undoRemoveElement(el)
                    }

                    const annotations = [...seg.annotations()]
                    for (const annotation of annotations) {
                        if (annotation && annotation.track() === this.strack) {
                            if (annotation.hasVoiceAssignmentProperties()) {
                                const voiceAssignment = annotation.getProperty(Pid.VOICE_ASSIGNMENT) as VoiceAssignment
                                if (voiceAssignment !== VoiceAssignment.CURRENT_VOICE_ONLY) {
                                    continue
                                }
                            }
                            s.undoRemoveElement(annotation)
                        }
                    }
                }
            }
            // Set rests if first voice in a staff
            if (!(this.strack % VOICES)) {
                s.setRest(this.destSeg.tick(), this.strack, ticks, false, null)
            }
        } else {
            s.cloneVoice(this.strack, this.dtrack, this.sourceSeg, ticks, this.linked, this.first)
        }
    }
}

