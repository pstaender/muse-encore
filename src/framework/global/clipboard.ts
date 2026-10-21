/*
 * SPDX-License-Identifier: GPL-3.0-only
 * MuseScore-Web — port of MuseScore Studio (https://github.com/musescore/MuseScore)
 * Copyright (C) 2021-2026 MuseScore Limited and others
 *
 * Replacement of Qt's QMimeData and QClipboard (QApplication::clipboard()) used by the notation's copy and paste:
 * an in-memory clipboard of the application. The web UI synchronizes it with the system clipboard (copy/paste
 * events); in node it is the only clipboard.
 */

/** the formats and their data (text) like QMimeData; "text/plain" is the plain text */
export class MimeData {
    private m_data = new Map<string, string>()

    static readonly TEXT_FORMAT = 'text/plain'

    formats(): string[] { return [...this.m_data.keys()] }
    hasFormat(format: string): boolean { return this.m_data.has(format) }
    data(format: string): string { return this.m_data.get(format) ?? '' }
    setData(format: string, data: string): void { this.m_data.set(format, data) }
    removeFormat(format: string): void { this.m_data.delete(format) }

    hasText(): boolean { return this.m_data.has(MimeData.TEXT_FORMAT) }
    text(): string { return this.data(MimeData.TEXT_FORMAT) }
    setText(text: string): void { this.setData(MimeData.TEXT_FORMAT, text) }

    hasImage(): boolean { return false }

    clone(): MimeData {
        const m = new MimeData()
        for (const [f, d] of this.m_data) {
            m.m_data.set(f, d)
        }
        return m
    }
}

type Listener = () => void

/** QClipboard (the application's clipboard) */
export class Clipboard {
    private m_mimeData = new MimeData()
    private m_listeners = new Set<Listener>()

    mimeData(): MimeData { return this.m_mimeData }

    setMimeData(data: MimeData): void {
        this.m_mimeData = data
        for (const l of this.m_listeners) {
            l()
        }
    }

    text(): string { return this.m_mimeData.text() }

    setText(text: string): void {
        const m = new MimeData()
        m.setText(text)
        this.setMimeData(m)
    }

    clear(): void { this.setMimeData(new MimeData()) }

    /** QClipboard::dataChanged */
    onDataChanged(l: Listener): () => void {
        this.m_listeners.add(l)
        return () => this.m_listeners.delete(l)
    }
}

let s_clipboard: Clipboard | null = null

/** C++ QApplication::clipboard() */
export function clipboard(): Clipboard {
    s_clipboard ??= new Clipboard()
    return s_clipboard
}
