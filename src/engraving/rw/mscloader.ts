/*
 * SPDX-License-Identifier: GPL-3.0-only
 * MuseScore-Web — port of MuseScore Studio (https://github.com/musescore/MuseScore)
 * Copyright (C) 2021-2026 MuseScore Limited and others
 *
 * Port of src/engraving/rw/mscloader.h/.cpp
 *
 * Only the 4.x reader (read460) is ported. It is also used for 4.0 - 4.5 files.
 * TODO(port): read400/read410 differences, read302/206/114 for older files, excerpts, chord lists, images, audio
 */

import { DefaultStyle } from '../style/defaultstyle'
import { MscReader } from '../infrastructure/mscreader'
import { MasterScore } from '../dom/masterscore'
import { XmlReader } from './xmlreader'
import { Read460 } from './read460/read460'

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
            // TODO(port): chord list, images
        }

        const scoreData = mscReader.readScoreFile()
        if (!scoreData) {
            throw new MscLoadError('no score file found')
        }
        const xml = new XmlReader(scoreData)
        this.readMasterScore(masterScore, xml, scoreData)
        // TODO(port): excerpts (parts), CompatUtils::doCompatibilityConversions
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
                if (score.mscVersion() < 400) {
                    // TODO(port): read302/read206/read114
                    throw new MscLoadError(`files of version ${version} are not supported yet`)
                }
                if (score.mscVersion() < 400) {
                    this.setupDefaultStyle(score, scoreData)
                }
                if (!new Read460().readScoreFile(score, e)) {
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
