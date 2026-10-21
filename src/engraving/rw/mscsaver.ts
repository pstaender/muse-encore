/*
 * SPDX-License-Identifier: GPL-3.0-only
 * MuseScore-Web — port of MuseScore Studio (https://github.com/musescore/MuseScore)
 * Copyright (C) 2021-2026 MuseScore Limited and others
 *
 * Port of src/engraving/rw/mscsaver.h/.cpp
 *
 * TODO(port): thumbnail, images, audio, automation
 */

import type { MasterScore } from '../dom/masterscore'
import type { MscWriter } from '../infrastructure/mscwriter'
import { XmlWriter } from './xmlwriter'
import { Writer, WriteInOutData } from './write/writer'
import type { WriteContext } from './write/writecontext'

export class MscSaver {
    writeMscz(score: MasterScore, mscWriter: MscWriter, _createThumbnail = false, ctx: WriteContext | null = null): boolean {
        if (!mscWriter.isOpened()) {
            return false
        }

        // Write style of MasterScore
        {
            //! NOTE The style is writing to a separate file only for the master score.
            //! At the moment, the style for the parts is still writing to the score file.
            const styleXml = new XmlWriter()
            score.style().write(styleXml)
            mscWriter.writeStyleFile(styleXml.text())
        }

        const masterWriteOutData = new WriteInOutData(score)

        if (ctx) {
            masterWriteOutData.ctx.assign(ctx)
        }

        // Write MasterScore
        {
            const scoreData = Writer.writeScore(score, masterWriteOutData)
            mscWriter.writeScoreFile(scoreData)
        }

        // Write Excerpts
        {
            if (!ctx || !ctx.shouldWriteRange()) {
                const excerpts = score.excerpts()

                for (let excerptIndex = 0; excerptIndex < excerpts.length; ++excerptIndex) {
                    const excerpt = excerpts[excerptIndex]

                    const partScore = excerpt.excerptScore()
                    if (!partScore || partScore === score) {
                        continue
                    }

                    excerpt.updateFileName(excerptIndex)

                    // Write excerpt style
                    {
                        const styleXml = new XmlWriter()
                        partScore.style().write(styleXml)
                        mscWriter.addExcerptStyleFile(excerpt.fileName(), styleXml.text())
                    }

                    // Write excerpt
                    {
                        const excerptData = Writer.writeScore(partScore, masterWriteOutData)
                        mscWriter.addExcerptFile(excerpt.fileName(), excerptData)
                    }
                }
            }
        }

        // Write ChordList
        {
            const chordList = score.chordList()
            if (chordList.customChordList() && !chordList.empty()) {
                const chlXml = new XmlWriter()
                chordList.writeDocument(chlXml)
                mscWriter.writeChordListFile(chlXml.text())
            }
        }

        // TODO(port): images (Pictures/), thumbnail (Thumbnails/thumbnail.png), audio, automation

        return true
    }
}
