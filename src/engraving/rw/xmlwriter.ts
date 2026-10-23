/*
 * SPDX-License-Identifier: GPL-3.0-only
 * MuseEncore — port of MuseScore Studio (https://github.com/musescore/MuseScore)
 * Copyright (C) 2021-2026 MuseScore Limited and others
 *
 * Port of src/engraving/rw/xmlwriter.h/.cpp
 *
 * C++ overloads tag(name), tag(name, attrs), tag(name, body), tag(name, val, def) and tag(name, attrs, body) are
 * distinguished at runtime (an array is the attribute list; three arguments without attributes mean val/def).
 * A PropertyValue carries no type in TypeScript, so tagProperty(name, ...) takes the P_TYPE explicitly.
 */

import { XmlStreamWriter, type XmlAttributes, type XmlValue } from '../../framework/global/serialization/xmlstreamwriter'
import type { Color } from '../../framework/draw/types/color'
import type { PointF, SizeF } from '../../framework/draw/types/geometry'
import type { Spatium } from '../types/dimension'
import { Fraction } from '../types/fraction'
import { P_TYPE, propertyValueEquals, type PropertyValue } from '../types/propertyvalue'
import { TConv } from '../types/typesconv'
import type {
    Align, AlignH, AutoCustomHide, AutoOnOff, BarLineType, ChangeMethod, ClefType, DirectionH, DirectionV, DynamicSpeed,
    DynamicType, GlissandoStyle, GlissandoType, GradualTempoChangeType, HookType, KeyMode, LayoutBreakType, LineType,
    MarkerType, NoteHeadGroup, NoteHeadScheme, NoteHeadType, Orientation, OrnamentInterval, OrnamentStyle, ParenthesesMode,
    PartialSpannerDirection, PlacementH, PlacementV, PlayingTechniqueType, TextPlace, TextStyleType, TiePlacement,
    VoiceAssignment, AccidentalRole, TremoloType, TrillType, VibratoType, BracketType,
} from '../types/types'
import type { SymId } from '../types/symid'
import { Pid, propertyName, propertyType } from '../dom/property'
import type { EngravingObject } from '../dom/engravingobject'
import { Accidental } from '../dom/accidental'
import { Ottava, type OttavaType } from '../dom/ottava'

export type { XmlAttributes, XmlValue }

/**
 * propertyToString (dom/property.cpp): string representation for some properties (mscx = true);
 * empty if the property is written by its type
 */
export function propertyToString(id: Pid, value: PropertyValue): string {
    if (value === undefined || value === null) {
        return ''
    }
    switch (id) {
    case Pid.SYSTEM_BRACKET: // system bracket type
        return TConv.toXmlBracketType(value as BracketType)
    case Pid.ACCIDENTAL_TYPE:
        return Accidental.subtype2name(value as number)
    case Pid.OTTAVA_TYPE:
        return Ottava.ottavaTypeName(value as OttavaType)
    case Pid.TREMOLO_TYPE:
        return TConv.toXmlTremoloType(value as TremoloType)
    case Pid.TRILL_TYPE:
        return TConv.toXmlTrillType(value as TrillType)
    case Pid.VIBRATO_TYPE:
        return TConv.toXmlVibratoType(value as VibratoType)
    default:
        break
    }
    return ''
}

export class XmlWriter extends XmlStreamWriter {
    private m_elements: Array<[EngravingObject, string]> = []
    private m_recordElements = false

    elements(): ReadonlyArray<[EngravingObject, string]> { return this.m_elements }
    setRecordElements(record: boolean): void { this.m_recordElements = record }

    /** startElement(name, attrs) or startElement(EngravingObject, attrs) (uses the type name) */
    override startElement(nameOrItem: string | EngravingObject, attrs: XmlAttributes = []): void {
        if (typeof nameOrItem === 'string') {
            super.startElement(nameOrItem, attrs)
            return
        }
        this.startElementFor(nameOrItem.typeName(), nameOrItem, attrs)
    }

    /** C++ startElement(const AsciiStringView& name, const EngravingObject* se, const Attributes& attrs) */
    startElementFor(name: string, se: EngravingObject, attrs: XmlAttributes = []): void {
        super.startElement(name, attrs)
        if (this.m_recordElements) {
            this.m_elements.push([se, name])
        }
    }

    tag(name: string, ...args: [] | [XmlAttributes] | [XmlValue] | [XmlValue, XmlValue] | [XmlAttributes, XmlValue]): void {
        if (args.length === 0) {
            this.elementAttrs(name, [])
            return
        }
        const a = args[0]
        if (Array.isArray(a)) {
            if (args.length === 1) {
                this.elementAttrs(name, a as XmlAttributes)
            } else {
                this.elementAttrsBody(name, a as XmlAttributes, args[1] as XmlValue)
            }
            return
        }
        if (args.length === 2) {
            // tag(name, val, def)
            const def = args[1] as XmlValue
            if (a === def || (typeof a === 'boolean' && Number(a) === def) || (typeof def === 'boolean' && Number(def) === a)) {
                return
            }
        }
        this.element(name, a as XmlValue)
    }

    tagRaw(elementWithAttrs: string, body: XmlValue = undefined): void {
        this.elementRaw(elementWithAttrs, body)
    }

    /** tagProperty(Pid id, const PropertyValue& val, const PropertyValue& def) */
    tagProperty(id: Pid, val: PropertyValue, def: PropertyValue = undefined): void {
        if (propertyValueEquals(val, def)) {
            return
        }
        const name = propertyName(id)
        if (!name) {
            return
        }
        let propType = propertyType(id)
        const writableVal = propertyToString(id, val)
        if (!writableVal) {
            //! NOTE The data type is MILLIMETRE, but we write SPATIUM
            //! (the conversion from Millimetre to Spatium occurred higher up the stack)
            if (propType === P_TYPE.MILLIMETRE) {
                propType = P_TYPE.SPATIUM
            }
            //! HACK: some properties of type BOOL use int values
            if (propType === P_TYPE.BOOL && typeof val === 'number') {
                propType = P_TYPE.INT
            }
            this.tagPropertyTyped(name, propType, val)
        } else {
            this.tagPropertyTyped(name, P_TYPE.STRING, writableVal)
        }
    }

    /** tagProperty(const AsciiStringView& name, const PropertyValue& data, const PropertyValue& def) */
    tagPropertyByName(name: string, type: P_TYPE, val: PropertyValue, def: PropertyValue = undefined): void {
        if (propertyValueEquals(val, def)) {
            return
        }
        this.tagPropertyTyped(name, type, val)
    }

    private tagPropertyTyped(name: string, type: P_TYPE, data: PropertyValue): void {
        switch (type) {
        case P_TYPE.UNDEFINED:
            break
        // base
        case P_TYPE.BOOL:
            this.element(name, data ? 1 : 0)
            break
        case P_TYPE.INT:
            this.element(name, typeof data === 'boolean' ? Number(data) : Math.trunc(data as number))
            break
        case P_TYPE.REAL:
            this.element(name, data as number)
            break
        case P_TYPE.STRING:
            this.element(name, data as string)
            break
        // geometry
        case P_TYPE.POINT: {
            const p = data as PointF
            this.elementAttrs(name, [['x', p.x()], ['y', p.y()]])
            break
        }
        case P_TYPE.SIZE:
        case P_TYPE.SCALE: {
            const s = data as SizeF
            this.elementAttrs(name, [['w', s.width()], ['h', s.height()]])
            break
        }
        case P_TYPE.SPATIUM:
            this.element(name, typeof data === 'number' ? data : (data as Spatium).val())
            break
        case P_TYPE.MILLIMETRE:
            this.element(name, data as number)
            break
        // draw
        case P_TYPE.SYMID:
            this.element(name, TConv.toXmlSymId(data as SymId))
            break
        case P_TYPE.COLOR: {
            const color = data as Color
            this.elementAttrs(name, [['r', color.red()], ['g', color.green()], ['b', color.blue()], ['a', color.alpha()]])
            break
        }
        case P_TYPE.ORNAMENT_STYLE:
            this.element(name, TConv.toXmlOrnamentStyle(data as OrnamentStyle))
            break
        case P_TYPE.ORNAMENT_SHOW_ACCIDENTAL:
            this.element(name, data as number)
            break
        case P_TYPE.GLISS_STYLE:
            this.element(name, TConv.toXmlGlissandoStyle(data as GlissandoStyle))
            break
        case P_TYPE.GLISS_TYPE:
            this.element(name, TConv.toXmlGlissandoType(data as GlissandoType))
            break
        case P_TYPE.ALIGN:
            this.element(name, TConv.toXmlAlign(data as Align))
            break
        case P_TYPE.ALIGN_H:
            this.element(name, TConv.toXmlAlignH(data as AlignH))
            break
        case P_TYPE.PLACEMENT_V:
            this.element(name, TConv.toXmlPlacementV(data as PlacementV))
            break
        case P_TYPE.PLACEMENT_H:
            this.element(name, TConv.toXmlPlacementH(data as PlacementH))
            break
        case P_TYPE.TEXT_PLACE:
            this.element(name, TConv.toXmlTextPlace(data as TextPlace))
            break
        case P_TYPE.DIRECTION_V:
            this.element(name, TConv.toXmlDirectionV(data as DirectionV))
            break
        case P_TYPE.DIRECTION_H:
            this.element(name, TConv.toXmlDirectionH(data as DirectionH))
            break
        case P_TYPE.ORIENTATION:
            this.element(name, TConv.toXmlOrientation(data as Orientation))
            break
        // time
        case P_TYPE.FRACTION:
            this.tagFraction(name, data as Fraction)
            break
        case P_TYPE.LAYOUTBREAK_TYPE:
            this.element(name, TConv.toXmlLayoutBreakType(data as LayoutBreakType))
            break
        case P_TYPE.BARLINE_TYPE:
            this.element(name, TConv.toXmlBarLineType(data as BarLineType))
            break
        case P_TYPE.NOTEHEAD_TYPE:
            this.element(name, TConv.toXmlNoteHeadType(data as NoteHeadType))
            break
        case P_TYPE.NOTEHEAD_SCHEME:
            this.element(name, TConv.toXmlNoteHeadScheme(data as NoteHeadScheme))
            break
        case P_TYPE.NOTEHEAD_GROUP:
            this.element(name, TConv.toXmlNoteHeadGroup(data as NoteHeadGroup))
            break
        case P_TYPE.CLEF_TYPE:
            this.element(name, TConv.toXmlClefType(data as ClefType))
            break
        case P_TYPE.CLEF_TO_BARLINE_POS:
            this.element(name, data as number)
            break
        case P_TYPE.DYNAMIC_TYPE:
            this.element(name, TConv.toXmlDynamicType(data as DynamicType))
            break
        case P_TYPE.DYNAMIC_SPEED:
            this.element(name, TConv.toXmlDynamicSpeed(data as DynamicSpeed))
            break
        case P_TYPE.LINE_TYPE:
            this.element(name, TConv.toXmlLineType(data as LineType))
            break
        case P_TYPE.HOOK_TYPE:
            this.element(name, TConv.toXmlHookType(data as HookType))
            break
        case P_TYPE.KEY_MODE:
            this.element(name, TConv.toXmlKeyMode(data as KeyMode))
            break
        case P_TYPE.TEXT_STYLE:
            this.element(name, TConv.toXmlTextStyleType(data as TextStyleType))
            break
        case P_TYPE.SLUR_STYLE_TYPE:
            this.element(name, data as number)
            break
        case P_TYPE.CHANGE_METHOD:
            this.element(name, TConv.toXmlChangeMethod(data as ChangeMethod))
            break
        case P_TYPE.ACCIDENTAL_ROLE:
            this.element(name, TConv.toXmlAccidentalRole(data as AccidentalRole))
            break
        case P_TYPE.PLAYTECH_TYPE:
            this.element(name, TConv.toXmlPlayingTechniqueType(data as PlayingTechniqueType))
            break
        case P_TYPE.TEMPOCHANGE_TYPE:
            this.element(name, TConv.toXmlGradualTempoChangeType(data as GradualTempoChangeType))
            break
        case P_TYPE.ORNAMENT_INTERVAL:
            this.element(name, TConv.toXmlOrnamentInterval(data as OrnamentInterval))
            break
        case P_TYPE.TIE_PLACEMENT:
            this.element(name, TConv.toXmlTiePlacement(data as TiePlacement))
            break
        case P_TYPE.VOICE_ASSIGNMENT:
            this.element(name, TConv.toXmlVoiceAssignment(data as VoiceAssignment))
            break
        case P_TYPE.AUTO_ON_OFF:
            this.element(name, TConv.toXmlAutoOnOff(data as AutoOnOff))
            break
        case P_TYPE.AUTO_CUSTOM_HIDE:
            this.element(name, TConv.toXmlAutoCustomHide(data as AutoCustomHide))
            break
        case P_TYPE.INT_VEC:
            this.element(name, TConv.toXmlIntVec(data as number[]))
            break
        case P_TYPE.PARTIAL_SPANNER_DIRECTION:
            this.element(name, TConv.toXmlPartialSpannerDirection(data as PartialSpannerDirection))
            break
        case P_TYPE.PARENTHESES_MODE:
            this.element(name, TConv.toXmlParenthesesMode(data as ParenthesesMode))
            break
        case P_TYPE.MARKER_TYPE:
            this.element(name, TConv.toXmlMarkerType(data as MarkerType))
            break
        default:
            // C++: UNREACHABLE (not supported types)
            break
        }
    }

    tagPoint(name: string, p: PointF): void {
        this.elementAttrs(name, [['x', p.x()], ['y', p.y()]])
    }

    /** the default def is C++ Fraction() = 0/1: zero fractions are not written */
    tagFraction(name: string, v: Fraction, def: Fraction = new Fraction(0, 1)): void {
        if (v.eq(def)) {
            return
        }
        this.element(name, v.toString())
    }

    writeXml(name: string, s: string): void {
        // eslint-disable-next-line no-control-regex
        s = s.replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F]/g, '?')
        this.elementStringRaw(name, s)
    }

    static xmlString(s: string): string {
        return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')
    }
}
