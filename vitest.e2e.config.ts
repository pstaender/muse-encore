// SPDX-License-Identifier: GPL-3.0-only
// end-to-end tests of the web viewer (headless Chrome): npm run test:e2e
import { defineConfig } from 'vitest/config'

export default defineConfig({
    test: {
        include: ['test/e2e/**/*.e2e.ts'],
        fileParallelism: false,
        testTimeout: 120000,
        hookTimeout: 60000,
    },
})
