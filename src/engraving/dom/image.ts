/*
 * SPDX-License-Identifier: GPL-3.0-only
 * MuseScore-Web — port of MuseScore Studio (https://github.com/musescore/MuseScore)
 * Copyright (C) 2021-2026 MuseScore Limited and others
 *
 * Port of src/engraving/dom/image.h/.cpp
 *
 * The image data comes from the ImageStore (images of the .mscz Pictures/ folder, or added with loadFromData()).
 * Raster images are kept encoded (Pixmap) and decoded by the paint provider; SVG images are drawn as images too
 * (svgrenderer.ts). loadFromFile() is not available (no file system; C++ only reads files outside of the .mscz if
 * allowReadingImagesFromOutsideMscz(), which is false).
 */

import { PointF, SizeF, type RectF } from '../../framework/draw/types/geometry'
import type { Pixmap } from '../../framework/draw/types/pixmap'
import { ImageProvider } from '../../framework/draw/internal/imageprovider'
import { SvgRenderer } from '../../framework/draw/svgrenderer'
import type { PropertyValue } from '../types/propertyvalue'
import { DPMM, ElementType } from '../types/types'
import { Grip, type EditData } from '../editing/editdata'
import { BSymbol } from './bsymbol'
import { ElementFlag } from './engravingitem'
import type { EngravingObject } from './engravingobject'
import { imageStore, type ImageStoreItem } from './imagestore'
import { Pid } from './property'

export enum ImageType {
    NONE, RASTER, SVG,
}

const defaultAutoScale = false
const defaultLockAspectRatio = true
const defaultSizeIsSpatium = true

function suffix(path: string): string {
    const name = path.substring(path.lastIndexOf('/') + 1)
    const i = name.lastIndexOf('.')
    return i >= 0 ? name.substring(i + 1) : ''
}

export class Image extends BSymbol {
    private m_storeItem: ImageStoreItem | null = null
    private m_storePath = '' // the path of the img in the ImageStore
    private m_size = new SizeF(0.0, 0.0) // in mm or spatium units
    private m_lockAspectRatio = defaultLockAspectRatio
    private m_autoScale = defaultAutoScale // fill parent frame
    private m_sizeIsSpatium = defaultSizeIsSpatium
    private m_dirty = false

    private m_rasterDoc: Pixmap | null = null
    private m_svgDoc: SvgRenderer | null = null

    private m_imageType = ImageType.NONE

    constructor(parent: EngravingObject | null) {
        super(ElementType.IMAGE, parent, ElementFlag.MOVABLE)
    }

    /** C++ copy constructor */
    protected override onCloned(original: this): void {
        super.onCloned(original)
        this.m_size = original.m_size.clone()
        if (this.m_storeItem) {
            this.m_storeItem.reference(this)
        }
        if (this.m_imageType === ImageType.SVG) {
            this.m_svgDoc = original.m_svgDoc ? new SvgRenderer(this.m_storeItem!.buffer(), this.m_storeItem!.hashName()) : null
        }
        this.setZ(original.z())
    }

    setImageType(t: ImageType): void {
        this.m_imageType = t
        if (this.m_imageType === ImageType.SVG) {
            this.m_svgDoc = null
        } else if (this.m_imageType === ImageType.RASTER) {
            this.m_rasterDoc = null
        }
        // else C++ LOGD("illegal image type")
    }

    imageType(): ImageType { return this.m_imageType }
    isValid(): boolean { return !!this.m_rasterDoc || !!this.m_svgDoc }

    svgRenderer(): SvgRenderer | null { return this.m_svgDoc }
    rasterImage(): Pixmap | null { return this.m_rasterDoc }

    imageSize(): SizeF {
        if (!this.isValid()) {
            return new SizeF()
        }

        if (this.m_imageType === ImageType.RASTER) {
            return new SizeF(this.m_rasterDoc!.width(), this.m_rasterDoc!.height())
        }

        return this.m_svgDoc!.defaultSize()
    }

    isImageFramed(): boolean {
        const p = this.explicitParent()
        if (!p) {
            return false
        }
        return p.isBox()
    }

    imageAspectRatio(): number {
        return this.m_size.width() / this.m_size.height()
    }

    setSize(s: SizeF): void { this.m_size = s.clone() }
    size(): SizeF { return this.m_size }

    updateImageHeight(height: number): void {
        const aspectRatio = this.imageAspectRatio()

        this.m_size.setHeight(height)

        if (this.m_lockAspectRatio) {
            this.m_size.setWidth(height * aspectRatio)
        }
    }

    updateImageWidth(width: number): void {
        const aspectRatio = this.imageAspectRatio()

        this.m_size.setWidth(width)

        if (this.m_lockAspectRatio) {
            this.m_size.setHeight(width / aspectRatio)
        }
    }

    imageHeight(): number { return this.m_size.height() }
    imageWidth(): number { return this.m_size.width() }
    lockAspectRatio(): boolean { return this.m_lockAspectRatio }
    setLockAspectRatio(v: boolean): void { this.m_lockAspectRatio = v }
    autoScale(): boolean { return this.m_autoScale }
    setAutoScale(v: boolean): void { this.m_autoScale = v }
    storeItem(): ImageStoreItem | null { return this.m_storeItem }
    sizeIsSpatium(): boolean { return this.m_sizeIsSpatium }
    setSizeIsSpatium(val: boolean): void { this.m_sizeIsSpatium = val }

    storePath(): string { return this.m_storePath }
    setStorePath(p: string): void { this.m_storePath = p }

    dirty(): boolean { return this.m_dirty }
    setDirty(val: boolean): void { this.m_dirty = val }

    loadFromStore(storePath: string): boolean {
        this.m_storePath = storePath
        if (!storePath) {
            return false
        }

        this.m_storeItem = imageStore.getImage(storePath)
        if (!this.m_storeItem) {
            return false
        }
        this.m_storeItem.reference(this)

        const sfx = suffix(storePath)
        if (sfx === 'svg' || sfx === 'svgz') {
            this.setImageType(ImageType.SVG)
        } else {
            this.setImageType(ImageType.RASTER)
        }

        return true
    }

    /** load image from data and put into ImageStore; return true on success */
    loadFromData(name: string, ba: Uint8Array): boolean {
        this.m_storeItem = imageStore.add(name, ba)
        this.m_storeItem.reference(this)

        if (name.endsWith('svg') || name.endsWith('svgz')) {
            this.setImageType(ImageType.SVG)
        } else {
            this.setImageType(ImageType.RASTER)
        }
        return true
    }

    /** C++ loadFromFile(path): reading files is not possible here */
    loadFromFile(_path: string): boolean {
        // TODO(port): no file system access (C++ only used if allowReadingImagesFromOutsideMscz())
        return false
    }

    override needStartEditingAfterSelecting(): boolean { return true }
    override gripsCount(): number { return 2 }
    override initialEditModeGrip(): Grip { return Grip.END }
    override defaultGrip(): Grip { return Grip.END }

    override gripsPositions(_ed?: EditData): PointF[] {
        const r: RectF = this.pageBoundingRect()
        return [
            new PointF(r.x() + r.width(), r.y() + r.height() * 0.5),
            new PointF(r.x() + r.width() * 0.5, r.y() + r.height()),
        ]
    }

    override isEditable(): boolean { return true }

    override startDragGrip(data: EditData): void {
        super.startDragGrip(data)
        const eed = data.getData(this)!

        eed.pushProperty(Pid.SIZE)
    }

    override dragGrip(ed: EditData): void {
        if (ed.curGrip === Grip.MIDDLE) {
            this.setOffset(this.offset().plus(ed.evtDelta))
            this.setOffsetChanged(true)
            this.triggerLayout()
            return
        }

        const ratio = this.m_size.width() / this.m_size.height()
        let dx = ed.delta.x()
        let dy = ed.delta.y()
        if (this.m_sizeIsSpatium) {
            const _spatium = this.spatium()
            dx /= _spatium
            dy /= _spatium
        } else {
            dx /= DPMM
            dy /= DPMM
        }
        if (ed.curGrip === Grip.START) {
            this.m_size.setWidth(this.m_size.width() + dx)
            if (this.m_lockAspectRatio) {
                this.m_size.setHeight(this.m_size.width() / ratio)
            }
        } else if (ed.curGrip === Grip.END) {
            this.m_size.setHeight(this.m_size.height() + dy)
            if (this.m_lockAspectRatio) {
                this.m_size.setWidth(this.m_size.height() * ratio)
            }
        }

        this.triggerLayout()
    }

    override gripAnchorLines(_grip: Grip): [] { return [] }

    pixel2size(s: SizeF): SizeF {
        const f = this.m_sizeIsSpatium ? this.spatium() : DPMM
        return new SizeF(s.width() / f, s.height() / f)
    }

    size2pixel(s: SizeF): SizeF {
        const f = this.m_sizeIsSpatium ? this.spatium() : DPMM
        return new SizeF(s.width() * f, s.height() * f)
    }

    init(): void {
        if (this.m_imageType === ImageType.SVG && !this.m_svgDoc) {
            if (this.m_storeItem) {
                this.m_svgDoc = new SvgRenderer(this.m_storeItem.buffer(), this.m_storeItem.hashName())
            }
        } else if (this.m_imageType === ImageType.RASTER && !this.m_rasterDoc) {
            if (this.m_storeItem) {
                this.m_rasterDoc = ImageProvider.createPixmap(this.m_storeItem.buffer(), this.m_storeItem.hashName())
                if (!this.m_rasterDoc.isNull()) {
                    this.m_dirty = true
                }
            }
        }
        if (this.m_size.isNull()) {
            this.m_size = this.pixel2size(this.imageSize())
        }
    }

    override getProperty(propertyId: Pid): PropertyValue {
        switch (propertyId) {
        case Pid.AUTOSCALE:
            return this.autoScale()
        case Pid.SIZE:
            return this.size().clone()
        case Pid.IMAGE_HEIGHT:
            return this.imageHeight()
        case Pid.IMAGE_WIDTH:
            return this.imageWidth()
        case Pid.IMAGE_FRAMED:
            return this.isImageFramed()
        case Pid.LOCK_ASPECT_RATIO:
            return this.lockAspectRatio()
        case Pid.SIZE_IS_SPATIUM:
            return this.sizeIsSpatium()
        default:
            return super.getProperty(propertyId)
        }
    }

    override setProperty(propertyId: Pid, v: PropertyValue): boolean {
        let rv = true
        switch (propertyId) {
        case Pid.AUTOSCALE:
            this.setAutoScale(v as boolean)
            break
        case Pid.SIZE:
            this.setSize(v as SizeF)
            break
        case Pid.IMAGE_HEIGHT:
            this.updateImageHeight(v as number)
            break
        case Pid.IMAGE_WIDTH:
            this.updateImageWidth(v as number)
            break
        case Pid.IMAGE_FRAMED:
            break
        case Pid.LOCK_ASPECT_RATIO:
            this.setLockAspectRatio(v as boolean)
            break
        case Pid.SIZE_IS_SPATIUM: {
            const s = this.size2pixel(this.m_size)
            this.setSizeIsSpatium(v as boolean)
            this.m_size = this.pixel2size(s)
            break
        }
        default:
            rv = super.setProperty(propertyId, v)
            break
        }
        this.setGenerated(false)
        this.m_dirty = true
        this.triggerLayout()
        return rv
    }

    override propertyDefault(id: Pid): PropertyValue {
        switch (id) {
        case Pid.AUTOSCALE:
            return defaultAutoScale
        case Pid.SIZE:
            return this.pixel2size(this.imageSize())
        case Pid.IMAGE_HEIGHT:
            return this.pixel2size(this.imageSize()).height()
        case Pid.IMAGE_WIDTH:
            return this.pixel2size(this.imageSize()).width()
        case Pid.IMAGE_FRAMED:
            return this.isImageFramed()
        case Pid.LOCK_ASPECT_RATIO:
            return defaultLockAspectRatio
        case Pid.SIZE_IS_SPATIUM:
            return defaultSizeIsSpatium
        default:
            return super.propertyDefault(id)
        }
    }
}
