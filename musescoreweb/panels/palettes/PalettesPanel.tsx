/*
 * SPDX-License-Identifier: GPL-3.0-only
 * The palettes panel (port of src/palette/qml/MuseScore/Palette/PalettesPanel.qml).
 */
import type { MenuItem } from '../../menus/appmenu'

/** PalettesPanelContextMenuModel: the items of the tab's context menu before "Close" */
export function palettesPanelMenu(): MenuItem[] {
    return []
}

export function PalettesPanel(): React.JSX.Element {
    return <div className="panel-placeholder" />
}
