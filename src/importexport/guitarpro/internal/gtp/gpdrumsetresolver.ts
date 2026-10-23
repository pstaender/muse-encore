/*
 * SPDX-License-Identifier: GPL-3.0-only
 * MuseEncore — port of MuseScore Studio (https://github.com/musescore/MuseScore)
 * Copyright (C) 2021-2026 MuseScore Limited and others
 *
 * Port of src/importexport/guitarpro/internal/gtp/gpdrumsetresolver.h/.cpp
 */

export class GPDrum {
    constructor(
        readonly pitch = -1,
        readonly element = -1,
        readonly variation = -1,
        readonly _name = 'drmkt',
    ) {}
}

export class GPDrumSetResolver {
    private _drum = new Map<string, GPDrum[]>()

    initGPDrum(): void {
        this.addDrum(new GPDrum(35, 0, 0))
        this.addDrum(new GPDrum(36, 0, 0))
        this.addDrum(new GPDrum(36, 6, 1))
        this.addDrum(new GPDrum(37, 1, 2))
        this.addDrum(new GPDrum(38, 1, 0))
        this.addDrum(new GPDrum(42, 10, 0))
        this.addDrum(new GPDrum(43, 5, 0))
        this.addDrum(new GPDrum(44, 11, 0))
        this.addDrum(new GPDrum(45, 6, 0))
        this.addDrum(new GPDrum(46, 10, 2))
        this.addDrum(new GPDrum(47, 7, 0))
        this.addDrum(new GPDrum(48, 8, 0))
        this.addDrum(new GPDrum(49, 13, 0))
        this.addDrum(new GPDrum(50, 9, 0))
        this.addDrum(new GPDrum(51, 15, 0))
        this.addDrum(new GPDrum(52, 16, 0))
        this.addDrum(new GPDrum(53, 15, 2))
        this.addDrum(new GPDrum(55, 14, 0))
        this.addDrum(new GPDrum(56, 3, 0))
        this.addDrum(new GPDrum(57, 12, 0))
        this.addDrum(new GPDrum(91, 1, 1))
        this.addDrum(new GPDrum(92, 10, 1))
        this.addDrum(new GPDrum(93, 15, 1))
        this.addDrum(new GPDrum(99, 2, 0))
        this.addDrum(new GPDrum(102, 4, 0))

        this.addDrum(new GPDrum(0, 0, 0, 'rvs-cymb'))

        this.addDrum(new GPDrum(37, 0, 0, 'snr'))
        this.addDrum(new GPDrum(38, 1, 0, 'snr'))

        this.addDrum(new GPDrum(39, 0, 0, 'hclap'))

        this.addDrum(new GPDrum(87, 2, 1, 'latinoKit'))
        this.addDrum(new GPDrum(54, 3, 0, 'latinoKit'))
        this.addDrum(new GPDrum(54, 3, 1, 'latinoKit'))
        this.addDrum(new GPDrum(112, 3, 3, 'latinoKit'))

        this.addDrum(new GPDrum(58, 0, 0, 'vbrslp'))

        this.addDrum(new GPDrum(67, 0, 0, 'agogoKit'))
        this.addDrum(new GPDrum(68, 1, 0, 'agogoKit'))

        this.addDrum(new GPDrum(63, 4, 0, 'africaKit'))
        this.addDrum(new GPDrum(73, 2, 0, 'africaKit'))
        this.addDrum(new GPDrum(74, 2, 2, 'africaKit'))
        this.addDrum(new GPDrum(109, 3, 2, 'africaKit'))
        this.addDrum(new GPDrum(110, 4, 1, 'africaKit'))

        this.addDrum(new GPDrum(62, 1, 2, 'cngKit'))
        this.addDrum(new GPDrum(63, 1, 0, 'cngKit'))
        this.addDrum(new GPDrum(64, 0, 0, 'cngKit'))

        this.addDrum(new GPDrum(65, 0, 0, 'snthdrm'))

        this.addDrum(new GPDrum(65, 1, 0, 'tmblKit'))
        this.addDrum(new GPDrum(66, 0, 0, 'tmblKit'))

        this.addDrum(new GPDrum(65, 0, 0, 'mldctm'))

        this.addDrum(new GPDrum(66, 0, 0, 'taiko'))

        this.addDrum(new GPDrum(69, 0, 0, 'cbs'))
        this.addDrum(new GPDrum(69, 0, 1, 'cbs'))
        this.addDrum(new GPDrum(117, 0, 2, 'cbs'))

        this.addDrum(new GPDrum(70, 0, 0, 'mrcs'))

        this.addDrum(new GPDrum(71, 0, 0, 'whstlKit'))
        this.addDrum(new GPDrum(72, 1, 0, 'whstlKit'))

        this.addDrum(new GPDrum(73, 0, 0, 'guiro'))
        this.addDrum(new GPDrum(73, 0, 1, 'guiro'))
        this.addDrum(new GPDrum(74, 0, 2, 'guiro'))

        this.addDrum(new GPDrum(75, 0, 0, 'clvs'))
        this.addDrum(new GPDrum(75, 5, 0, 'clvs'))

        this.addDrum(new GPDrum(76, 0, 0, 'wdblckKit'))
        this.addDrum(new GPDrum(77, 1, 0, 'wdblckKit'))

        this.addDrum(new GPDrum(78, 0, 0, 'cuicaKit'))
        this.addDrum(new GPDrum(79, 1, 0, 'cuicaKit'))

        this.addDrum(new GPDrum(80, 0, 1, 'trngl'))
        this.addDrum(new GPDrum(81, 0, 0, 'trngl'))

        this.addDrum(new GPDrum(82, 0, 0, 'shkr'))
        this.addDrum(new GPDrum(82, 0, 1, 'shkr'))

        this.addDrum(new GPDrum(83, 0, 0, 'jngl-bell'))

        this.addDrum(new GPDrum(84, 0, 0, 'bell-tree'))
        this.addDrum(new GPDrum(123, 0, 2, 'bell-tree'))

        this.addDrum(new GPDrum(85, 0, 0, 'cstnt'))

        this.addDrum(new GPDrum(86, 0, 1, 'surdo'))
        this.addDrum(new GPDrum(86, 0, 0, 'surdo'))

        this.addDrum(new GPDrum(102, 0, 0, 'cowbell'))

        this.addDrum(new GPDrum(51, 0, 0, 'sambaKit'))
        this.addDrum(new GPDrum(93, 0, 1, 'sambaKit'))
        this.addDrum(new GPDrum(53, 0, 2, 'sambaKit'))
        this.addDrum(new GPDrum(102, 1, 0, 'sambaKit'))
        this.addDrum(new GPDrum(56, 2, 0, 'sambaKit'))
        this.addDrum(new GPDrum(99, 3, 0, 'sambaKit'))
        this.addDrum(new GPDrum(99, 3, 0, 'sambaKit'))
        this.addDrum(new GPDrum(77, 4, 0, 'sambaKit'))
        this.addDrum(new GPDrum(76, 5, 0, 'sambaKit'))
        this.addDrum(new GPDrum(66, 6, 0, 'sambaKit'))
        this.addDrum(new GPDrum(65, 7, 0, 'sambaKit'))

        this.addDrum(new GPDrum(61, 0, 0, 'bngKit'))
        this.addDrum(new GPDrum(106, 0, 2, 'bngKit'))
        this.addDrum(new GPDrum(107, 0, 1, 'bngKit'))
        this.addDrum(new GPDrum(60, 1, 0, 'bngKit'))
        this.addDrum(new GPDrum(104, 1, 2, 'bngKit'))
        this.addDrum(new GPDrum(105, 1, 1, 'bngKit'))
        this.addDrum(new GPDrum(108, 2, 1, 'bngKit'))
        this.addDrum(new GPDrum(64, 2, 0, 'bngKit'))
        this.addDrum(new GPDrum(109, 2, 2, 'bngKit'))
        this.addDrum(new GPDrum(63, 3, 0, 'bngKit'))
        this.addDrum(new GPDrum(110, 3, 1, 'bngKit'))
        this.addDrum(new GPDrum(62, 3, 2, 'bngKit'))

        this.addDrum(new GPDrum(61, 0, 0, 'conbon'))
        this.addDrum(new GPDrum(106, 0, 2, 'conbon'))
        this.addDrum(new GPDrum(107, 0, 1, 'conbon'))
        this.addDrum(new GPDrum(60, 1, 0, 'conbon'))
        this.addDrum(new GPDrum(104, 1, 2, 'conbon'))
        this.addDrum(new GPDrum(105, 1, 1, 'conbon'))
        this.addDrum(new GPDrum(108, 2, 1, 'conbon'))
        this.addDrum(new GPDrum(64, 2, 0, 'conbon'))
        this.addDrum(new GPDrum(109, 2, 2, 'conbon'))
        this.addDrum(new GPDrum(63, 3, 0, 'conbon'))
        this.addDrum(new GPDrum(110, 3, 1, 'conbon'))
        this.addDrum(new GPDrum(62, 3, 2, 'conbon'))

        this.addDrum(new GPDrum(108, 0, 1, 'cngKit'))
        this.addDrum(new GPDrum(109, 0, 2, 'cngKit'))
        this.addDrum(new GPDrum(110, 1, 1, 'cngKit'))
        this.addDrum(new GPDrum(111, 0, 2, 'tmbrn'))
        this.addDrum(new GPDrum(112, 0, 3, 'tmbrn'))

        this.addDrum(new GPDrum(113, 0, 4, 'tmbrn'))
        this.addDrum(new GPDrum(54, 0, 0, 'tmbrn'))

        this.addDrum(new GPDrum(114, 0, 0, 'ptt'))
        this.addDrum(new GPDrum(115, 0, 0, 'grcss'))
        this.addDrum(new GPDrum(118, 0, 2, 'mrcs'))

        this.addDrum(new GPDrum(119, 0, 0, '2Mrcs'))
        this.addDrum(new GPDrum(122, 0, 2, 'shkr'))
    }

    pitch(element: number, variation: number, name: string): number {
        const drums = this._drum.get(name)
        if (!drums) {
            return 0
        }

        for (const drum of drums) {
            if (drum._name.includes(name)) {
                if (drum.element === element && drum.variation === variation) {
                    return drum.pitch
                }
            }
        }

        return 0
    }

    private addDrum(drum: GPDrum): void {
        let list = this._drum.get(drum._name)
        if (!list) {
            list = []
            this._drum.set(drum._name, list)
        }
        list.push(drum)
    }
}
