/*
 * SPDX-License-Identifier: GPL-3.0-only
 * MuseEncore — port of MuseScore Studio (https://github.com/musescore/MuseScore)
 * Copyright (C) 2021-2026 MuseScore Limited and others
 *
 * Port of src/importexport/guitarpro/internal/guitarproconfiguration.h/.cpp (IGuitarProConfiguration) with
 * MuseScore's defaults; guitarProConfiguration() is the module's instance (C++ the injected configuration).
 */

import { EngravingConfiguration } from '../../../engraving/internal/engravingconfiguration'

export class GuitarProConfiguration {
    private m_linkedTabStaffCreated: boolean | null = null
    private m_experimental: boolean | null = null

    linkedTabStaffCreated(): boolean {
        return this.m_linkedTabStaffCreated ?? false
    }

    setLinkedTabStaffCreated(created: boolean | null): void {
        this.m_linkedTabStaffCreated = created
    }

    experimental(): boolean {
        return this.m_experimental ?? false
    }

    setExperimental(experimental: boolean | null): void {
        this.m_experimental = experimental
        // C++ EngravingConfiguration::guitarProImportExperimental() asks this configuration
        EngravingConfiguration.setGuitarProImportExperimental(this.experimental())
    }
}

const s_configuration = new GuitarProConfiguration()

export function guitarProConfiguration(): GuitarProConfiguration {
    return s_configuration
}
