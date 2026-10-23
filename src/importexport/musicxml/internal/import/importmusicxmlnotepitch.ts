/*
 * SPDX-License-Identifier: GPL-3.0-only
 * MuseEncore — port of MuseScore Studio (https://github.com/musescore/MuseScore)
 * Copyright (C) 2021-2026 MuseScore Limited and others
 *
 * Port of src/importexport/musicxml/internal/import/importmusicxmlnotepitch.h/.cpp
 */

import { Accidental, AccidentalBracket } from '../../../../engraving/dom/accidental'
import { AccidentalType } from '../../../../engraving/dom/accidentaldata'
import { Factory } from '../../../../engraving/dom/factory'
import type { Score } from '../../../../engraving/dom/score'
import { scoreDummy } from '../../../../engraving/compat/dummyelement'
import type { XmlStreamReader } from '../../../../engraving/rw/xmlreader'
import { AccidentalRole, ElementType } from '../../../../engraving/types/types'
import { Color } from '../../../../framework/draw/types/color'
import { MusicXmlSupport, microtonalGuess, musicXmlString2accidentalType, strToDouble, strToInt } from '../shared/musicxmlsupport'
import type { MusicXmlLogger } from './importmusicxmllogger'

//---------------------------------------------------------
//   accidental
//---------------------------------------------------------

/**
 Parse the /score-partwise/part/measure/note/accidental node.
 Return the result as an Accidental.
 */

// TODO: split in reading parameters versus creation

function accidental(e: XmlStreamReader, score: Score): Accidental | null {
    const cautionary = e.asciiAttribute('cautionary') === 'yes'
    const editorial = e.asciiAttribute('editorial') === 'yes'
    const parentheses = e.asciiAttribute('parentheses') === 'yes'
    const noParentheses = e.asciiAttribute('parentheses') === 'no'
    const brackets = e.asciiAttribute('bracket') === 'yes'
    const noBrackets = e.asciiAttribute('bracket') === 'no'
    const smallAccid = e.asciiAttribute('size') === 'cue' || e.asciiAttribute('size') === 'grace-cue'
    const accColor = Color.fromString(e.asciiAttribute('color'))
    const smufl = e.attribute('smufl')

    const s = e.readText()
    const type = musicXmlString2accidentalType(s, smufl)

    if (type !== AccidentalType.NONE) {
        const a = Factory.createItem(ElementType.ACCIDENTAL, scoreDummy(score)) as Accidental
        a.setAccidentalType(type)
        if (cautionary || editorial) { // no way to tell one from the other
            a.setRole(AccidentalRole.USER)
        } // except via the use of parentheses vs. brackets
        if (noParentheses || noBrackets) { // explicitly none wanted
        } else if (parentheses || cautionary) { // set to "yes" or "cautionary" and not set at all
            a.setBracket(AccidentalBracket.PARENTHESIS)
        } else if (brackets || editorial) { // set to "yes" or "editorial" and not set at all
            a.setBracket(AccidentalBracket.BRACKET)
        }
        if (accColor.isValid()) {
            a.setColor(accColor)
        }
        a.setSmall(smallAccid)
        return a
    }

    return null
}

//---------------------------------------------------------
//   musicXmlNotePitch
//---------------------------------------------------------

/**
 Parse the note pitch related part of the /score-partwise/part/measure/note node.
 */

export class MusicXmlNotePitch {
    private m_acc: Accidental | null = null                             // created based on accidental element
    private m_accType = AccidentalType.NONE         // set by pitch() based on alter value (can be microtonal)
    private m_alter = 0
    private m_tuning = 0.0
    private m_displayStep = -1                                  // invalid
    private m_displayOctave = -1                                // invalid
    private m_octave = -1
    private m_step = 0
    private m_unpitched = false
    private m_logger: MusicXmlLogger                          // Error logger

    constructor(logger: MusicXmlLogger) {
        this.m_logger = logger
    }

    acc(): Accidental | null { return this.m_acc }
    accType(): AccidentalType { return this.m_accType }
    alter(): number { return this.m_alter }
    tuning(): number { return this.m_tuning }
    displayOctave(): number { return this.m_displayOctave }
    displayStep(): number { return this.m_displayStep }
    octave(): number { return this.m_octave }
    step(): number { return this.m_step }
    unpitched(): boolean { return this.m_unpitched }

    //---------------------------------------------------------
    //   displayStepOctave
    //---------------------------------------------------------

    /**
     Handle <display-step> and <display-octave> for <rest> and <unpitched>
     */

    displayStepOctave(e: XmlStreamReader): void {
        while (e.readNextStartElement()) {
            if (e.name() === 'display-step') {
                const step = e.readText()
                const pos = 'CDEFGAB'.indexOf(step)
                if (step.length === 1 && pos >= 0 && pos < 7) {
                    this.m_displayStep = pos
                }
            } else if (e.name() === 'display-octave') {
                const oct = e.readText()
                const ok = { v: false }
                this.m_displayOctave = strToInt(oct, ok)
                if (!ok.v || this.m_displayOctave < 0 || this.m_displayOctave > 9) {
                    this.m_displayOctave = -1
                }
            } else {
                e.skipCurrentElement()                         // TODO log
            }
        }
    }

    //---------------------------------------------------------
    //   pitch
    //---------------------------------------------------------

    /**
     Parse the /score-partwise/part/measure/note/pitch node.
     */

    pitch(e: XmlStreamReader): void {
        // defaults
        this.m_step = -1
        this.m_alter = 0
        this.m_tuning = 0.0
        this.m_octave = -1

        while (e.readNextStartElement()) {
            if (e.name() === 'alter') {
                const alter = e.readText()
                const ok = { v: false }
                this.m_alter = MusicXmlSupport.stringToInt(alter, ok)             // fractions not supported by mscore
                if (!ok.v || this.m_alter < -2 || this.m_alter > 2) {
                    this.m_logger.logError(`invalid alter '${alter}'`, e)
                    const ok2 = { v: false }
                    const altervalue = strToDouble(alter, ok2)
                    if (ok2.v && (Math.abs(altervalue) < 2.0) && (this.m_accType === AccidentalType.NONE)) {
                        // try to see if a microtonal accidental is needed
                        this.m_accType = microtonalGuess(altervalue)

                        // If it's not a microtonal accidental we will use tuning
                        if (this.m_accType === AccidentalType.NONE) {
                            this.m_tuning = 100 * altervalue
                        }
                    }
                    this.m_alter = 0
                }
            } else if (e.name() === 'octave') {
                const oct = e.readText()
                const ok = { v: false }
                this.m_octave = strToInt(oct, ok)
                if (!ok.v || this.m_octave < 0 || this.m_octave > 9) {
                    this.m_logger.logError(`invalid octave '${oct}'`, e)
                    this.m_octave = -1
                }
            } else if (e.name() === 'step') {
                const step = e.readText()
                const pos = 'CDEFGAB'.indexOf(step)
                if (step.length === 1 && pos >= 0 && pos < 7) {
                    this.m_step = pos
                } else {
                    this.m_logger.logError(`invalid step '${step}'`, e)
                }
            } else {
                // TODO skipLogCurrElem();
            }
        }
    }

    //---------------------------------------------------------
    //   readProperties
    //---------------------------------------------------------

    /**
     Handle selected child elements of the /score-partwise/part/measure/note node.
     Return true if handled.
     */

    readProperties(e: XmlStreamReader, score: Score): boolean {
        const tag = e.name()

        if (tag === 'accidental') {
            this.m_acc = accidental(e, score)
            return true
        } else if (tag === 'unpitched') {
            this.m_unpitched = true
            this.displayStepOctave(e)
            return true
        } else if (tag === 'pitch') {
            this.pitch(e)
            return true
        }
        return false
    }
}
