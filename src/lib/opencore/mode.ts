// SPDX-License-Identifier: MIT
// App-side bridge: re-exports the OpenCore mode helpers so the rest of
// the application keeps using `@/lib/opencore/mode` while actually
// depending on the published `@openexpert/opencore` package.

export { LOCAL_OWNER_ID, getMode, isLocal, isLocalMode } from "@openexpert/opencore/mode";
export type { OpenExpertMode } from "@openexpert/opencore/mode";
