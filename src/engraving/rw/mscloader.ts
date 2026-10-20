/*
 * SPDX-License-Identifier: GPL-3.0-only
 * MuseScore-Web — port of MuseScore Studio (https://github.com/musescore/MuseScore)
 * Copyright (C) 2021-2026 MuseScore Limited and others
 *
 * Port of src/engraving/rw/mscloader.h/.cpp
 *
 * Readers: read460 (4.x, incl. the read400/read410 differences), read302 (3.x), read206 (2.x).
 * TODO(port): read114 (1.x files), excerpts, images, audio
 */

import { DefaultStyle } from '../style/defaultstyle'
import { MscReader } from '../infrastructure/mscreader'
import { MasterScore } from '../dom/masterscore'
import { XmlReader } from './xmlreader'
import { Read206 } from './read206/read206'
import { CompatConversions } from './compat/compatconversions'
import { Read302 } from './read302/read302'
import { Read460 } from './read460/read460'
import { Sid } from '../style/styledef'
import { ChordStylePreset } from '../types/types'

export const MSC_VERSION = 470

export class MscLoadError extends Error {}

export class MscLoader {
    loadMscz(masterScore: MasterScore, mscReader: MscReader): void {
        if (!mscReader.isOpened()) {
            throw new MscLoadError('file open error')
        }
        if (mscReader.isContainer()) {
            const styleData = mscReader.readStyleFile()
            if (styleData && styleData.length) {
                masterScore.style().readDocument(styleData)
                masterScore.styleChanged()
            }

            // Read ChordList
            let chordListOk = false
            const chordListData = mscReader.readChordListFile()
            if (chordListData && chordListData.length) {
                chordListOk = masterScore.chordList().readDevice(chordListData)
            }

            masterScore.chordList().setCustomChordList(chordListOk)

            if (!chordListOk) {
                // See also ReadChordListHook::validate()
                const custom = (masterScore.style().styleV(Sid.chordStyle) as ChordStylePreset) === ChordStylePreset.CUSTOM
                masterScore.chordList().setCustomChordList(custom)

                // Ensure that `checkChordList` loads the default chord list
                masterScore.chordList().unload()
            }
            // TODO(port): images
        }

        const scoreData = mscReader.readScoreFile()
        if (!scoreData) {
            throw new MscLoadError('no score file found')
        }
        const xml = new XmlReader(scoreData)
        this.readMasterScore(masterScore, xml, scoreData)
        // TODO(port): excerpts (parts)

        // Compatibility conversions
        // NOTE: must be done after all score and parts have been read
        CompatConversions.doCompatibilityConversions(masterScore)
    }

    readMasterScore(score: MasterScore, e: XmlReader, scoreData: Uint8Array): void {
        while (e.readNextStartElement()) {
            if (e.name() === 'museScore') {
                const version = e.attribute('version')
                const sl = version.split('.')
                score.setMscVersion(parseInt(sl[0], 10) * 100 + parseInt(sl[1] ?? '0', 10))
                if (score.mscVersion() > MSC_VERSION) {
                    throw new MscLoadError('file too new')
                }
                if (score.mscVersion() <= 114) {
                    // TODO(port): read114
                    throw new MscLoadError(`files of version ${version} are not supported yet`)
                }
                if (score.mscVersion() < 400) {
                    this.setupDefaultStyle(score, scoreData)
                }
                if (score.mscVersion() >= 400) {
                    // make sure we have a chord list; load the default chord list otherwise
                    score.checkChordList()
                }
                // C++ makeReader(): RWRegister::reader(version)
                const reader = score.mscVersion() <= 207 ? new Read206() : score.mscVersion() < 400 ? new Read302() : new Read460()
                if (!reader.readScoreFile(score, e)) {
                    throw new MscLoadError(`bad format: ${e.errorString()}`)
                }
                return
            } else {
                e.unknown()
            }
        }
        throw new MscLoadError(`file critically corrupted: ${e.errorString()}`)
    }

    /** compat::ReadStyleHook::setupDefaultStyle() for files older than 4.0 */
    private setupDefaultStyle(score: MasterScore, scoreData: Uint8Array): void {
        let defaultsVersion = styleDefaultByMscVersion(score.mscVersion())
        const e = new XmlReader(scoreData)
        while (!e.atEnd()) {
            e.readNext()
            if (e.isStartElement() && e.name() === 'defaultsVersion') {
                defaultsVersion = e.readInt()
                break
            }
        }
        score.setStyle(DefaultStyle.resolveStyleDefaults(defaultsVersion))
        score.style().setDefaultStyleVersion(defaultsVersion)
    }
}

function styleDefaultByMscVersion(mscVer: number): number {
    if (mscVer > 301 && mscVer < 400) {
        return 302
    }
    if (mscVer > 206 && mscVer <= 301) {
        return 301
    }
    if (mscVer > 114 && mscVer <= 206) {
        return 206
    }
    if (mscVer <= 114) {
        return 114
    }
    return MSC_VERSION
}

/** convenience: load an .mscz or .mscx file into a new MasterScore */
export function loadScore(data: Uint8Array | ArrayBuffer): MasterScore {
    const score = new MasterScore()
    new MscLoader().loadMscz(score, new MscReader(data))
    return score
}
