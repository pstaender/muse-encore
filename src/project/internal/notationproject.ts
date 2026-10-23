/*
 * SPDX-License-Identifier: GPL-3.0-only
 * MuseEncore — port of MuseScore Studio (https://github.com/musescore/MuseScore)
 * Copyright (C) 2021-2026 MuseScore Limited and others
 *
 * Port of the score creation of src/project/internal/notationproject.cpp (NotationProject::createNew,
 * loadTemplate). Audio settings, view states, file paths and the "needs save" state are not ported.
 */

import { MasterScore } from '../../engraving/dom/masterscore'
import { MscLoader } from '../../engraving/rw/mscloader'
import { MscReader } from '../../engraving/infrastructure/mscreader'
import { MasterNotation } from '../../notation/internal/masternotation'
import { ScoreCreateOptions } from '../../notation/notationtypes'

export class ProjectCreateOptions {
    title = ''
    subtitle = ''
    composer = ''
    lyricist = ''
    copyright = ''

    /**
     * C++ templatePath: here the contents of the template's files (the .mscx file and, if there is one, the
     * score_style.mss of the template directory); null = create from instruments
     */
    template: { mscx: Uint8Array; style?: Uint8Array | null } | null = null

    /**
     * the creation date set for scores created from a template (ISO date, C++ QDate::currentDate()); not set if
     * empty (keeps the result deterministic)
     */
    creationDate = ''

    scoreOptions = new ScoreCreateOptions()
}

function setupScoreMetaTags(masterScore: MasterScore, projectOptions: ProjectCreateOptions): void {
    if (projectOptions.title) {
        masterScore.setMetaTag('workTitle', projectOptions.title)
    }
    if (projectOptions.subtitle) {
        masterScore.setMetaTag('subtitle', projectOptions.subtitle)
    }
    if (projectOptions.composer) {
        masterScore.setMetaTag('composer', projectOptions.composer)
    }
    if (projectOptions.lyricist) {
        masterScore.setMetaTag('lyricist', projectOptions.lyricist)
    }
    if (projectOptions.copyright) {
        masterScore.setMetaTag('copyright', projectOptions.copyright)
    }
    if (projectOptions.template && projectOptions.creationDate) {
        masterScore.setMetaTag('creationDate', projectOptions.creationDate)
    }
}

export class NotationProject {
    private m_masterScore: MasterScore | null = null

    masterScore(): MasterScore | null { return this.m_masterScore }

    createNew(projectOptions: ProjectCreateOptions): MasterScore {
        // Load template if present
        if (projectOptions.template) {
            return this.loadTemplate(projectOptions)
        }

        // Create new engraving project
        const masterScore = new MasterScore()
        this.m_masterScore = masterScore
        setupScoreMetaTags(masterScore, projectOptions)

        // Setup new master score
        new MasterNotation(masterScore).setupNewScore(masterScore, projectOptions.scoreOptions)

        // TODO(port): audio settings, view state
        return masterScore
    }

    loadTemplate(projectOptions: ProjectCreateOptions): MasterScore {
        const template = projectOptions.template!
        const files = new Map<string, Uint8Array>([['template.mscx', template.mscx]])
        if (template.style) {
            files.set('score_style.mss', template.style)
        }
        const masterScore = new MasterScore()
        // C++ NotationProject::load(): also lays out the template and runs the compatibility conversions of old
        // files; templates are 4.x files and their measures are replaced by applyOptions(), so this is skipped
        new MscLoader().loadMscz(masterScore, MscReader.fromFiles(files, { mainFileName: 'template.mscx' }))
        this.m_masterScore = masterScore

        setupScoreMetaTags(masterScore, projectOptions)

        new MasterNotation(masterScore).applyOptions(masterScore, projectOptions.scoreOptions, true /*createdFromTemplate*/)

        return masterScore
    }
}
