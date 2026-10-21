/*
 * SPDX-License-Identifier: GPL-3.0-only
 * The layout panel (port of src/instrumentsscene/qml/MuseScore/InstrumentsScene/LayoutPanel.qml).
 */
import type { MenuItem } from '../../menus/appmenu'

/** the items of the tab's context menu before "Close" (none in MuseScore) */
export function layoutPanelMenu(): MenuItem[] {
    return []
}

export function LayoutPanel(): React.JSX.Element {
    return <div className="panel-placeholder" />
}
