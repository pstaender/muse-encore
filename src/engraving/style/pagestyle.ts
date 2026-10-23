/*
 * SPDX-License-Identifier: GPL-3.0-only
 * MuseEncore — port of MuseScore Studio (https://github.com/musescore/MuseScore)
 * Copyright (C) 2021-2026 MuseScore Limited and others
 *
 * Port of src/engraving/style/pagestyle.h/.cpp (TODO(port): PageSizeGetAccessor, PageSizeSetAccessor)
 */

import { Sid } from './styledef'

const s_pageStyles: readonly Sid[] = [
    Sid.pageWidth,
    Sid.pageHeight,
    Sid.pagePrintableWidth,
    Sid.pageEvenTopMargin,
    Sid.pageEvenBottomMargin,
    Sid.pageEvenLeftMargin,
    Sid.pageOddTopMargin,
    Sid.pageOddBottomMargin,
    Sid.pageOddLeftMargin,
    Sid.pageTwosided,
    Sid.spatium,
]

export function pageStyles(): readonly Sid[] {
    return s_pageStyles
}
