/*
 * SPDX-License-Identifier: GPL-3.0-only
 * MuseEncore — port of MuseScore Studio (https://github.com/musescore/MuseScore)
 * Copyright (C) 2021-2026 MuseScore Limited and others
 *
 * Port of src/importexport/musicxml/internal/import/importmusicxmlnoteduration.h/.cpp
 */

import { TDuration } from '../../../../engraving/dom/durationtype'
import type { XmlStreamReader } from '../../../../engraving/rw/xmlreader'
import { Fraction } from '../../../../engraving/types/fraction'
import { TConv } from '../../../../engraving/types/typesconv'
import { DurationType } from '../../../../engraving/types/types'
import { strToInt } from '../shared/musicxmlsupport'
import type { MusicXmlLogger } from './importmusicxmllogger'
import type { MusicXmlParserPass1 } from './importmusicxmlpass1'

//---------------------------------------------------------
//   noteTypeToFraction
//---------------------------------------------------------

/**
 Convert MusicXML note type to fraction.
 */

function noteTypeToFraction(type: string): Fraction {
    switch (type) {
    case '1024th': return new Fraction(1, 1024)
    case '512th': return new Fraction(1, 512)
    case '256th': return new Fraction(1, 256)
    case '128th': return new Fraction(1, 128)
    case '64th': return new Fraction(1, 64)
    case '32nd': return new Fraction(1, 32)
    case '16th': return new Fraction(1, 16)
    case 'eighth': return new Fraction(1, 8)
    case 'quarter': return new Fraction(1, 4)
    case 'half': return new Fraction(1, 2)
    case 'whole': return new Fraction(1, 1)
    case 'breve': return new Fraction(2, 1)
    case 'long': return new Fraction(4, 1)
    case 'maxima': return new Fraction(8, 1)
    default: return new Fraction(0, 0)
    }
}

//---------------------------------------------------------
//   calculateFraction
//---------------------------------------------------------

/**
 Convert note type, number of dots and actual and normal notes into a duration
 */

function calculateFraction(type: string, dots: number, timeMod: Fraction): Fraction {
    // type
    let f = noteTypeToFraction(type)
    if (f.isValid()) {
        // dot(s)
        let ff = f
        for (let i = 0; i < dots; ++i) {
            ff = ff.times(new Fraction(1, 2))
            f = f.plus(ff)
        }
        // tuplet
        if (timeMod.isValid()) {
            f = f.times(timeMod)
        }
        // clean up (just in case)
        f = f.reduced()
    }
    return f
}

//---------------------------------------------------------
//   MusicXmlNoteDuration
//---------------------------------------------------------

/**
 Parse the note time related part of the /score-partwise/part/measure/note node.
 */

export class MusicXmlNoteDuration {
    private readonly m_divs: number                                  // the current divisions value
    private m_dots = 0
    private m_calcDura = new Fraction()
    private m_specDura = new Fraction()
    private m_dura = new Fraction()
    private m_normalType = new TDuration()
    private m_timeMod = new Fraction(1, 1)                       // default to no time modification
    private m_pass1: MusicXmlParserPass1
    private m_logger: MusicXmlLogger                              ///< Error logger

    constructor(divs: number, logger: MusicXmlLogger, pass1: MusicXmlParserPass1) {
        this.m_divs = divs
        this.m_pass1 = pass1
        this.m_logger = logger
    }

    /** duration to use */
    duration(): Fraction { return this.m_dura }
    /** value calculated from note type etcetera */
    calculatedDuration(): Fraction { return this.m_calcDura }
    /** value read from the duration element */
    specifiedDuration(): Fraction { return this.m_specDura }
    dots(): number { return this.m_dots }
    normalType(): TDuration { return this.m_normalType }
    timeMod(): Fraction { return this.m_timeMod }

    //---------------------------------------------------------
    //   checkTiming
    //---------------------------------------------------------

    /**
     Do timing error checks.
     Return empty string if OK, message in case of error.
     */

    checkTiming(type: string, rest: boolean, grace: boolean): string {
        let errorStr = ''

        // normalize duration
        if (this.m_specDura.isValid()) {
            this.m_specDura = this.m_specDura.reduced()
        }

        // default: use calculated duration
        this.m_calcDura = calculateFraction(type, this.m_dots, this.m_timeMod)
        if (this.m_calcDura.isValid()) {
            this.m_dura = this.m_calcDura
        }

        if (this.m_specDura.isValid() && this.m_calcDura.isValid()) {
            if (this.m_specDura.ne(this.m_calcDura)) {
                errorStr = `calculated duration (${this.m_calcDura.toString()}) not equal to specified duration (${this.m_specDura.toString()})`

                if (rest && type === 'whole' && this.m_specDura.isValid()) {
                    // Sibelius whole measure rest (not an error)
                    errorStr = ''
                    this.m_dura = this.m_specDura
                } else if (grace && this.m_specDura.eq(new Fraction(0, 1))) {
                    // grace note (not an error)
                    errorStr = ''
                    this.m_dura = this.m_specDura
                } else {
                    if (Math.abs(this.m_calcDura.ticks() - this.m_specDura.ticks()) <= this.m_pass1.maxDiff()) {
                        errorStr += ' -> assuming rounding error'
                        this.m_pass1.insertAdjustedDuration(this.m_dura, this.m_calcDura)
                        this.m_dura = this.m_calcDura
                        this.m_specDura = this.m_calcDura // prevent changing off time
                    } else {
                        errorStr += ' -> using calculated duration'
                    }
                }

                // Special case:
                // Encore generates rests in tuplets w/o <tuplet> or <time-modification>.
                // Detect this by comparing the actual duration with the expected duration
                // based on note type. If actual is 2/3 of expected, the rest is part
                // of a tuplet.
                if (rest) {
                    if (2 * this.m_calcDura.ticks() === 3 * this.m_specDura.ticks()) {
                        this.m_timeMod = new Fraction(2, 3)
                        errorStr += errorStr === '' ? ' ->' : ','
                        errorStr += ' assuming triplet'
                        this.m_dura = this.m_specDura
                    }
                }
            }
        } else if (this.m_specDura.isValid() && !this.m_calcDura.isValid()) {
            // do not report an error for typeless (whole measure) rests
            if (!(rest && type === '')) {
                errorStr = 'calculated duration invalid, using specified duration'
            }
            this.m_dura = this.m_specDura
        } else if (!this.m_specDura.isValid() && this.m_calcDura.isValid()) {
            if (!grace) {
                errorStr = 'specified duration invalid, using calculated duration'
            }
        } else {
            errorStr = 'calculated and specified duration invalid, using 4/4'
            this.m_dura = new Fraction(4, 4)
        }

        this.m_pass1.insertSeenDenominator(this.m_dura.reduced().denominator())
        return errorStr
    }

    //---------------------------------------------------------
    //   duration
    //---------------------------------------------------------

    /**
     Parse the /score-partwise/part/measure/note/duration node.
     */

    private readDuration(e: XmlStreamReader): void {
        this.m_logger.logDebugTrace('MusicXmlParserPass1::duration', e)

        this.m_specDura = new Fraction(0, 0)          // invalid unless set correctly
        const intDura = strToInt(e.readAsciiText())
        this.m_specDura = this.m_pass1.calcTicks(intDura, this.m_divs, e) // Duration reading (and rounding) code consolidated to pass1
    }

    //---------------------------------------------------------
    //   readProperties
    //---------------------------------------------------------

    /**
     Handle selected child elements of the /score-partwise/part/measure/note/duration node.
     Return true if handled.
     */

    readProperties(e: XmlStreamReader): boolean {
        const tag = e.name()
        if (tag === 'dot') {
            this.m_dots++
            e.skipCurrentElement()  // skip but don't log
            return true
        } else if (tag === 'duration') {
            this.readDuration(e)
            return true
        } else if (tag === 'time-modification') {
            this.timeModification(e)
            return true
        }
        return false
    }

    //---------------------------------------------------------
    //   timeModification
    //---------------------------------------------------------

    /**
     Parse the /score-partwise/part/measure/note/time-modification node.
     */

    private timeModification(e: XmlStreamReader): void {
        this.m_logger.logDebugTrace('MusicXmlParserPass1::timeModification', e)

        let strActual = ''
        let strNormal = ''

        while (e.readNextStartElement()) {
            const tag = e.name()
            if (tag === 'actual-notes') {
                strActual = e.readText()
            } else if (tag === 'normal-notes') {
                strNormal = e.readText()
            } else if (tag === 'normal-type') {
                // "measure" is not a valid normal-type,
                // but would be accepted by setType()
                const strNormalType = e.readText()
                if (strNormalType !== 'measure') {
                    this.m_normalType.setType(TConv.fromXmlDurationType(strNormalType, DurationType.V_INVALID))
                }
            } else {
                this.m_logger.logDebugInfo(`skipping '${e.name()}'`, e)
                e.skipCurrentElement()
            }
        }

        const intActual = strToInt(strActual)
        const intNormal = strToInt(strNormal)
        if (intActual > 0 && intNormal > 0) {
            this.m_timeMod = new Fraction(intNormal, intActual)
        } else {
            this.m_timeMod = new Fraction(1, 1)
            this.m_logger.logError(`illegal time-modification: actual-notes ${strActual} normal-notes ${strNormal}`, e)
        }
    }
}
