/*
 * SPDX-License-Identifier: GPL-3.0-only
 * MuseEncore — port of MuseScore Studio (https://github.com/musescore/MuseScore)
 * Copyright (C) 2021-2026 MuseScore Limited and others
 *
 * Port of src/importexport/guitarpro/internal/gtp/inoteproperty.h
 */

export class INoteProperty {}

export class BendProperty extends INoteProperty {
    private _destinationOffset = -1
    private _destinationValue = -1
    private _middleOffset1 = -1
    private _middleOffset2 = -1
    private _middleValue = -1
    private _originOffset = -1
    private _originValue = -1

    setDestinationOffset(v: number): void { this._destinationOffset = v }
    setDestinationValue(v: number): void { this._destinationValue = v }
    setMiddleOffset1(v: number): void { this._middleOffset1 = v }
    setMiddleOffset2(v: number): void { this._middleOffset2 = v }
    setMiddleValue(v: number): void { this._middleValue = v }
    setOriginOffset(v: number): void { this._originOffset = v }
    setOriginValue(v: number): void { this._originValue = v }
    destinationOffset(): number { return this._destinationOffset }
    destinationValue(): number { return this._destinationValue }
    middleOffset1(): number { return this._middleOffset1 }
    middleOffset2(): number { return this._middleOffset2 }
    middleValue(): number { return this._middleValue }
    originOffset(): number { return this._originOffset }
    originValue(): number { return this._originValue }
}
