"use client";

import dynamic from "next/dynamic";
import { cn } from "@/lib/utils";
import type { ComponentProps } from "react";
import { memo } from "react";

/**
 * Dynamic import of the heavy Streamdown component.
 * This defers loading @streamdown/code, @streamdown/mermaid, and shiki
 * until a message with rendered content actually appears.
 */
const StreamdownInner = dynamic(
  () => import("./streamdown-inner").then((mod) => mod.StreamdownInner),
  {
    ssr: false,
    loading: () => null,
  },
);

export type MessageResponseProps = ComponentProps<typeof StreamdownInner>;

export const MessageResponse = memo(
  ({ className, isAnimating, ...props }: MessageResponseProps) =>
    isAnimating ? (
      <div
        className={cn(
          "size-full whitespace-pre-wrap break-words [&>*:first-child]:mt-0 [&>*:last-child]:mb-0",
          className,
        )}
      >
        {props.children}
      </div>
    ) : (
      <StreamdownInner
        className={cn("size-full [&>*:first-child]:mt-0 [&>*:last-child]:mb-0", className)}
        {...props}
      />
    ),
  (prevProps, nextProps) =>
    prevProps.children === nextProps.children && nextProps.isAnimating === prevProps.isAnimating,
);

MessageResponse.displayName = "MessageResponse";
