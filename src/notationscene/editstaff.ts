/*
 * SPDX-License-Identifier: GPL-3.0-only
 * MuseScore-Web — port of MuseScore Studio (https://github.com/musescore/MuseScore)
 * Copyright (C) 2021-2026 MuseScore Limited and others
 *
 * Port of the logic of src/notationscene/widgets/editstaff.h/.cpp (the Staff/Part properties dialog): the staff and
 * instrument being edited (copies), replacing the instrument, the string data, and apply() (the staff config, the
 * instrument and the sharp/flat preference, merged into one undo step). The app's dialog shows and edits the fields.
 * Deviation: without a hit element context (the context menu) the staff is found from the selected element.
 */

import { Fraction } from '../engraving/types/fraction'
import { Spatium } from '../engraving/types/dimension'
import { AutoOnOff, PreferSharpFlat, StaffGroup } from '../engraving/types/types'
import { Color } from '../framework/draw/types/color'
import { Instrument, StaffName } from '../engraving/dom/instrument'
import { Interval } from '../engraving/dom/interval'
import { StaffType } from '../engraving/dom/stafftype'
import { InstrString, StringData } from '../engraving/dom/stringdata'
import { TextBase } from '../engraving/dom/textbase'
import { searchTemplate } from '../engraving/dom/instrtemplate'
import { EditStaffType } from './editstafftype'
import { formatInstrumentTitle, type InstrumentKey, type StaffConfig } from '../notation/notationtypes'
import type { ClefTypeList } from '../engraving/dom/clefinfo'
import type { EngravingItem } from '../engraving/dom/engravingitem'
import type { Staff } from '../engraving/dom/staff'
import type { Measure } from '../engraving/dom/measure'
import type { ChordRest } from '../engraving/dom/chordrest'
import type { Note } from '../engraving/dom/note'
import type { System } from '../engraving/dom/system'
import type { NotationInteraction } from '../notation/internal/notationinteraction'
import type { NotationParts } from '../notation/internal/notationparts'
import { qtrc } from '../framework/global/translation'

/** a string of the string data (C++ instrString: pitch and "always open") */
export interface EditStaffString {
    pitch: number
    open: boolean
}

/** the values of the dialog's controls */
export interface EditStaffValues {
    // staff properties
    mag: number // percent
    lines: number
    lineDistance: number // sp
    showClef: boolean
    showTimesig: boolean
    showBarlines: boolean
    invisible: boolean
    color: string // #rrggbb
    extraDistance: number // sp
    hideSystemBarLine: boolean
    mergeMatchingRests: AutoOnOff
    noReflectTranspositionInLinkedTab: boolean
    // part properties
    longName: string
    shortName: string
    minPitchA: number
    maxPitchA: number
    minPitchP: number
    maxPitchP: number
    /** index in Interval.allIntervals */
    intervalIndex: number
    up: boolean
    octave: number
    preferSharpFlat: PreferSharpFlat
}

export class EditStaff {
    private m_orgStaff: Staff | null = null
    private m_staffType = new StaffType()
    private m_clefType: ClefTypeList | null = null
    private m_instrument = new Instrument()
    private m_orgInstrument = new Instrument()
    private m_instrumentKey: InstrumentKey = { instrumentId: '', partId: '', tick: new Fraction(0, 1) }
    private m_tickStart = new Fraction(-1, 1)
    private m_tickEnd = new Fraction(-1, 1)
    private m_values: EditStaffValues | null = null

    constructor(private m_interaction: NotationInteraction, private m_parts: NotationParts) {
        this.initStaff()
    }

    isValid(): boolean { return !!this.m_orgStaff && !!this.m_values }

    staff(): Staff | null { return this.m_orgStaff }
    values(): EditStaffValues { return { ...this.m_values! } }
    setValues(v: Partial<EditStaffValues>): void {
        this.m_values = { ...this.m_values!, ...v }
    }

    /** the staff of the hit element context (the context menu) or of the selection */
    private initStaff(): void {
        const context = this.m_interaction.hitElementContext()
        let element: EngravingItem | null = context.element
        let staff: Staff | null = context.staff

        const selection = this.m_interaction.score().selection()
        if (!element) {
            if (selection.isRange()) {
                element = selection.endSegment() ? selection.endSegment()!.measure() : this.m_interaction.score().lastMeasure()
                staff = this.m_interaction.score().staff(selection.staffEnd() - 1)
            } else if (selection.element()) {
                // TODO(port): no context menu (hitElementContext): the selected element
                element = selection.element()
                staff = element!.staff()
            }
        }

        if (!element) {
            return
        }

        let tick = new Fraction(-1, 1)
        if (element.isChordRest()) {
            tick = (element as unknown as ChordRest).tick()
        } else if (element.isNote()) {
            tick = (element as unknown as Note).chord().tick()
        } else if (element.isMeasure()) {
            tick = (element as unknown as Measure).tick()
        } else if (element.isInstrumentName()) {
            const system = element.explicitParent() as unknown as System | null
            const measure = system ? system.firstMeasure() : null
            staff = element.staff()

            if (measure) {
                tick = measure.tick()
            }
        }

        if (!staff) {
            return
        }

        this.setStaff(staff, tick)
    }

    setStaff(s: Staff, tick: Fraction): void {
        this.m_orgStaff = s

        const part = s.part()

        // muse::findLessOrEqual(part->instruments(), tick)
        const instruments = part.instruments()
        const it = instruments.upperBound(tick.ticks()) - 1
        if (it < 0) {
            return
        }

        this.m_instrument = new Instrument()
        this.m_instrument.assign(instruments.valueAt(it))
        this.m_orgInstrument = new Instrument()
        this.m_orgInstrument.assign(this.m_instrument)

        this.m_instrumentKey = {
            instrumentId: this.m_instrument.id(),
            partId: part.id(),
            tick: Fraction.fromTicks(instruments.keyAt(it)),
        }

        this.m_staffType = s.staffType(new Fraction(0, 1)).clone()
        this.m_clefType = s.defaultClefType().clone()

        // get tick range for instrument
        let i = instruments.upperBound(tick.ticks())
        if (i === instruments.size()) {
            this.m_tickEnd = new Fraction(-1, 1)
        } else {
            this.m_tickEnd = Fraction.fromTicks(instruments.keyAt(i))
        }
        --i
        if (i <= 0) {
            this.m_tickStart = new Fraction(-1, 1)
        } else {
            this.m_tickStart = Fraction.fromTicks(instruments.keyAt(i))
        }

        const stt = this.m_staffType
        this.m_values = {
            mag: stt.userMag() * 100.0,
            lines: 5,
            lineDistance: 1,
            showClef: true,
            showTimesig: true,
            showBarlines: true,
            invisible: stt.invisible(),
            color: stt.color().toString().substring(0, 7),
            extraDistance: s.userDist().val(),
            hideSystemBarLine: s.hideSystemBarLine(),
            mergeMatchingRests: s.mergeMatchingRests(),
            noReflectTranspositionInLinkedTab: !s.reflectTranspositionInLinkedTab(),
            longName: '',
            shortName: '',
            minPitchA: 0,
            maxPitchA: 127,
            minPitchP: 0,
            maxPitchP: 127,
            intervalIndex: 0,
            up: true,
            octave: 0,
            preferSharpFlat: part.preferSharpFlat(),
        }

        this.updateStaffType(stt)
        this.updateInstrument()
    }

    private updateStaffType(staffType: StaffType): void {
        this.setValues({
            lines: staffType.lines(),
            lineDistance: staffType.lineDistance().val(),
            showClef: staffType.genClef(),
            showTimesig: staffType.genTimesig(),
            showBarlines: staffType.showBarlines(),
            invisible: staffType.invisible(),
        })
    }

    private updateInstrument(): void {
        this.updateInterval(this.m_instrument.transpose())

        this.setValues({
            longName: this.m_instrument.nameAsPlainText(),
            shortName: this.m_instrument.abbreviatureAsPlainText(),
            minPitchA: this.m_instrument.minPitchA(),
            maxPitchA: this.m_instrument.maxPitchA(),
            minPitchP: this.m_instrument.minPitchP(),
            maxPitchP: this.m_instrument.maxPitchP(),
            preferSharpFlat: this.m_orgStaff!.part().preferSharpFlat(),
        })
    }

    private updateInterval(iv: Interval): void {
        const upFlag = !(iv.chromatic < 0 || iv.diatonic < 0)

        let chromatic = Math.abs(iv.chromatic)
        let diatonic = Math.abs(iv.diatonic)
        let oct = Math.trunc(chromatic / 12)

        chromatic %= 12
        diatonic %= 7

        if (diatonic === 0 && chromatic === 11) {
            diatonic = 7
        } else if (chromatic === 0 && diatonic === 6) {
            chromatic = 12
            --oct
        }

        let intervalIndex = Interval.allIntervals.findIndex(i => i.diatonic === diatonic && i.chromatic === chromatic)
        if (intervalIndex < 0) {
            // C++ LOGD("EditStaff: unknown interval %d %d", diatonic, chromatic)
            intervalIndex = 0
        }

        this.setValues({ intervalIndex, up: upFlag, octave: oct })
    }

    /** the instrument's title (the template's), or "Unknown" */
    instrumentName(): string {
        const templ = searchTemplate(this.m_instrument.id())
        if (templ) {
            return formatInstrumentTitle(templ.trackName, templ.trait)
        }
        return qtrc('notation/editstaff', 'Unknown')
    }

    staffGroupName(): string { return this.m_staffType.translatedGroupName() }

    /** only show string data controls if instrument has strings */
    strings(): EditStaffString[] {
        return this.m_instrument.stringData().stringList().map(s => ({ pitch: s.pitch, open: s.open }))
    }

    frets(): number { return this.m_instrument.stringData().frets() }

    /** show transp_PreferSharpFlat if instrument isn't non-transposing or octave-transposing */
    showPreferSharpFlat(): boolean {
        const i = this.m_values!.intervalIndex
        return i !== 0 && i !== 25
    }

    hasPreviousStaff(): boolean { return !!this.m_orgStaff && this.m_orgStaff.idx() !== 0 }
    hasNextStaff(): boolean { return !!this.m_orgStaff && this.m_orgStaff.idx() < this.m_orgStaff.score().nstaves() - 1 }

    gotoNextStaff(): void {
        this.apply()
        const nextStaff = this.m_orgStaff!.score().staff(this.m_orgStaff!.idx() + 1)

        if (nextStaff) {
            this.setStaff(nextStaff, this.m_tickStart)
        }
    }

    gotoPreviousStaff(): void {
        this.apply()
        const prevStaff = this.m_orgStaff!.score().staff(this.m_orgStaff!.idx() - 1)

        if (prevStaff) {
            this.setStaff(prevStaff, this.m_tickStart)
        }
    }

    /** showStaffTypeDialog: the "Advanced style properties" of the staff type and the instrument */
    createEditStaffType(): EditStaffType {
        // the current values of the dialog's staff type controls
        const staffType = this.m_staffType.clone()
        const v = this.m_values!
        staffType.setLines(v.lines)
        staffType.setLineDistance(new Spatium(v.lineDistance))
        staffType.setGenClef(v.showClef)
        staffType.setGenTimesig(v.showTimesig)
        staffType.setShowBarlines(v.showBarlines)
        staffType.setInvisible(v.invisible)
        return new EditStaffType(staffType, this.m_instrument, this.m_orgStaff!.score())
    }

    /** the staff type of the accepted "Advanced style properties" dialog */
    setStaffType(staffType: StaffType): void {
        this.m_staffType = staffType.clone()
        this.updateStaffType(staffType)
    }

    /** showReplaceInstrumentDialog: the instrument chosen in the select instrument dialog */
    replaceInstrument(templateId: string): boolean {
        const val = searchTemplate(templateId)
        if (!val) {
            return false
        }

        const staffType = val.staffTypePreset ?? StaffType.getDefaultPreset(StaffGroup.STANDARD)

        this.m_instrument = Instrument.fromTemplate(val)
        this.m_staffType = staffType.clone()
        this.m_clefType = this.m_instrument.clefType(0).clone()

        this.updateInstrument()
        this.updateStaffType(staffType)
        return true
    }

    /** editStringDataClicked: the string data of the String data dialog (strings from the lowest) */
    setStringData(frets: number, strings: readonly EditStaffString[]): void {
        const stringList = strings.map(s => new InstrString(s.pitch, s.open))

        const stringData = StringData.fromStrings(frets, stringList)

        // update instrument pitch ranges as necessary
        if (stringList.length > 0) {
            // get new string range bottom and top
            // as we have to choose an int size, INT16 are surely beyond midi pitch limits
            let oldHighestStringPitch = -32768
            let highestStringPitch = -32768
            let lowestStringPitch = 32767
            for (const str of stringList) {
                if (str.pitch > highestStringPitch) {
                    highestStringPitch = str.pitch
                }
                if (str.pitch < lowestStringPitch) {
                    lowestStringPitch = str.pitch
                }
            }
            // get old string range bottom
            for (const str of this.m_instrument.stringData().stringList()) {
                if (str.pitch > oldHighestStringPitch) {
                    oldHighestStringPitch = str.pitch
                }
            }
            // if there were no string, arbitrarily set old top to maxPitchA
            if (oldHighestStringPitch === -32768) {
                oldHighestStringPitch = this.m_instrument.maxPitchA()
            }

            // range bottom is surely the pitch of the lowest string
            this.m_instrument.setMinPitchA(lowestStringPitch)
            this.m_instrument.setMinPitchP(lowestStringPitch)

            // range top should keep the same interval with the highest string it has now
            this.m_instrument.setMaxPitchA(this.m_instrument.maxPitchA() + highestStringPitch - oldHighestStringPitch)
            this.m_instrument.setMaxPitchP(this.m_instrument.maxPitchP() + highestStringPitch - oldHighestStringPitch)

            // update dlg controls
            this.setValues({
                minPitchA: this.m_instrument.minPitchA(),
                maxPitchA: this.m_instrument.maxPitchA(),
                minPitchP: this.m_instrument.minPitchP(),
                maxPitchP: this.m_instrument.maxPitchP(),
            })
            // if no longer there is any string, leave everything as it is now
        }

        // update instrument data and dlg controls
        this.m_instrument.setStringData(stringData)
    }

    /** Apply / OK: the changes are one undo step. Returns false if an instrument name is invalid (nothing applied). */
    apply(): boolean {
        const score = this.m_orgStaff!.score()
        const index = score.undoStack().currentIndex()
        this.applyStaffProperties()
        const ok = this.applyPartProperties()
        score.undoStack().mergeCommands(index)
        return ok
    }

    private applyStaffProperties(): void {
        const v = this.m_values!
        const staffType = this.m_staffType.clone()
        staffType.setLines(v.lines)
        staffType.setLineDistance(new Spatium(v.lineDistance))
        staffType.setGenClef(v.showClef)
        staffType.setGenTimesig(v.showTimesig)
        staffType.setShowBarlines(v.showBarlines)
        staffType.setInvisible(v.invisible)
        staffType.setColor(Color.fromString(v.color))
        staffType.setUserMag(v.mag / 100.0)
        this.m_staffType = staffType

        const config: StaffConfig = {
            visible: this.m_orgStaff!.visible(),
            userDistance: new Spatium(v.extraDistance),
            // C++ leaves config.cutaway at its default (false)
            cutaway: false,
            hideSystemBarline: v.hideSystemBarLine,
            mergeMatchingRests: v.mergeMatchingRests,
            clefTypeList: this.m_clefType!.clone(),
            staffType: staffType.clone(),
            reflectTranspositionInLinkedTab: !v.noReflectTranspositionInLinkedTab,
        }

        this.m_parts.setStaffConfig(this.m_orgStaff!.id(), config)
    }

    private applyPartProperties(): boolean {
        const part = this.m_orgStaff!.part()
        const v = this.m_values!

        const sn = TextBase.validateText(v.shortName)
        const ln = TextBase.validateText(v.longName)
        if (sn === null || ln === null) {
            // C++ interactive()->warning("Invalid instrument name", "The instrument name is invalid.")
            return false
        }
        this.setValues({ shortName: sn, longName: ln }) // show the fixed text

        const intervalIdx = v.intervalIndex
        const upFlag = v.up

        const interval = Interval.allIntervals[intervalIdx].clone()
        interval.diatonic += v.octave * 7
        interval.chromatic += v.octave * 12

        if (!upFlag) {
            interval.flip()
        }

        this.m_instrument.setTranspose(interval)
        this.m_instrument.setMinPitchA(v.minPitchA)
        this.m_instrument.setMaxPitchA(v.maxPitchA)
        this.m_instrument.setMinPitchP(v.minPitchP)
        this.m_instrument.setMaxPitchP(v.maxPitchP)

        this.m_instrument.setShortNames(sn.length > 0 ? [new StaffName(sn, 0)] : [])
        this.m_instrument.setLongNames(ln.length > 0 ? [new StaffName(ln, 0)] : [])

        // C++ masterNotationParts() / notationParts(): the port edits the main score, both are the master's parts
        if (this.m_instrument.id() !== this.m_orgInstrument.id()) {
            this.m_parts.replaceInstrument(this.m_instrumentKey, this.m_instrument)
        } else if (!this.m_instrument.equals(this.m_orgInstrument)) {
            this.m_parts.replaceInstrument(this.m_instrumentKey, this.m_instrument)
        }

        let newSharpFlat = v.preferSharpFlat
        if ((intervalIdx === 0) || (intervalIdx === 25)) {
            // instrument becomes non/octave-transposing, preferSharpFlat isn't useful anymore
            newSharpFlat = PreferSharpFlat.NONE
        }

        if (part.preferSharpFlat() !== newSharpFlat) {
            this.m_parts.setPartSharpFlat(this.m_instrumentKey.partId, newSharpFlat)
        }

        // the dialog stays open (Apply): the edited copies follow the score
        this.m_orgInstrument = new Instrument()
        this.m_orgInstrument.assign(this.m_instrument)
        this.m_instrumentKey.instrumentId = this.m_instrument.id()
        return true
    }
}
