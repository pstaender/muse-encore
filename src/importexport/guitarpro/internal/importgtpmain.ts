/*
 * SPDX-License-Identifier: GPL-3.0-only
 * MuseEncore — port of MuseScore Studio (https://github.com/musescore/MuseScore)
 * Copyright (C) 2021-2026 MuseScore Limited and others
 *
 * Port of importGTP and addMetaInfo of src/importexport/guitarpro/internal/importgtp.cpp. They are not in
 * importgtp.ts: the readers of GP4-7 (importgtp-gp*.ts) extend the GuitarPro class of importgtp.ts, which would be an
 * import cycle.
 */

import { Buffer } from '../../../framework/global/io/buffer'
import { mtrc } from '../../../framework/global/translation'
import { Err } from '../../../engraving/engravingerrors'
import { scoreDummy } from '../../../engraving/compat/dummyelement'
import { Factory } from '../../../engraving/dom/factory'
import type { MasterScore } from '../../../engraving/dom/masterscore'
import type { MeasureBase } from '../../../engraving/dom/measurebase'
import { Text } from '../../../engraving/dom/text'
import { BarLineType, TextStyleType } from '../../../engraving/types/types'
import * as drumset from './guitarprodrumset'
import { GuitarPro, GuitarPro1, GuitarPro2, GuitarPro3, cstr, fromUtf8OrAscii } from './importgtp'
import { GuitarPro4 } from './importgtp-gp4'
import { GuitarPro5 } from './importgtp-gp5'
import { GuitarPro6 } from './importgtp-gp6'
import { GuitarPro7 } from './importgtp-gp7'
import { PowerTab } from './importptb'

export { Err }

//---------------------------------------------------------
//   addMetaInfo
//---------------------------------------------------------

function addMetaInfo(score: MasterScore, gp: GuitarPro, experimental: boolean): void {
    const fieldNames = [gp.title, gp.subtitle, gp.artist, gp.album, gp.composer]

    const createTitleField = fieldNames.some(fieldName => fieldName.length > 0)

    if (!createTitleField && !experimental) {
        return
    }

    let m: MeasureBase | null = null
    if (!score.measures().first()) {
        m = Factory.createTitleVBox(scoreDummy(score).system())
        score.measures().append(m)
    } else {
        m = score.measures().first()!
        if (!m.isVBox()) {
            const mb = Factory.createTitleVBox(scoreDummy(score).system())
            score.addMeasure(mb, m)
            m = mb
        }
    }
    if (gp.title.length || experimental) {
        const s = new Text(m, TextStyleType.TITLE)
        s.setPlainText(gp.title)
        m.add(s)
    }
    if (gp.subtitle.length || gp.artist.length || gp.album.length || experimental) {
        const s = new Text(m, TextStyleType.SUBTITLE)
        let str = ''
        if (gp.subtitle.length) {
            str += gp.subtitle
        }
        if (gp.artist.length) {
            if (str.length) {
                str += '\n'
            }
            str += gp.artist
        }
        if (gp.album.length) {
            if (str.length) {
                str += '\n'
            }
            str += gp.album
        }
        s.setPlainText(str)
        m.add(s)
    }
    if (gp.composer.length) {
        const s = new Text(m, TextStyleType.COMPOSER)
        s.setPlainText(gp.composer)
        m.add(s)
    }

    if (gp.poet.length || experimental) {
        const s = new Text(scoreDummy(score), TextStyleType.LYRICIST)
        if (gp.poet.length) {
            s.setPlainText(mtrc('iex_guitarpro', 'Words by %1').replace('%1', gp.poet))
        }

        m.add(s)
    }
}

//---------------------------------------------------------
//   importGTP
//---------------------------------------------------------

/** C++ importGTP(MasterScore*, IODevice*, iocCtx, experimental): reads a Guitar Pro or Power Tab file into the score */
export function importGTP(score: MasterScore, data: Uint8Array | Buffer, experimental = false): Err {
    const io = data instanceof Buffer ? data : new Buffer(data)
    if (!io.open()) {
        return Err.FileOpenError
    }

    score.checkChordList()
    io.seek(0)
    const headerBytes = io.read(4)
    const header = String.fromCharCode(...cstr(headerBytes))
    io.seek(0)
    if (header === 'ptab') {
        const ptb = new PowerTab(io, score)
        return ptb.read()
    }

    let gp: GuitarPro | null = null
    let readResult = false
    let isVersionAbove6 = false
    // check to see if we are dealing with a GP file via the extension
    if (header === 'PK\x03\x04') {
        gp = new GuitarPro7(score)
        readResult = gp.read(io)
        gp.setTempo(0, null)
        isVersionAbove6 = true
    } else if (header === 'BCFZ') {
        // check to see if we are dealing with a GPX file via the extension
        gp = new GuitarPro6(score)
        drumset.initGuitarProDrumset()
        readResult = gp.read(io)
        gp.setTempo(0, null)
        isVersionAbove6 = true
    } else if (header.slice(1) === 'FIC') {
        // otherwise it's an older version - check the header
        const l = io.read(1)[0] ?? 0
        const ss = io.read(30)
        const s0 = fromUtf8OrAscii(cstr(ss.subarray(0, Math.min(l, ss.length))))
        let s: string
        if (s0.startsWith('FICHIER GUITAR PRO ')) {
            s = s0.slice(20)
        } else if (s0.startsWith('FICHIER GUITARE PRO ')) {
            s = s0.slice(21)
        } else {
            console.debug(`unknown gtp format <${s0}>`)
            return Err.FileBadFormat
        }
        const a = toInt(s.slice(0, 1))
        const b = toInt(s.slice(2))
        const version = a * 100 + b
        if (a === 1) {
            gp = new GuitarPro1(score, version)
        } else if (a === 2) {
            gp = new GuitarPro2(score, version)
        } else if (a === 3) {
            gp = new GuitarPro3(score, version)
        } else if (a === 4) {
            gp = new GuitarPro4(score, version)
        } else if (a === 5) {
            gp = new GuitarPro5(score, version)
        } else {
            console.debug(`unknown gtp format ${version}`)
            return Err.FileBadFormat
        }
        readResult = gp.read(io)
        gp.setTempo(0, null)
    } else {
        return Err.FileBadFormat
    }
    if (readResult === false) {
        console.debug('guitar pro import error====')
        // avoid another error message box
        return Err.NoError
    }

    if (!isVersionAbove6) {
        addMetaInfo(score, gp, experimental)
    }

    let idx = 0

    for (let m1 = score.firstMeasure(); m1; m1 = m1.nextMeasure(), ++idx) {
        if (!gp.bars.length) {
            break
        }
        const bar = gp.bars[idx]
        if (!bar) {
            // C++ reads past the end of the bars (undefined behavior)
            break
        }
        if (bar.barLine !== BarLineType.NORMAL && bar.barLine !== BarLineType.END_REPEAT && bar.barLine !== BarLineType.START_REPEAT
            && bar.barLine !== BarLineType.END_START_REPEAT) {
            m1.setEndBarLineType(bar.barLine, 0)
        }
    }
    if (score.lastMeasure() && score.lastMeasure()!.endBarLineType() !== BarLineType.NORMAL) {
        score.lastMeasure()!.setEndBarLineType(BarLineType.END, 0)
    }

    for (const part of score.parts()) {
        for (const instrument of part.instruments().values()) {
            instrument.updateInstrumentId()
        }
    }

    score.setUpTempoMap()
    for (const p of score.parts()) {
        p.updateHarmonyChannels(false)
    }

    return Err.NoError
}

/** muse::String::toInt(): 0 unless the (trimmed) text is an integer */
function toInt(s: string): number {
    const m = /^\s*([+-]?\d+)\s*$/.exec(s)
    return m ? parseInt(m[1], 10) : 0
}
