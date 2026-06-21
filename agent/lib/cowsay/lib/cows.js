// Vendored from https://github.com/piuccio/cowsay (master @ 2024-01-25). Converted
// from CommonJS to ESM so it can be inlined by eve's Rolldown bundler. The cow
// art is loaded from the generated Map at cows.generated.ts (produced by
// scripts/inline-cowsay-cows.mjs) so we don't need any fs reads at runtime and
// eve's lib/ discovery doesn't trip over the .cow files.

import replacer from "./replacer.js";
import { COW_FILES } from "../cows.generated.ts";

var textCache = {};

export function get(cow) {
  var text = textCache[cow];

  if (!text) {
    if (cow.match(/\\/) || cow.match(/\//)) {
      // Caller passed a path; not supported in the inlined build.
      throw new Error(
        `[cowsay] cow file paths are not supported in the inlined build; got: ${cow}`,
      );
    }
    text = COW_FILES[cow];
    if (text === undefined) {
      throw new Error(
        `[cowsay] unknown cow: ${cow}. ${Object.keys(COW_FILES).length} cows are available.`,
      );
    }
    textCache[cow] = text;
  }

  return function (options) {
    return replacer(text, options);
  };
}

export function list() {
  return Promise.resolve(Object.keys(COW_FILES));
}

export function listSync() {
  return Object.keys(COW_FILES);
}
