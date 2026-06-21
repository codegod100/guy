"use client";

import { cjk } from "@streamdown/cjk";
import { code } from "@streamdown/code";
import { math } from "@streamdown/math";
import { mermaid } from "@streamdown/mermaid";
import type { ComponentProps } from "react";
import { Streamdown } from "streamdown";

const streamdownPlugins = { cjk, code, math, mermaid };

/**
 * The actual Streamdown rendering component.
 * Separated into its own file so it can be dynamically imported,
 * deferring the load of @streamdown/code (which pulls in shiki).
 */
export type StreamdownInnerProps = ComponentProps<typeof Streamdown>;

export function StreamdownInner(props: StreamdownInnerProps) {
  return <Streamdown plugins={streamdownPlugins} {...props} />;
}
