// Vendored from https://github.com/piuccio/cowsay (master @ 2024-01-25). Converted
// from CommonJS to ESM so it can be inlined by eve's Rolldown bundler.

import { say as balloonSay, think as balloonThink } from "./lib/balloon.js";
import { get, list, listSync } from "./lib/cows.js";
import faces from "./lib/faces.js";

/**
 * @param options
 * ## Face :
 * Either choose a mode (set the value as true) **_or_**
 * set your own defined eyes and tongue to `e` and `T`.
 * - ### `e` : eyes
 * - ### `T` : tongue
 *
 * ## Cow :
 * Either specify a cow name (e.g. "fox") **_or_**
 * set the value of `r` to true which selects a random cow.
 * - ### `r` : random selection
 * - ### `f` : cow name - from `cows` folder
 *
 * ## Modes :
 * Modes are just ready-to-use faces, here's their list:
 * - #### `b` : borg
 * - #### `d` : dead
 * - #### `g` : greedy
 * - #### `p` : paranoia
 * - #### `s` : stoned
 * - #### `t` : tired
 * - #### `w` : wired
 * - #### `y` : youthful
 *
 * @example
 * ```
 * cowsay.say({ text: 'Hello!', f: 'tux' });
 * cowsay.think({ text: 'Hmm...', d: true });
 * ```
 *
 * @returns {string} compiled cow
 */
export function say(options) {
  return doIt(options, true);
}

export function think(options) {
  return doIt(options, false);
}

export { get, list, listSync };

function doIt(options, sayAloud) {
  var cowFile;

  if (options.r) {
    var cowsList = listSync();
    cowFile = cowsList[Math.floor(Math.random() * cowsList.length)];
  } else {
    cowFile = options.f || "default";
  }

  var cow = get(cowFile);
  var face = faces(options);
  face.thoughts = sayAloud ? "\\" : "o";

  var action = sayAloud ? "say" : "think";
  return (
    balloon[action](
      options.text || (options._ ? options._.join(" ") : ""),
      options.n ? null : options.W,
    ) +
    "\n" +
    cow(face)
  );
}

const balloon = { say: balloonSay, think: balloonThink };
