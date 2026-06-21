"use client";

import type { ComponentProps } from "react";
import { memo, useEffect, useState } from "react";
import type { StreamdownProps } from "streamdown";
import { cn } from "@/lib/utils";

/**
 * Lazy Streamdown renderer — imports @streamdown/code (which pulls in shiki)
 * only when a finished message is rendered, not on page load.
 *
 * Shows raw text content immediately, then swaps to Streamdown once loaded.
 */
export const LazyStreamdown = memo(
  ({
    className,
    children,
    ...props
  }: ComponentProps<"div"> & { children: string }) => {
    const [StreamdownComponent, setStreamdownComponent] = useState<
      React.ComponentType<StreamdownProps> | null
    >(null);

    useEffect(() => {
      let cancelled = false;

      Promise.all([
        import("streamdown"),
        import("@streamdown/cjk"),
        import("@streamdown/code"),
        import("@streamdown/math"),
        import("@streamdown/mermaid"),
      ])
        .then(([{ Streamdown }, cjk, code, math, mermaid]) => {
          if (cancelled) return;

          const LazyStreamdownInner = (props: StreamdownProps) => (
            <Streamdown
              plugins={{ cjk: cjk.cjk, code: code.code, math: math.math, mermaid: mermaid.mermaid }}
              {...props}
            />
          );

          // We need a class component or forwardRef component for dynamic usage
          const LazySD = (innerProps: StreamdownProps) => (
            <LazyStreamdownInner {...innerProps} />
          );

          setStreamdownComponent(() => LazySD);
        })
        .catch(() => {
          // Fallback: just show raw text
        });

      return () => {
        cancelled = true;
      };
    }, []);

    const Comp = StreamdownComponent;

    if (Comp) {
      return (
        <Comp
          className={cn(
            "size-full [&>*:first-child]:mt-0 [&>*:last-child]:mb-0",
            className,
          )}
          {...props}
        >
          {children}
        </Comp>
      );
    }

    // Fallback: show raw text while Streamdown loads or if it fails
    return (
      <div
        className={cn(
          "size-full whitespace-pre-wrap break-words [&>*:first-child]:mt-0 [&>*:last-child]:mb-0",
          className,
        )}
      >
        {children}
      </div>
    );
  },
  (prevProps, nextProps) =>
    prevProps.children === nextProps.children,
);

LazyStreamdown.displayName = "LazyStreamdown";
