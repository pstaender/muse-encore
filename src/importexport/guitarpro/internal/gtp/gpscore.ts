/*
 * SPDX-License-Identifier: GPL-3.0-only
 * MuseEncore — port of MuseScore Studio (https://github.com/musescore/MuseScore)
 * Copyright (C) 2021-2026 MuseScore Limited and others
 *
 * Port of src/importexport/guitarpro/internal/gtp/gpscore.h
 */

export class GPScore {
    private _title = ''
    private _subTitle = ''
    private _artist = ''
    private _album = ''
    private _poet = ''
    private _composer = ''
    private _multiVoice = false

    setTitle(title: string): void { this._title = title }
    title(): string { return this._title }
    setSubTitle(subTitle: string): void { this._subTitle = subTitle }
    subTitle(): string { return this._subTitle }
    setArtist(artist: string): void { this._artist = artist }
    artist(): string { return this._artist }
    setAlbum(album: string): void { this._album = album }
    album(): string { return this._album }
    setPoet(poet: string): void { this._poet = poet }
    poet(): string { return this._poet }
    setComposer(composer: string): void { this._composer = composer }
    composer(): string { return this._composer }
    setMultiVoice(multiVoice: boolean): void { this._multiVoice = multiVoice }
    multiVoice(): boolean { return this._multiVoice }
}
