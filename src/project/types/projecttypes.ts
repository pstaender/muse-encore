/*
 * SPDX-License-Identifier: GPL-3.0-only
 * MuseEncore — port of MuseScore Studio (https://github.com/musescore/MuseScore)
 * Copyright (C) 2021-2026 MuseScore Limited and others
 *
 * Port of parts of src/project/types/projecttypes.h (the migration of scores of older versions)
 */

export enum MigrationType {
    Unknown = 'Unknown',
    Pre_3_6 = 'Pre_3_6',
    Ver_3_6 = 'Ver_3_6',
}

export function allMigrationTypes(): MigrationType[] {
    return [MigrationType.Pre_3_6, MigrationType.Ver_3_6]
}

export class MigrationOptions {
    // common
    appVersion = 0
    isApplyMigration = false
    isAskAgain = true

    isApplyLeland = true
    isApplyEdwin = true
    isRemapPercussion = true

    isValid(): boolean { return this.appVersion !== 0 }

    static from(o: Partial<MigrationOptions>): MigrationOptions {
        return Object.assign(new MigrationOptions(), o)
    }
}
