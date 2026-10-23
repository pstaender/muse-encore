/*
 * SPDX-License-Identifier: GPL-3.0-only
 * MuseScore-Web — port of MuseScore Studio (https://github.com/musescore/MuseScore)
 *
 * The parts of Qt's QPageSize (qtbase src/gui/painting/qpagesize.cpp, Qt 6, LGPL-3.0/GPL) that MuseScore's Page
 * Settings dialog uses: the standard page sizes (in PageSizeId order) with their names, size(id, unit) and
 * id(size, unit, FuzzyOrientationMatch). The names are Qt's English source strings (translation context "QPageSize";
 * Qt's own translations are not part of MuseScore's).
 */

export enum QPageSizeUnit {
    Millimeter,
    Point,
    Inch,
}

export enum SizeMatchPolicy {
    FuzzyMatch,
    FuzzyOrientationMatch,
    ExactMatch,
}

/** [PageSizeId name, display name, defined in inches, width/height in points, millimeters, inches] */
type StandardPageSize = readonly [string, string, boolean, number, number, number, number, number, number]

const qt_pageSizes: readonly StandardPageSize[] = [
    ['Letter', 'Letter / ANSI A', true, 612, 792, 215.9, 279.4, 8.5, 11],
    ['Legal', 'Legal', true, 612, 1008, 215.9, 355.6, 8.5, 14],
    ['Executive', 'Executive (7.5 x 10 in)', true, 540, 720, 190.5, 254, 7.5, 10],
    ['A0', 'A0', false, 2384, 3370, 841, 1189, 33.11, 46.81],
    ['A1', 'A1', false, 1684, 2384, 594, 841, 23.39, 33.11],
    ['A2', 'A2', false, 1191, 1684, 420, 594, 16.54, 23.39],
    ['A3', 'A3', false, 842, 1191, 297, 420, 11.69, 16.54],
    ['A4', 'A4', false, 595, 842, 210, 297, 8.27, 11.69],
    ['A5', 'A5', false, 420, 595, 148, 210, 5.83, 8.27],
    ['A6', 'A6', false, 297, 420, 105, 148, 4.13, 5.83],
    ['A7', 'A7', false, 210, 297, 74, 105, 2.91, 4.13],
    ['A8', 'A8', false, 148, 210, 52, 74, 2.05, 2.91],
    ['A9', 'A9', false, 105, 148, 37, 52, 1.46, 2.05],
    ['A10', 'A10', false, 73, 105, 26, 37, 1.02, 1.46],
    ['B0', 'B0', false, 2835, 4008, 1000, 1414, 39.37, 55.67],
    ['B1', 'B1', false, 2004, 2835, 707, 1000, 27.83, 39.37],
    ['B2', 'B2', false, 1417, 2004, 500, 707, 19.68, 27.83],
    ['B3', 'B3', false, 1001, 1417, 353, 500, 13.9, 19.68],
    ['B4', 'B4', false, 709, 1001, 250, 353, 9.84, 13.9],
    ['B5', 'B5', false, 499, 709, 176, 250, 6.9, 9.8],
    ['B6', 'B6', false, 354, 499, 125, 176, 4.92, 6.93],
    ['B7', 'B7', false, 249, 354, 88, 125, 3.46, 4.92],
    ['B8', 'B8', false, 176, 249, 62, 88, 2.44, 3.46],
    ['B9', 'B9', false, 125, 176, 44, 62, 1.73, 2.44],
    ['B10', 'B10', false, 88, 125, 31, 44, 1.22, 1.73],
    ['EnvelopeC5', 'Envelope C5', false, 459, 649, 162, 229, 6.38, 9.02],
    ['Envelope10', 'Envelope US 10', true, 297, 684, 104.8, 241.3, 4.12, 9.5],
    ['EnvelopeDL', 'Envelope DL', false, 312, 624, 110, 220, 4.33, 8.66],
    ['Folio', 'Folio (8.27 x 13 in)', false, 595, 935, 210, 330, 8.27, 13],
    ['Ledger', 'Ledger / ANSI B', true, 1224, 792, 431.8, 279.4, 17, 11],
    ['Tabloid', 'Tabloid / ANSI B', true, 792, 1224, 279.4, 431.8, 11, 17],
    ['Custom', 'Custom', false, -1, -1, -1, -1, -1, -1],
    ['A3Extra', 'A3 Extra', false, 913, 1262, 322, 445, 12.67, 17.52],
    ['A4Extra', 'A4 Extra', false, 667, 914, 235.5, 322.3, 9.27, 12.69],
    ['A4Plus', 'A4 Plus', false, 595, 936, 210, 330, 8.27, 13],
    ['A4Small', 'A4 Small', false, 595, 842, 210, 297, 8.27, 11.69],
    ['A5Extra', 'A5 Extra', false, 492, 668, 174, 235, 6.85, 9.25],
    ['B5Extra', 'B5 Extra', false, 570, 782, 201, 276, 7.9, 10.8],
    ['JisB0', 'JIS B0', false, 2920, 4127, 1030, 1456, 40.55, 57.32],
    ['JisB1', 'JIS B1', false, 2064, 2920, 728, 1030, 28.66, 40.55],
    ['JisB2', 'JIS B2', false, 1460, 2064, 515, 728, 20.28, 28.66],
    ['JisB3', 'JIS B3', false, 1032, 1460, 364, 515, 14.33, 20.28],
    ['JisB4', 'JIS B4', false, 729, 1032, 257, 364, 10.12, 14.33],
    ['JisB5', 'JIS B5', false, 516, 729, 182, 257, 7.17, 10.12],
    ['JisB6', 'JIS B6', false, 363, 516, 128, 182, 5.04, 7.17],
    ['JisB7', 'JIS B7', false, 258, 363, 91, 128, 3.58, 5.04],
    ['JisB8', 'JIS B8', false, 181, 258, 64, 91, 2.52, 3.58],
    ['JisB9', 'JIS B9', false, 127, 181, 45, 64, 1.77, 2.52],
    ['JisB10', 'JIS B10', false, 91, 127, 32, 45, 1.26, 1.77],
    ['AnsiC', 'ANSI C', true, 1224, 1584, 431.8, 558.8, 17, 22],
    ['AnsiD', 'ANSI D', true, 1584, 2448, 558.8, 863.6, 22, 34],
    ['AnsiE', 'ANSI E', true, 2448, 3168, 863.6, 1118, 34, 44],
    ['LegalExtra', 'Legal Extra', true, 684, 1080, 241.3, 381, 9.5, 15],
    ['LetterExtra', 'Letter Extra', true, 684, 864, 241.3, 304.8, 9.5, 12],
    ['LetterPlus', 'Letter Plus', true, 612, 914, 215.9, 322.3, 8.5, 12.69],
    ['LetterSmall', 'Letter Small', true, 612, 792, 215.9, 279.4, 8.5, 11],
    ['TabloidExtra', 'Tabloid Extra', true, 864, 1296, 304.8, 457.2, 12, 18],
    ['ArchA', 'Architect A', true, 648, 864, 228.6, 304.8, 9, 12],
    ['ArchB', 'Architect B', true, 864, 1296, 304.8, 457.2, 12, 18],
    ['ArchC', 'Architect C', true, 1296, 1728, 457.2, 609.6, 18, 24],
    ['ArchD', 'Architect D', true, 1728, 2592, 609.6, 914.4, 24, 36],
    ['ArchE', 'Architect E', true, 2592, 3456, 914.4, 1219, 36, 48],
    ['Imperial7x9', '7 x 9 in', true, 504, 648, 177.8, 228.6, 7, 9],
    ['Imperial8x10', '8 x 10 in', true, 576, 720, 203.2, 254, 8, 10],
    ['Imperial9x11', '9 x 11 in', true, 648, 792, 228.6, 279.4, 9, 11],
    ['Imperial9x12', '9 x 12 in', true, 648, 864, 228.6, 304.8, 9, 12],
    ['Imperial10x11', '10 x 11 in', true, 720, 792, 254, 279.4, 10, 11],
    ['Imperial10x13', '10 x 13 in', true, 720, 936, 254, 330.2, 10, 13],
    ['Imperial10x14', '10 x 14 in', true, 720, 1008, 254, 355.6, 10, 14],
    ['Imperial12x11', '12 x 11 in', true, 864, 792, 304.8, 279.4, 12, 11],
    ['Imperial15x11', '15 x 11 in', true, 1080, 792, 381, 279.4, 15, 11],
    ['ExecutiveStandard', 'Executive (7.25 x 10.5 in)', true, 522, 756, 184.2, 266.7, 7.25, 10.5],
    ['Note', 'Note', true, 612, 792, 215.9, 279.4, 8.5, 11],
    ['Quarto', 'Quarto', true, 610, 780, 215.9, 275.1, 8.5, 10.83],
    ['Statement', 'Statement', true, 396, 612, 139.7, 215.9, 5.5, 8.5],
    ['SuperA', 'Super A', false, 643, 1009, 227, 356, 8.94, 14],
    ['SuperB', 'Super B', false, 864, 1380, 305, 487, 12, 19.17],
    ['Postcard', 'Postcard', false, 284, 419, 100, 148, 3.94, 5.83],
    ['DoublePostcard', 'Double Postcard', false, 567, 419, 200, 148, 7.87, 5.83],
    ['Prc16K', 'PRC 16K', false, 414, 610, 146, 215, 5.75, 8.5],
    ['Prc32K', 'PRC 32K', false, 275, 428, 97, 151, 3.82, 5.95],
    ['Prc32KBig', 'PRC 32K Big', false, 275, 428, 97, 151, 3.82, 5.95],
    ['FanFoldUS', 'Fan-fold US (14.875 x 11 in)', true, 1071, 792, 377.8, 279.4, 14.875, 11],
    ['FanFoldGerman', 'Fan-fold German (8.5 x 12 in)', true, 612, 864, 215.9, 304.8, 8.5, 12],
    ['FanFoldGermanLegal', 'Fan-fold German Legal (8.5 x 13 in)', true, 612, 936, 215.9, 330, 8.5, 13],
    ['EnvelopeB4', 'Envelope B4', false, 708, 1001, 250, 353, 9.84, 13.9],
    ['EnvelopeB5', 'Envelope B5', false, 499, 709, 176, 250, 6.9, 9.8],
    ['EnvelopeB6', 'Envelope B6', false, 499, 354, 176, 125, 6.9, 4.9],
    ['EnvelopeC0', 'Envelope C0', false, 2599, 3676, 917, 1297, 36.1, 51.06],
    ['EnvelopeC1', 'Envelope C1', false, 1837, 2599, 648, 917, 25.51, 36.1],
    ['EnvelopeC2', 'Envelope C2', false, 1298, 1837, 458, 648, 18.03, 25.51],
    ['EnvelopeC3', 'Envelope C3', false, 918, 1296, 324, 458, 12.75, 18.03],
    ['EnvelopeC4', 'Envelope C4', false, 649, 918, 229, 324, 9.02, 12.75],
    ['EnvelopeC6', 'Envelope C6', false, 323, 459, 114, 162, 4.49, 6.38],
    ['EnvelopeC65', 'Envelope C65', false, 324, 648, 114, 229, 4.5, 9],
    ['EnvelopeC7', 'Envelope C7', false, 230, 323, 81, 114, 3.19, 4.49],
    ['Envelope9', 'Envelope US 9', true, 279, 639, 98.4, 225.4, 3.875, 8.875],
    ['Envelope11', 'Envelope US 11', true, 324, 747, 114.3, 263.5, 4.5, 10.375],
    ['Envelope12', 'Envelope US 12', true, 342, 792, 120.7, 279.4, 4.75, 11],
    ['Envelope14', 'Envelope US 14', true, 360, 828, 127, 292.1, 5, 11.5],
    ['EnvelopeMonarch', 'Envelope Monarch', true, 279, 540, 98.43, 190.5, 3.875, 7.5],
    ['EnvelopePersonal', 'Envelope Personal', true, 261, 468, 92.08, 165.1, 3.625, 6.5],
    ['EnvelopeChou3', 'Envelope Chou 3', false, 340, 666, 120, 235, 4.72, 9.25],
    ['EnvelopeChou4', 'Envelope Chou 4', false, 255, 581, 90, 205, 3.54, 8],
    ['EnvelopeInvite', 'Envelope Invite', false, 624, 624, 220, 220, 8.66, 8.66],
    ['EnvelopeItalian', 'Envelope Italian', false, 312, 652, 110, 230, 4.33, 9],
    ['EnvelopeKaku2', 'Envelope Kaku 2', false, 680, 941, 240, 332, 9.45, 13],
    ['EnvelopeKaku3', 'Envelope Kaku 3', false, 612, 785, 216, 277, 8.5, 10.9],
    ['EnvelopePrc1', 'Envelope PRC 1', false, 289, 468, 102, 165, 4, 6.5],
    ['EnvelopePrc2', 'Envelope PRC 2', false, 289, 499, 102, 176, 4, 6.9],
    ['EnvelopePrc3', 'Envelope PRC 3', false, 354, 499, 125, 176, 4.9, 6.9],
    ['EnvelopePrc4', 'Envelope PRC 4', false, 312, 590, 110, 208, 4.33, 8.2],
    ['EnvelopePrc5', 'Envelope PRC 5', false, 312, 624, 110, 220, 4.33, 8.66],
    ['EnvelopePrc6', 'Envelope PRC 6', false, 340, 652, 120, 230, 4.7, 9],
    ['EnvelopePrc7', 'Envelope PRC 7', false, 454, 652, 160, 230, 6.3, 9],
    ['EnvelopePrc8', 'Envelope PRC 8', false, 340, 876, 120, 309, 4.7, 12.2],
    ['EnvelopePrc9', 'Envelope PRC 9', false, 649, 918, 229, 324, 9, 12.75],
    ['EnvelopePrc10', 'Envelope PRC 10', false, 918, 1298, 324, 458, 12.75, 18],
    ['EnvelopeYou4', 'Envelope You 4', false, 298, 666, 105, 235, 4.13, 9.25],
]

function qt_pointMultiplier(unit: QPageSizeUnit): number {
    switch (unit) {
    case QPageSizeUnit.Millimeter:
        return 2.83464566929
    case QPageSizeUnit.Point:
        return 1.0
    case QPageSizeUnit.Inch:
        return 72.0
    }
}

/** the page size ids as numbers (QPageSize::PageSizeId) */
export const QPageSize = {
    /** QPageSize::LastPageSize */
    LastPageSize: qt_pageSizes.length - 1,
    Custom: qt_pageSizes.findIndex(s => s[0] === 'Custom'),

    /** the localized name of a standard page size id (English here) */
    name(pageSizeId: number): string {
        return qt_pageSizes[pageSizeId]?.[1] ?? ''
    },

    /** the size of a standard page size id in the units ([width, height]; null for Custom) */
    size(pageSizeId: number, units: QPageSizeUnit): [number, number] | null {
        if (pageSizeId === QPageSize.Custom || !qt_pageSizes[pageSizeId]) {
            return null
        }
        const s = qt_pageSizes[pageSizeId]
        switch (units) {
        case QPageSizeUnit.Millimeter:
            return [s[5], s[6]]
        case QPageSizeUnit.Point:
            return [s[3], s[4]]
        case QPageSizeUnit.Inch:
            return [s[7], s[8]]
        }
    },

    /** QPageSize::id(const QSizeF&, Unit, SizeMatchPolicy) */
    id(width: number, height: number, units: QPageSizeUnit, matchPolicy: SizeMatchPolicy = SizeMatchPolicy.FuzzyMatch): number {
        if (!(width >= 0 && height >= 0)) {
            return QPageSize.Custom
        }

        // Try exact match if units are the same
        const [wi, hi] = units === QPageSizeUnit.Millimeter ? [5, 6] : units === QPageSizeUnit.Inch ? [7, 8] : [3, 4]
        for (let i = 0; i <= QPageSize.LastPageSize; ++i) {
            if (width === qt_pageSizes[i][wi] && height === qt_pageSizes[i][hi]) {
                return i
            }
        }

        // If no exact match then convert to points and try match those (QSizeF::toSize rounds)
        const m = qt_pointMultiplier(units)
        return qt_idForPointSize(Math.round(width * m), Math.round(height * m), matchPolicy)
    },
}

function qt_idForPointSize(width: number, height: number, matchPolicy: SizeMatchPolicy): number {
    // Try exact match in portrait layout
    for (let i = 0; i <= QPageSize.LastPageSize; ++i) {
        if (width === qt_pageSizes[i][3] && height === qt_pageSizes[i][4]) {
            return i
        }
    }

    // If no exact match only try fuzzy if asked
    if (matchPolicy !== SizeMatchPolicy.ExactMatch) {
        // Set up the fuzzy tolerance
        const tolerance = 3 // = approx 1mm
        const minWidth = width - tolerance
        const maxWidth = width + tolerance
        const minHeight = height - tolerance
        const maxHeight = height + tolerance

        // First try fuzzy match in portrait layout
        for (let i = 0; i <= QPageSize.LastPageSize; ++i) {
            const w = qt_pageSizes[i][3]
            const h = qt_pageSizes[i][4]
            if (w >= minWidth && w <= maxWidth && h >= minHeight && h <= maxHeight) {
                return i
            }
        }

        // If FuzzyOrientationMatch then try rotated sizes
        if (matchPolicy === SizeMatchPolicy.FuzzyOrientationMatch) {
            // First try exact match in landscape layout
            for (let i = 0; i <= QPageSize.LastPageSize; ++i) {
                if (width === qt_pageSizes[i][4] && height === qt_pageSizes[i][3]) {
                    return i
                }
            }

            // Then try fuzzy match in landscape layout
            for (let i = 0; i <= QPageSize.LastPageSize; ++i) {
                const w = qt_pageSizes[i][4]
                const h = qt_pageSizes[i][3]
                if (w >= minWidth && w <= maxWidth && h >= minHeight && h <= maxHeight) {
                    return i
                }
            }
        }
    }

    // Otherwise no match so Custom
    return QPageSize.Custom
}
