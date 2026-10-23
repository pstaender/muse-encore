/*
 * SPDX-License-Identifier: GPL-3.0-only
 * MuseEncore — port of MuseScore Studio (https://github.com/musescore/MuseScore)
 * Copyright (C) 2021-2026 MuseScore Limited and others
 *
 * Port of src/importexport/imagesexport/internal/imagesexportconfiguration.cpp: the settings of the PDF, PNG and SVG
 * export (the app keeps them; the defaults are MuseScore's).
 */

import { DPI } from '../../../engraving/types/types'

export interface ImagesExportConfiguration {
    exportPdfDpiResolution: number
    exportPdfWithTransparentBackground: boolean
    exportPdfWithGrayscale: boolean
    exportPngDpiResolution: number
    exportPngWithTransparentBackground: boolean
    exportPngWithGrayscale: boolean
    exportSvgWithTransparentBackground: boolean
    exportSvgWithIllustratorCompat: boolean
    /** -1: no trimming (C++ trimMarginPixelSize, set by the command line only) */
    trimMarginPixelSize: number
}

export function defaultImagesExportConfiguration(): ImagesExportConfiguration {
    return {
        exportPdfDpiResolution: DPI,
        exportPdfWithTransparentBackground: false,
        exportPdfWithGrayscale: false,
        exportPngDpiResolution: DPI,
        exportPngWithTransparentBackground: false,
        exportPngWithGrayscale: false,
        exportSvgWithTransparentBackground: false,
        exportSvgWithIllustratorCompat: false,
        trimMarginPixelSize: -1,
    }
}
