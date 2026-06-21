// Vendored from https://github.com/piuccio/cowsay (master @ 2024-01-25). Converted
// from CommonJS to ESM so it can be inlined by eve's Rolldown bundler.

var modes = {
  b: { eyes: "==", tongue: "  " },
  d: { eyes: "xx", tongue: "U " },
  g: { eyes: "$$", tongue: "  " },
  p: { eyes: "@@", tongue: "  " },
  s: { eyes: "**", tongue: "U " },
  t: { eyes: "--", tongue: "  " },
  w: { eyes: "OO", tongue: "  " },
  y: { eyes: "..", tongue: "  " },
};

export default function faces(options) {
  for (var mode in modes) {
    if (options[mode] === true) {
      return modes[mode];
    }
  }

  return {
    eyes: options.e || "oo",
    tongue: options.T || "  ",
  };
}
