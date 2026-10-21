/*
 * SPDX-License-Identifier: GPL-3.0-only
 * MuseScore-Web — port of MuseScore Studio (https://github.com/musescore/MuseScore)
 * Copyright (C) 2021-2026 MuseScore Limited and others
 *
 * Port of src/engraving/infrastructure/eid.h/.cpp
 *
 * An EID is a pair of 64 bit numbers; in files it is written as "<base64 first>_<base64 second>" (least significant
 * digit first). The port keeps EIDs as these strings (EIDRegister keys); this file creates and parses them.
 */

const SEPARATOR = '_'
const CHARS = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/'

function toBase64Chars(n: bigint): string {
    let s = ''
    do {
        s += CHARS[Number(n % 64n)]
        n = n / 64n
    } while (n !== 0n)
    return s
}

function base64StrToInt64(s: string): bigint | null {
    let result = 0n
    for (let i = s.length - 1; i >= 0; --i) {
        const v = CHARS.indexOf(s[i])
        if (v < 0) {
            return null
        }
        result = (result << 6n) | BigInt(v)
    }
    return result & 0xFFFFFFFFFFFFFFFFn
}

function randomUint64(): bigint {
    const a = new Uint32Array(2)
    globalThis.crypto.getRandomValues(a)
    return (BigInt(a[0]) << 32n) | BigInt(a[1])
}

export class EID {
    constructor(private readonly m_first = -1n, private readonly m_second = -1n) {}

    static invalid(): EID { return new EID() }

    isValid(): boolean { return this.m_first !== -1n && this.m_second !== -1n }

    first(): bigint { return this.m_first }
    second(): bigint { return this.m_second }

    toStdString(): string {
        return toBase64Chars(this.m_first) + SEPARATOR + toBase64Chars(this.m_second)
    }

    static fromStdString(s: string): EID {
        const strings = s.split(SEPARATOR)
        if (strings.length !== 2) {
            return EID.invalid()
        }
        const first = base64StrToInt64(strings[0])
        const second = base64StrToInt64(strings[1])
        if (first === null || second === null) {
            return EID.invalid()
        }
        return new EID(first, second)
    }

    static newUnique(): EID {
        return new EID(randomUint64(), randomUint64())
    }

    /** FOR UNIT TESTING: EIDs are created sequentially instead of randomly for test repeatability */
    static newUniqueTestMode(maxVal: { value: bigint }): EID {
        ++maxVal.value
        return new EID(maxVal.value, maxVal.value)
    }

    static updateMaxValTestMode(curEID: EID, maxVal: { value: bigint }): void {
        if (curEID.m_first > maxVal.value) {
            maxVal.value = curEID.m_first
        }
        if (curEID.m_second > maxVal.value) {
            maxVal.value = curEID.m_second
        }
    }
}
