/*
 * SPDX-License-Identifier: GPL-3.0-only
 * MuseEncore — port of MuseScore Studio (https://github.com/musescore/MuseScore)
 * Copyright (C) 2021-2026 MuseScore Limited and others
 *
 * Port of src/project/internal/notationreadersregister.cpp: the readers of the import formats by suffix. The import
 * modules register their readers in importexport/readers.ts (C++ the module's registerExports).
 */

import type { INotationReader } from '../inotationreader'

export class NotationReadersRegister {
    private m_readers = new Map<string, INotationReader>()

    reg(suffixes: readonly string[], reader: INotationReader): void {
        for (const suffix of suffixes) {
            this.m_readers.set(suffix, reader)
        }
    }

    reader(suffix: string): INotationReader | null {
        return this.m_readers.get(suffix) ?? null
    }

    suffixes(): string[] {
        return [...this.m_readers.keys()]
    }
}
