/*
 * SPDX-License-Identifier: GPL-3.0-only
 * MuseEncore — port of MuseScore Studio (https://github.com/musescore/MuseScore)
 * Copyright (C) 2021-2026 MuseScore Limited and others
 *
 * Port of src/framework/global/types/translatablestring.h/.cpp
 */

import { arg, mtrc } from '../translation'

export class TranslatableString {
    /** empty: untranslatable */
    readonly context: string
    readonly str: string
    readonly disambiguation: string
    readonly defaultN: number
    private readonly m_args: readonly (string | number)[]

    constructor(context = '', str = '', disambiguation = '', n = -1, args: readonly (string | number)[] = []) {
        this.context = context
        this.str = str
        this.disambiguation = disambiguation
        this.defaultN = n
        this.m_args = args
    }

    static untranslatable(str: string): TranslatableString {
        return new TranslatableString('', str)
    }

    /** from the generated tables ({ context, str, disambiguation?, n? }) */
    static from(t: { context: string; str: string; disambiguation?: string; n?: number } | undefined | null): TranslatableString {
        return t ? new TranslatableString(t.context, t.str, t.disambiguation ?? '', t.n ?? -1) : new TranslatableString()
    }

    isEmpty(): boolean { return this.str.length === 0 }
    isTranslatable(): boolean { return this.context.length > 0 }

    /** the arguments are applied after the translation (C++ TranslatableString::arg) */
    arg(...args: (string | number)[]): TranslatableString {
        return new TranslatableString(this.context, this.str, this.disambiguation, this.defaultN, [...this.m_args, ...args])
    }

    translated(n = this.defaultN): string {
        const res = this.isTranslatable() ? mtrc(this.context, this.str, this.disambiguation, n) : this.str
        return this.m_args.length ? arg(res, ...this.m_args) : res
    }

    equals(other: TranslatableString): boolean {
        return this.context === other.context && this.str === other.str && this.disambiguation === other.disambiguation
            && this.defaultN === other.defaultN && this.m_args.length === other.m_args.length
            && this.m_args.every((a, i) => a === other.m_args[i])
    }
}
