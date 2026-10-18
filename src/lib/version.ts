// SPDX-License-Identifier: MIT
// The product's version, from the only place that has one.
//
// The application is not published on its own: it ships inside the tarball and
// the image, and what carries a version is the `@openexpert/openexpert` package
// (the CLI that installs and runs it). The root manifest is a private workspace
// file, so the number shown in the interface is this one — read at build time,
// when the bundler inlines the package manifest.
import { version } from "../../packages/openexpert/package.json";

export const APP_VERSION = version;
