/*
 * SPDX-License-Identifier: GPL-3.0-only
 * MuseScore-Web — port of MuseScore Studio (https://github.com/musescore/MuseScore)
 * Copyright (C) 2021-2026 MuseScore Limited and others
 *
 * Port of src/project/internal/projectmigrator.cpp: the migration of scores of MuseScore 3 and older (new default
 * fonts Leland and Edwin, the new mapping of MDL percussion, the improved default style settings).
 *
 * Not like C++: asking about the migration (the migration dialog, the stored options of ProjectConfiguration) is up to
 * the app, which passes the options to migrateEngravingProjectIfNeed() (asynchronous dialogs; C++ asks synchronously
 * in the middle of NotationProject::doLoad). Without options nothing is migrated (like MuseScore's converter).
 */

import { Sid } from '../../engraving/style/styledef'
import { SymId } from '../../engraving/types/symid'
import { Constants } from '../../engraving/types/constants'
import { TranslatableString } from '../../framework/global/types/translatablestring'
import { ChangeMetaText } from '../../engraving/editing/editscoreproperties'
import { engravingStyleResource } from '../../engraving/engravingmodule'
import { styleDefaultByMscVersion } from '../../engraving/rw/mscloader'
import { MdlMigrator, type TemplateFileProvider } from './mdlmigrator'
import { MigrationType, type MigrationOptions } from '../types/projecttypes'
import type { MasterScore } from '../../engraving/dom/masterscore'
import type { Score } from '../../engraving/dom/score'

const LELAND_STYLE_PATH = 'migration-306-style-Leland.mss'
const EDWIN_STYLE_PATH = 'migration-306-style-Edwin.mss'

/** the migration type of a score, Unknown if it needs no migration (4.0 and newer) */
export function migrationTypeFromMscVersion(mscVersion: number): MigrationType {
    if (mscVersion < 302) {
        return MigrationType.Pre_3_6
    }

    if (mscVersion < 400) {
        return MigrationType.Ver_3_6
    }

    return MigrationType.Unknown
}

export class ProjectMigrator {
    private m_resetStyleSettings = false

    constructor(private templateFile: TemplateFileProvider | null = null) {}

    /**
     * migrationOptions: C++ configuration()->migrationOptions(migrationType), asked about by the app if isAskAgain
     * (askAboutMigration); null: no migration
     */
    migrateEngravingProjectIfNeed(score: MasterScore, migrationOptions: MigrationOptions | null): boolean {
        if (score.mscVersion() >= 400) {
            return true
        }
        //! NOTE If the migration is not done, then the default style for the score is determined by the version.
        //! When migrating, the version becomes the current one, so remember the version of the default style before migrating
        score.style().setDefaultStyleVersion(styleDefaultByMscVersion(score.mscVersion()))
        this.m_resetStyleSettings = true

        if (!migrationOptions || !migrationOptions.isApplyMigration) {
            return true
        }

        const ok = this.migrateProject(score, migrationOptions)
        if (!ok) {
            console.error('failed migration')
        }

        return ok
    }

    private resetStyleSettings(score: MasterScore): void {
        // there are a few things that need to be updated no matter which version the score is from (#10499)
        // primarily, the differences made concerning barline thickness and distance
        // these updates take place no matter whether or not the other migration options are checked
        const sp = score.style().spatium()
        const style = score.style()
        style.set(Sid.dynamicsFontSize, 10.0)
        let doubleBarDistance = style.styleMM(Sid.doubleBarDistance)
        doubleBarDistance -= style.styleMM(Sid.doubleBarWidth)
        style.set(Sid.doubleBarDistance, doubleBarDistance / sp)
        let endBarDistance = style.styleMM(Sid.endBarDistance)
        endBarDistance -= (style.styleMM(Sid.barWidth) + style.styleMM(Sid.endBarWidth)) / 2
        style.set(Sid.endBarDistance, endBarDistance / sp)
        let repeatBarlineDotSeparation = style.styleMM(Sid.repeatBarlineDotSeparation)
        const dotWidth = score.engravingFont().width(SymId.repeatDot, 1.0)
        repeatBarlineDotSeparation -= (style.styleMM(Sid.barWidth) + dotWidth) / 2
        style.set(Sid.repeatBarlineDotSeparation, repeatBarlineDotSeparation / sp)
        score.resetStyleValue(Sid.measureSpacing)
    }

    private resetCrossBeams(score: MasterScore): boolean {
        score.setResetCrossBeams()
        return true
    }

    private migrateProject(score: MasterScore, opt: MigrationOptions): boolean {
        score.startCmd(new TranslatableString('undoableAction', 'Migrate project'))

        let ok = true
        if (opt.isApplyLeland) {
            ok = this.applyLelandStyle(score)
            this.m_resetStyleSettings = false
        }

        if (ok && opt.isApplyEdwin) {
            ok = this.applyEdwinStyle(score)
            this.m_resetStyleSettings = false
        }

        if (ok && opt.isRemapPercussion) {
            new MdlMigrator(score, this.templateFile).remapPercussion()
        }

        if (ok && score.mscVersion() < 300) {
            ok = this.resetAllElementsPositions(score)
        }

        if (ok && score.mscVersion() <= 206) {
            ok = this.resetCrossBeams(score)
        }

        if (ok && score.mscVersion() !== Constants.MSC_VERSION) {
            score.undo(new ChangeMetaText(score, 'mscVersion', Constants.MSC_VERSION_STR))
        }

        if (ok && this.m_resetStyleSettings) {
            this.resetStyleSettings(score)
            score.setLayoutAll()
        }
        score.endCmd()

        return ok
    }

    private applyStyle(score: MasterScore, path: string): boolean {
        const styleFile = engravingStyleResource(path)
        if (styleFile === undefined) {
            return false
        }
        for (const excerpt of score.excerpts()) {
            const excerptScore: Score | null = excerpt.excerptScore()
            if (excerptScore && !excerptScore.loadStyle(styleFile, /*ign*/ false, /*overlap*/ true)) {
                return false
            }
        }

        return score.loadStyle(styleFile, /*ign*/ false, /*overlap*/ true)
    }

    private applyLelandStyle(score: MasterScore): boolean {
        return this.applyStyle(score, LELAND_STYLE_PATH)
    }

    private applyEdwinStyle(score: MasterScore): boolean {
        return this.applyStyle(score, EDWIN_STYLE_PATH)
    }

    private resetAllElementsPositions(score: MasterScore): boolean {
        score.setResetAutoplace()
        return true
    }
}
