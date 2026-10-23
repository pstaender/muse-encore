/*
 * SPDX-License-Identifier: GPL-3.0-only
 * MuseEncore — port of MuseScore Studio (https://github.com/musescore/MuseScore)
 * Copyright (C) 2021-2026 MuseScore Limited and others
 *
 * Replacement of muse::ICryptographicHash (src/framework/global/internal/cryptographichash.cpp, QCryptographicHash).
 * Only MD4 is implemented (used by the ImageStore to name the images of a score, RFC 1320).
 */

export enum CryptographicHashAlgorithm {
    Md4,
}

function rotl(x: number, n: number): number {
    return (x << n) | (x >>> (32 - n))
}

/** MD4 digest (16 bytes) of the data (RFC 1320) */
function md4(data: Uint8Array): Uint8Array {
    // padding: 0x80, zeros, 64 bit length in bits (little endian)
    const bitLen = data.length * 8
    const padded = new Uint8Array(((data.length + 8) >> 6) * 64 + 64)
    padded.set(data)
    padded[data.length] = 0x80
    const view = new DataView(padded.buffer)
    view.setUint32(padded.length - 8, bitLen >>> 0, true)
    view.setUint32(padded.length - 4, Math.floor(bitLen / 0x100000000), true)

    let a = 0x67452301
    let b = 0xefcdab89
    let c = 0x98badcfe
    let d = 0x10325476

    const x = new Array<number>(16)
    const F = (x1: number, y: number, z: number): number => (x1 & y) | (~x1 & z)
    const G = (x1: number, y: number, z: number): number => (x1 & y) | (x1 & z) | (y & z)
    const H = (x1: number, y: number, z: number): number => x1 ^ y ^ z

    for (let off = 0; off < padded.length; off += 64) {
        for (let i = 0; i < 16; ++i) {
            x[i] = view.getUint32(off + i * 4, true)
        }
        const aa = a
        const bb = b
        const cc = c
        const dd = d

        // round 1
        const r1 = (p: number, q: number, r: number, s: number, k: number, sh: number): number => rotl((p + F(q, r, s) + x[k]) | 0, sh)
        for (let i = 0; i < 16; i += 4) {
            a = r1(a, b, c, d, i, 3)
            d = r1(d, a, b, c, i + 1, 7)
            c = r1(c, d, a, b, i + 2, 11)
            b = r1(b, c, d, a, i + 3, 19)
        }

        // round 2
        const r2 = (p: number, q: number, r: number, s: number, k: number, sh: number): number =>
            rotl((p + G(q, r, s) + x[k] + 0x5a827999) | 0, sh)
        for (let i = 0; i < 4; ++i) {
            a = r2(a, b, c, d, i, 3)
            d = r2(d, a, b, c, i + 4, 5)
            c = r2(c, d, a, b, i + 8, 9)
            b = r2(b, c, d, a, i + 12, 13)
        }

        // round 3
        const r3 = (p: number, q: number, r: number, s: number, k: number, sh: number): number =>
            rotl((p + H(q, r, s) + x[k] + 0x6ed9eba1) | 0, sh)
        for (const i of [0, 2, 1, 3]) {
            a = r3(a, b, c, d, i, 3)
            d = r3(d, a, b, c, i + 8, 9)
            c = r3(c, d, a, b, i + 4, 11)
            b = r3(b, c, d, a, i + 12, 15)
        }

        a = (a + aa) | 0
        b = (b + bb) | 0
        c = (c + cc) | 0
        d = (d + dd) | 0
    }

    const out = new Uint8Array(16)
    const ov = new DataView(out.buffer)
    ov.setUint32(0, a >>> 0, true)
    ov.setUint32(4, b >>> 0, true)
    ov.setUint32(8, c >>> 0, true)
    ov.setUint32(12, d >>> 0, true)
    return out
}

export const CryptographicHash = {
    hash(data: Uint8Array, alg: CryptographicHashAlgorithm): Uint8Array {
        switch (alg) {
        case CryptographicHashAlgorithm.Md4:
            return md4(data)
        }
        return new Uint8Array(0)
    },
}
