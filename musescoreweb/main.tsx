/*
 * SPDX-License-Identifier: GPL-3.0-only
 * MuseScore Web: the score editor (work in progress). The home screen and the dialogs are React components;
 * the score view (scoreview.ts) is plain DOM code taken over from the web viewer.
 */
import { createRoot } from 'react-dom/client'
import { App } from './App'
import { startup } from './session'

createRoot(document.getElementById('app-root')!).render(<App />)
void startup()
