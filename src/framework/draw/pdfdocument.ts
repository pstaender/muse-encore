/*
 * SPDX-License-Identifier: GPL-3.0-only
 * MuseEncore — port of MuseScore Studio (https://github.com/musescore/MuseScore)
 * Copyright (C) 2021-2026 MuseScore Limited and others
 *
 * Not in MuseScore (it uses QPdfWriter): a minimal PDF 1.4 writer for the PDF export (PdfPaintProvider). Pages with
 * compressed content streams, glyph outlines as form XObjects (defined once per document), images (JPEG as is,
 * PNG decoded and compressed with an alpha soft mask), soft masks for PaintMask and graphics states for transparency.
 */

import { zlibSync, unzlibSync } from 'fflate'

const encoder = new TextEncoder()

function latin1(s: string): Uint8Array {
    const out = new Uint8Array(s.length)
    for (let i = 0; i < s.length; ++i) {
        out[i] = s.charCodeAt(i) & 0xff
    }
    return out
}

/** a PDF text string: literal for ASCII, UTF-16BE with BOM otherwise */
export function pdfString(s: string): string {
    if (/^[\x20-\x7e]*$/.test(s)) {
        return `(${s.replace(/[\\()]/g, c => '\\' + c)})`
    }
    let hex = 'FEFF'
    for (let i = 0; i < s.length; ++i) {
        hex += s.charCodeAt(i).toString(16).padStart(4, '0').toUpperCase()
    }
    return `<${hex}>`
}

/** a number for the content stream: at most `digits` decimals, without trailing zeros */
export function pdfNum(v: number, digits = 3): string {
    if (!Number.isFinite(v)) {
        return '0'
    }
    const s = v.toFixed(digits)
    const r = s.includes('.') ? s.replace(/\.?0+$/, '') || '0' : s
    return r === '-0' ? '0' : r
}

interface PdfObject {
    /** the dictionary or value; for a stream the stream dictionary without /Length */
    body: string
    stream?: Uint8Array
}

export interface PdfImage {
    /** the name in the page resources, e.g. "Im3" */
    name: string
    width: number
    height: number
}

export interface PdfDocumentInfo {
    title?: string
    creator?: string
    producer?: string
}

export class PdfDocument {
    private m_objects: (PdfObject | null)[] = []
    private m_pages: number[] = []
    private m_xobjects = new Map<string, number>()
    private m_extGStates = new Map<string, number>()
    private m_extGStateNames = new Map<string, string>()
    private m_glyphNames = new Map<string, string>()
    private m_imageNames = new Map<string, PdfImage | null>()
    private m_nextName = 0
    private readonly m_pagesRef: number
    private readonly m_resourcesRef: number

    constructor(private m_info: PdfDocumentInfo = {}) {
        this.m_pagesRef = this.reserve()
        this.m_resourcesRef = this.reserve()
    }

    private reserve(): number {
        this.m_objects.push(null)
        return this.m_objects.length
    }

    private set(ref: number, obj: PdfObject): void {
        this.m_objects[ref - 1] = obj
    }

    private add(obj: PdfObject): number {
        const ref = this.reserve()
        this.set(ref, obj)
        return ref
    }

    private newName(prefix: string): string {
        return `${prefix}${this.m_nextName++}`
    }

    /** a compressed stream object */
    private addStream(dict: string, data: Uint8Array, compress = true): number {
        if (!compress) {
            return this.add({ body: dict, stream: data })
        }
        return this.add({ body: `${dict} /Filter /FlateDecode`, stream: zlibSync(data, { level: 6 }) })
    }

    /** a form XObject drawn with "/name Do" (its content in its own coordinates, `bbox` in them) */
    addForm(content: string, bbox: [number, number, number, number], extra = ''): string {
        const name = this.newName('Fm')
        const ref = this.addStream(`/Type /XObject /Subtype /Form /BBox [${bbox.map(v => pdfNum(v)).join(' ')}]`
            + ` /Resources ${this.m_resourcesRef} 0 R${extra}`, encoder.encode(content))
        this.m_xobjects.set(name, ref)
        return name
    }

    /** the form XObject of a glyph outline (filled with the current fill color), defined once per key */
    glyph(key: string, make: () => { content: string; bbox: [number, number, number, number] } | null): string {
        let name = this.m_glyphNames.get(key)
        if (name === undefined) {
            const g = make()
            name = g ? this.addForm(g.content, g.bbox) : ''
            this.m_glyphNames.set(key, name)
        }
        return name
    }

    /** a graphics state (e.g. "/ca 0.5 /CA 0.5"), its name for "/name gs" */
    extGState(dict: string): string {
        let name = this.m_extGStateNames.get(dict)
        if (!name) {
            name = this.newName('Gs')
            this.m_extGStates.set(name, this.add({ body: `<< /Type /ExtGState ${dict} >>` }))
            this.m_extGStateNames.set(dict, name)
        }
        return name
    }

    /** a luminosity soft mask: drawn white is visible, black hidden; `content` in the coordinates where it is set */
    softMask(content: string, bbox: [number, number, number, number]): string {
        const group = this.addStream(`/Type /XObject /Subtype /Form /BBox [${bbox.map(v => pdfNum(v)).join(' ')}]`
            + ` /Group << /S /Transparency /CS /DeviceGray >> /Resources ${this.m_resourcesRef} 0 R`, encoder.encode(content))
        return this.extGState(`/SMask << /Type /Mask /S /Luminosity /G ${group} 0 R >>`)
    }

    /** an image XObject of an encoded image (JPEG, PNG); null if the format is not supported */
    image(key: string, data: Uint8Array, mimeType: string, grayscale: boolean): PdfImage | null {
        const cacheKey = `${key}|${grayscale}`
        if (this.m_imageNames.has(cacheKey)) {
            return this.m_imageNames.get(cacheKey)!
        }
        let img: PdfImage | null = null
        if (mimeType === 'image/jpeg' || isJpeg(data)) {
            const info = jpegInfo(data)
            if (info) {
                const cs = info.components === 1 ? '/DeviceGray' : info.components === 4 ? '/DeviceCMYK' : '/DeviceRGB'
                const decode = info.components === 4 && info.adobe ? ' /Decode [1 0 1 0 1 0 1 0]' : ''
                const name = this.newName('Im')
                const ref = this.addStream(`/Type /XObject /Subtype /Image /Width ${info.width} /Height ${info.height}`
                    + ` /ColorSpace ${cs} /BitsPerComponent 8${decode} /Filter /DCTDecode`, data, false)
                this.m_xobjects.set(name, ref)
                img = { name, width: info.width, height: info.height }
            }
        } else if (mimeType === 'image/png' || isPng(data)) {
            const png = decodePng(data)
            if (png) {
                let color = png.rgb
                let cs = '/DeviceRGB'
                if (grayscale) {
                    color = new Uint8Array(png.width * png.height)
                    for (let i = 0; i < color.length; ++i) {
                        color[i] = qGray(png.rgb[3 * i], png.rgb[3 * i + 1], png.rgb[3 * i + 2])
                    }
                    cs = '/DeviceGray'
                }
                let smask = ''
                if (png.alpha) {
                    const m = this.addStream(`/Type /XObject /Subtype /Image /Width ${png.width} /Height ${png.height}`
                        + ' /ColorSpace /DeviceGray /BitsPerComponent 8', png.alpha)
                    smask = ` /SMask ${m} 0 R`
                }
                const name = this.newName('Im')
                const ref = this.addStream(`/Type /XObject /Subtype /Image /Width ${png.width} /Height ${png.height}`
                    + ` /ColorSpace ${cs} /BitsPerComponent 8${smask}`, color)
                this.m_xobjects.set(name, ref)
                img = { name, width: png.width, height: png.height }
            }
        }
        // TODO(port): other image formats (GIF, BMP, WebP, SVG images) are left out of the PDF
        this.m_imageNames.set(cacheKey, img)
        return img
    }

    /** adds a page (size in points) with its content stream */
    addPage(width: number, height: number, content: string): void {
        const contents = this.addStream('', encoder.encode(content))
        this.m_pages.push(this.add({
            body: `<< /Type /Page /Parent ${this.m_pagesRef} 0 R /MediaBox [0 0 ${pdfNum(width)} ${pdfNum(height)}]`
                + ` /Resources ${this.m_resourcesRef} 0 R /Contents ${contents} 0 R >>`,
        }))
    }

    pageCount(): number {
        return this.m_pages.length
    }

    /** the PDF file */
    data(): Uint8Array {
        // one resource dictionary for all pages and forms
        const dict = (m: Map<string, number>): string => [...m].map(([n, r]) => `/${n} ${r} 0 R`).join(' ')
        this.set(this.m_resourcesRef, {
            body: `<< /ProcSet [/PDF /ImageB /ImageC] /XObject << ${dict(this.m_xobjects)} >> /ExtGState << ${dict(this.m_extGStates)} >> >>`,
        })
        this.set(this.m_pagesRef, { body: `<< /Type /Pages /Kids [${this.m_pages.map(p => `${p} 0 R`).join(' ')}] /Count ${this.m_pages.length} >>` })
        const catalog = this.add({ body: `<< /Type /Catalog /Pages ${this.m_pagesRef} 0 R >>` })
        const info = this.m_info
        const infoEntries = [
            info.title !== undefined ? `/Title ${pdfString(info.title)}` : '',
            info.creator !== undefined ? `/Creator ${pdfString(info.creator)}` : '',
            info.producer !== undefined ? `/Producer ${pdfString(info.producer)}` : '',
            `/CreationDate ${pdfString(pdfDate(new Date()))}`,
        ].filter(Boolean).join(' ')
        const infoRef = this.add({ body: `<< ${infoEntries} >>` })

        const chunks: Uint8Array[] = []
        let offset = 0
        const push = (c: Uint8Array): void => {
            chunks.push(c)
            offset += c.length
        }
        push(latin1('%PDF-1.4\n%\xe2\xe3\xcf\xd3\n'))
        const offsets: number[] = []
        this.m_objects.forEach((obj, i) => {
            offsets.push(offset)
            const o = obj ?? { body: 'null' }
            if (o.stream) {
                push(latin1(`${i + 1} 0 obj\n<< ${o.body} /Length ${o.stream.length} >>\nstream\n`))
                push(o.stream)
                push(latin1('\nendstream\nendobj\n'))
            } else {
                push(latin1(`${i + 1} 0 obj\n${o.body}\nendobj\n`))
            }
        })
        const xref = offset
        let table = `xref\n0 ${this.m_objects.length + 1}\n0000000000 65535 f \n`
        for (const o of offsets) {
            table += `${String(o).padStart(10, '0')} 00000 n \n`
        }
        push(latin1(table + `trailer\n<< /Size ${this.m_objects.length + 1} /Root ${catalog} 0 R /Info ${infoRef} 0 R >>\nstartxref\n${xref}\n%%EOF\n`))

        const out = new Uint8Array(offset)
        let pos = 0
        for (const c of chunks) {
            out.set(c, pos)
            pos += c.length
        }
        return out
    }
}

function pdfDate(d: Date): string {
    const p = (n: number): string => String(n).padStart(2, '0')
    return `D:${d.getUTCFullYear()}${p(d.getUTCMonth() + 1)}${p(d.getUTCDate())}${p(d.getUTCHours())}${p(d.getUTCMinutes())}${p(d.getUTCSeconds())}Z`
}

/** Qt's qGray: (r * 11 + g * 16 + b * 5) / 32 */
export function qGray(r: number, g: number, b: number): number {
    return (r * 11 + g * 16 + b * 5) >> 5
}

// ---------------------------------------------------------------------------------
//   images
// ---------------------------------------------------------------------------------

function isJpeg(d: Uint8Array): boolean {
    return d.length > 3 && d[0] === 0xff && d[1] === 0xd8
}

function isPng(d: Uint8Array): boolean {
    return d.length > 8 && d[0] === 0x89 && d[1] === 0x50 && d[2] === 0x4e && d[3] === 0x47
}

/** the size and components of a JPEG (its SOF marker); adobe: an Adobe APP14 marker (inverted CMYK) */
function jpegInfo(d: Uint8Array): { width: number; height: number; components: number; adobe: boolean } | null {
    let i = 2
    let adobe = false
    while (i + 9 < d.length) {
        if (d[i] !== 0xff) {
            return null
        }
        const marker = d[i + 1]
        const len = (d[i + 2] << 8) | d[i + 3]
        if (marker === 0xee) {
            adobe = true
        }
        // SOF0..SOF15 except DHT (C4), JPG (C8), DAC (CC)
        if (marker >= 0xc0 && marker <= 0xcf && marker !== 0xc4 && marker !== 0xc8 && marker !== 0xcc) {
            return { height: (d[i + 5] << 8) | d[i + 6], width: (d[i + 7] << 8) | d[i + 8], components: d[i + 9], adobe }
        }
        i += 2 + len
    }
    return null
}

interface DecodedPng {
    width: number
    height: number
    /** 3 bytes per pixel */
    rgb: Uint8Array
    /** 1 byte per pixel, null if opaque */
    alpha: Uint8Array | null
}

/** decodes a (non-interlaced) PNG to 8 bit RGB and alpha; null if it cannot be decoded */
export function decodePng(d: Uint8Array): DecodedPng | null {
    try {
        const view = new DataView(d.buffer, d.byteOffset, d.byteLength)
        let pos = 8
        let width = 0
        let height = 0
        let depth = 8
        let colorType = 0
        let interlace = 0
        let palette: Uint8Array | null = null
        let trns: Uint8Array | null = null
        const idat: Uint8Array[] = []
        while (pos + 8 <= d.length) {
            const len = view.getUint32(pos)
            const type = String.fromCharCode(d[pos + 4], d[pos + 5], d[pos + 6], d[pos + 7])
            const data = d.subarray(pos + 8, pos + 8 + len)
            if (type === 'IHDR') {
                width = view.getUint32(pos + 8)
                height = view.getUint32(pos + 12)
                depth = data[8]
                colorType = data[9]
                interlace = data[12]
            } else if (type === 'PLTE') {
                palette = data
            } else if (type === 'tRNS') {
                trns = data
            } else if (type === 'IDAT') {
                idat.push(data)
            } else if (type === 'IEND') {
                break
            }
            pos += 12 + len
        }
        if (!width || !height || interlace) {
            return null // TODO(port): interlaced PNGs
        }
        const total = idat.reduce((n, c) => n + c.length, 0)
        const z = new Uint8Array(total)
        let o = 0
        for (const c of idat) {
            z.set(c, o)
            o += c.length
        }
        const raw = unzlibSync(z)
        const channels = colorType === 0 ? 1 : colorType === 2 ? 3 : colorType === 3 ? 1 : colorType === 4 ? 2 : 4
        const bpp = Math.max(1, (channels * depth) >> 3)
        const stride = (width * channels * depth + 7) >> 3
        const lines = new Uint8Array(stride * height)
        let prev = new Uint8Array(stride)
        for (let y = 0; y < height; ++y) {
            const filter = raw[y * (stride + 1)]
            const src = raw.subarray(y * (stride + 1) + 1, (y + 1) * (stride + 1))
            const line = lines.subarray(y * stride, (y + 1) * stride)
            for (let x = 0; x < stride; ++x) {
                const a = x >= bpp ? line[x - bpp] : 0
                const b = prev[x]
                const c = x >= bpp ? prev[x - bpp] : 0
                let v = src[x]
                switch (filter) {
                case 1: v += a; break
                case 2: v += b; break
                case 3: v += (a + b) >> 1; break
                case 4: {
                    const p = a + b - c
                    const pa = Math.abs(p - a)
                    const pb = Math.abs(p - b)
                    const pc = Math.abs(p - c)
                    v += pa <= pb && pa <= pc ? a : pb <= pc ? b : c
                    break
                }
                default: break
                }
                line[x] = v & 0xff
            }
            prev = line
        }
        // the samples as 8 bit values
        const sample = (line: Uint8Array, idx: number): number => {
            if (depth === 8) {
                return line[idx]
            }
            if (depth === 16) {
                return line[2 * idx]
            }
            const perByte = 8 / depth
            const byte = line[Math.floor(idx / perByte)]
            const shift = 8 - depth * (idx % perByte + 1)
            return (byte >> shift) & ((1 << depth) - 1)
        }
        const scale = depth < 8 && colorType !== 3 ? 255 / ((1 << depth) - 1) : 1
        const rgb = new Uint8Array(width * height * 3)
        let alpha: Uint8Array | null = colorType === 4 || colorType === 6 || trns ? new Uint8Array(width * height).fill(255) : null
        const trnsValue = (i: number): number => trns ? (trns[2 * i] << 8) | trns[2 * i + 1] : -1
        for (let y = 0; y < height; ++y) {
            const line = lines.subarray(y * stride, (y + 1) * stride)
            for (let x = 0; x < width; ++x) {
                const p = y * width + x
                let r: number, g: number, b: number
                if (colorType === 3) {
                    const idx = sample(line, x)
                    r = palette ? palette[3 * idx] : 0
                    g = palette ? palette[3 * idx + 1] : 0
                    b = palette ? palette[3 * idx + 2] : 0
                    if (alpha) {
                        alpha[p] = trns && idx < trns.length ? trns[idx] : 255
                    }
                } else if (colorType === 0 || colorType === 4) {
                    const raw0 = sample(line, x * channels)
                    r = g = b = Math.round(raw0 * scale)
                    if (colorType === 4) {
                        alpha![p] = sample(line, x * channels + 1)
                    } else if (alpha && depth !== 16 && raw0 === trnsValue(0)) {
                        alpha[p] = 0
                    }
                } else {
                    r = sample(line, x * channels)
                    g = sample(line, x * channels + 1)
                    b = sample(line, x * channels + 2)
                    if (colorType === 6) {
                        alpha![p] = sample(line, x * channels + 3)
                    } else if (alpha && depth === 8 && r === trnsValue(0) && g === trnsValue(1) && b === trnsValue(2)) {
                        alpha[p] = 0
                    }
                }
                rgb[3 * p] = r
                rgb[3 * p + 1] = g
                rgb[3 * p + 2] = b
            }
        }
        if (alpha && alpha.every(v => v === 255)) {
            alpha = null
        }
        return { width, height, rgb, alpha }
    } catch {
        return null
    }
}
