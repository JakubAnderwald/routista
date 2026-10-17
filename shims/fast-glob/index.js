'use strict';

// Stands in for fast-glob under @next/eslint-plugin-next (see the package.json
// override), which only calls globSync(pattern, { onlyDirectories: true }) in
// dist/utils/get-root-dirs.js. fast-glob pulls in braces, which has an
// unpatched advisory (GHSA-vfj7-8cjw-p6xm); tinyglobby does not.
//
// expandDirectories: false keeps fast-glob's semantics: a literal directory
// such as "src" matches itself instead of every directory beneath it.
// eslint-disable-next-line @typescript-eslint/no-require-imports -- CommonJS: the plugin require()s this package
const { globSync } = require('tinyglobby');

exports.globSync = (patterns, options) =>
    globSync(patterns, { expandDirectories: false, ...options });
