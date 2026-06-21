"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import type {
  MemoryGraphData,
  MemoryGraphEdge,
  MemoryGraphNode,
  MemoryGraphNodeType,
} from "@/lib/memory-graph";

const TYPE_COLORS: Record<MemoryGraphNodeType, string> = {
  source: "#7dd3fc",
  idea: "#c084fc",
  topic: "#34d399",
  quote: "#fbbf24",
  nugget: "#fb7185",
};

const TYPE_LABELS: Record<MemoryGraphNodeType, string> = {
  source: "Sources",
  idea: "Ideas",
  topic: "Topics",
  quote: "Quotes",
  nugget: "Nuggets",
};

type GraphResponse = MemoryGraphData | { ok: false; error: string };

type SimNode = MemoryGraphNode & {
  x: number;
  y: number;
  vx: number;
  vy: number;
};

interface Viewport {
  readonly scale: number;
  readonly offsetX: number;
  readonly offsetY: number;
}

export function MemoryGraphCanvas() {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const containerRef = useRef<HTMLDivElement | null>(null);
  const [graph, setGraph] = useState<MemoryGraphData | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [hoveredId, setHoveredId] = useState<string | null>(null);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [viewport, setViewport] = useState<Viewport>({
    scale: 1,
    offsetX: 0,
    offsetY: 0,
  });
  const simRef = useRef<SimNode[]>([]);
  const viewportRef = useRef<Viewport>(viewport);
  const hoveredIdRef = useRef<string | null>(null);
  const selectedIdRef = useRef<string | null>(null);
  const dragRef = useRef<
    | {
        kind: "pan";
        startX: number;
        startY: number;
        offsetX: number;
        offsetY: number;
      }
    | { kind: "node"; id: string }
    | null
  >(null);

  useEffect(() => {
    viewportRef.current = viewport;
  }, [viewport]);

  useEffect(() => {
    hoveredIdRef.current = hoveredId;
  }, [hoveredId]);

  useEffect(() => {
    selectedIdRef.current = selectedId;
  }, [selectedId]);

  useEffect(() => {
    let cancelled = false;

    void fetch("/api/graph", { cache: "no-store" })
      .then(async (response) => {
        const data = (await response.json()) as GraphResponse;
        if (!response.ok || "ok" in data) {
          throw new Error(
            "error" in data ? data.error : "Failed to load graph.",
          );
        }
        return data;
      })
      .then((data) => {
        if (cancelled) return;
        setGraph(data);
        setError(null);
        setSelectedId(data.nodes[0]?.id ?? null);
      })
      .catch((err: unknown) => {
        if (cancelled) return;
        setError(err instanceof Error ? err.message : "Failed to load graph.");
      });

    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (!graph) return;

    simRef.current = graph.nodes.map((node, index) => {
      const angle = (index / Math.max(graph.nodes.length, 1)) * Math.PI * 2;
      const radius = 180 + (index % 12) * 18;
      return {
        ...node,
        x: Math.cos(angle) * radius,
        y: Math.sin(angle) * radius,
        vx: 0,
        vy: 0,
      };
    });
  }, [graph]);

  const selectedNode = useMemo(
    () => graph?.nodes.find((node) => node.id === selectedId) ?? null,
    [graph, selectedId],
  );

  const relatedEdges = useMemo(() => {
    if (!graph || !selectedId) return [];
    return graph.edges.filter(
      (edge) => edge.source === selectedId || edge.target === selectedId,
    );
  }, [graph, selectedId]);

  useEffect(() => {
    const canvas = canvasRef.current;
    const container = containerRef.current;
    if (!canvas || !container || !graph) return;

    const context = canvas.getContext("2d");
    if (!context) return;

    let frame = 0;
    let width = 0;
    let height = 0;
    let dpr = 1;

    const resize = () => {
      width = container.clientWidth;
      height = container.clientHeight;
      dpr = window.devicePixelRatio || 1;
      canvas.width = Math.floor(width * dpr);
      canvas.height = Math.floor(height * dpr);
      canvas.style.width = `${width}px`;
      canvas.style.height = `${height}px`;
      context.setTransform(dpr, 0, 0, dpr, 0, 0);
      draw();
    };

    const getNodeById = (id: string | null) =>
      id ? (simRef.current.find((node) => node.id === id) ?? null) : null;

    const worldToScreen = (x: number, y: number) => {
      const { scale, offsetX, offsetY } = viewportRef.current;
      return {
        x: width / 2 + offsetX + x * scale,
        y: height / 2 + offsetY + y * scale,
      };
    };

    const screenToWorld = (x: number, y: number) => {
      const { scale, offsetX, offsetY } = viewportRef.current;
      return {
        x: (x - width / 2 - offsetX) / scale,
        y: (y - height / 2 - offsetY) / scale,
      };
    };

    const pickNode = (screenX: number, screenY: number) => {
      const world = screenToWorld(screenX, screenY);
      for (let i = simRef.current.length - 1; i >= 0; i -= 1) {
        const node = simRef.current[i];
        const dx = node.x - world.x;
        const dy = node.y - world.y;
        if (Math.hypot(dx, dy) <= node.size / viewportRef.current.scale) {
          return node;
        }
      }
      return null;
    };

    const stepSimulation = () => {
      const nodes = simRef.current;
      const edgeCount = graph.edges.length;

      for (let i = 0; i < nodes.length; i += 1) {
        const a = nodes[i];
        for (let j = i + 1; j < nodes.length; j += 1) {
          const b = nodes[j];
          const dx = b.x - a.x;
          const dy = b.y - a.y;
          const distance = Math.max(Math.hypot(dx, dy), 1);
          const force = 3200 / (distance * distance);
          const nx = dx / distance;
          const ny = dy / distance;
          a.vx -= nx * force;
          a.vy -= ny * force;
          b.vx += nx * force;
          b.vy += ny * force;
        }
      }

      for (const edge of graph.edges) {
        const source = nodes.find((node) => node.id === edge.source);
        const target = nodes.find((node) => node.id === edge.target);
        if (!source || !target) continue;

        const dx = target.x - source.x;
        const dy = target.y - source.y;
        const distance = Math.max(Math.hypot(dx, dy), 1);
        const desired = 110 + (1 - edge.strength) * 70;
        const spring = (distance - desired) * 0.0015 * (0.7 + edge.strength);
        const nx = dx / distance;
        const ny = dy / distance;

        source.vx += nx * spring;
        source.vy += ny * spring;
        target.vx -= nx * spring;
        target.vy -= ny * spring;
      }

      for (const node of nodes) {
        const radial = Math.hypot(node.x, node.y);
        if (radial > 0) {
          node.vx -= (node.x / radial) * radial * 0.00012;
          node.vy -= (node.y / radial) * radial * 0.00012;
        }

        if (
          dragRef.current?.kind === "node" &&
          dragRef.current.id === node.id
        ) {
          node.vx *= 0.4;
          node.vy *= 0.4;
        } else {
          node.vx *= 0.92;
          node.vy *= 0.92;
          node.x += node.vx;
          node.y += node.vy;
        }
      }

      if (edgeCount === 0) {
        for (const node of nodes) {
          node.vx *= 0.9;
          node.vy *= 0.9;
        }
      }
    };

    const draw = () => {
      context.clearRect(0, 0, width, height);
      context.fillStyle = "rgb(3 7 18)";
      context.fillRect(0, 0, width, height);

      context.save();
      context.globalAlpha = 0.12;
      for (let x = 0; x < width; x += 36) {
        context.beginPath();
        context.moveTo(x, 0);
        context.lineTo(x, height);
        context.strokeStyle = "#7c3aed";
        context.stroke();
      }
      for (let y = 0; y < height; y += 36) {
        context.beginPath();
        context.moveTo(0, y);
        context.lineTo(width, y);
        context.strokeStyle = "#0ea5e9";
        context.stroke();
      }
      context.restore();

      const hovered = hoveredIdRef.current;
      const selected = selectedIdRef.current;
      const highlighted = new Set<string>();
      if (selected) highlighted.add(selected);
      for (const edge of graph.edges) {
        if (edge.source === selected || edge.target === selected) {
          highlighted.add(edge.source);
          highlighted.add(edge.target);
        }
      }

      for (const edge of graph.edges) {
        const source = getNodeById(edge.source);
        const target = getNodeById(edge.target);
        if (!source || !target) continue;
        const a = worldToScreen(source.x, source.y);
        const b = worldToScreen(target.x, target.y);
        const active =
          edge.source === selected ||
          edge.target === selected ||
          edge.source === hovered ||
          edge.target === hovered;

        context.beginPath();
        context.moveTo(a.x, a.y);
        context.lineTo(b.x, b.y);
        context.strokeStyle = active
          ? "rgba(255,255,255,0.6)"
          : "rgba(148,163,184,0.22)";
        context.lineWidth = active ? 2.2 : 1 + edge.strength;
        context.stroke();
      }

      for (const node of simRef.current) {
        const point = worldToScreen(node.x, node.y);
        const color = TYPE_COLORS[node.type];
        const active = node.id === selected || node.id === hovered;
        const dimmed =
          highlighted.size > 0 && !highlighted.has(node.id) && !active;

        const radius =
          node.size * viewportRef.current.scale * (active ? 1.1 : 1);

        const gradient = context.createRadialGradient(
          point.x,
          point.y,
          radius * 0.15,
          point.x,
          point.y,
          radius,
        );
        gradient.addColorStop(0, color);
        gradient.addColorStop(1, "rgba(15,23,42,0.05)");

        context.globalAlpha = dimmed ? 0.28 : 1;
        context.beginPath();
        context.arc(point.x, point.y, radius, 0, Math.PI * 2);
        context.fillStyle = gradient;
        context.fill();

        context.beginPath();
        context.arc(point.x, point.y, radius, 0, Math.PI * 2);
        context.strokeStyle = active
          ? "rgba(255,255,255,0.95)"
          : "rgba(255,255,255,0.24)";
        context.lineWidth = active ? 2.5 : 1.2;
        context.stroke();

        if (viewportRef.current.scale > 0.62 || active) {
          context.globalAlpha = dimmed ? 0.45 : 1;
          context.fillStyle = "rgba(241,245,249,0.95)";
          context.font = active ? "600 12px sans-serif" : "500 11px sans-serif";
          context.textAlign = "center";
          context.fillText(
            node.label.slice(0, 24),
            point.x,
            point.y - radius - 8,
          );
        }
      }

      context.globalAlpha = 1;
    };

    const animate = () => {
      stepSimulation();
      draw();
      frame = window.requestAnimationFrame(animate);
    };

    const handleMove = (event: PointerEvent) => {
      const rect = canvas.getBoundingClientRect();
      const x = event.clientX - rect.left;
      const y = event.clientY - rect.top;

      if (dragRef.current?.kind === "pan") {
        setViewport({
          ...viewportRef.current,
          offsetX: dragRef.current.offsetX + (x - dragRef.current.startX),
          offsetY: dragRef.current.offsetY + (y - dragRef.current.startY),
        });
        return;
      }

      if (dragRef.current?.kind === "node") {
        const node = getNodeById(dragRef.current.id);
        if (!node) return;
        const world = screenToWorld(x, y);
        node.x = world.x;
        node.y = world.y;
        node.vx = 0;
        node.vy = 0;
        return;
      }

      const node = pickNode(x, y);
      setHoveredId(node?.id ?? null);
    };

    const handleDown = (event: PointerEvent) => {
      const rect = canvas.getBoundingClientRect();
      const x = event.clientX - rect.left;
      const y = event.clientY - rect.top;
      const node = pickNode(x, y);

      if (node) {
        dragRef.current = { kind: "node", id: node.id };
        setSelectedId(node.id);
      } else {
        dragRef.current = {
          kind: "pan",
          startX: x,
          startY: y,
          offsetX: viewportRef.current.offsetX,
          offsetY: viewportRef.current.offsetY,
        };
      }
    };

    const handleUp = () => {
      dragRef.current = null;
    };

    const handleWheel = (event: WheelEvent) => {
      event.preventDefault();
      const rect = canvas.getBoundingClientRect();
      const pointerX = event.clientX - rect.left;
      const pointerY = event.clientY - rect.top;
      const before = screenToWorld(pointerX, pointerY);
      const nextScale = Math.min(
        2.4,
        Math.max(
          0.35,
          viewportRef.current.scale * (event.deltaY > 0 ? 0.92 : 1.08),
        ),
      );

      const nextOffsetX = pointerX - width / 2 - before.x * nextScale;
      const nextOffsetY = pointerY - height / 2 - before.y * nextScale;
      setViewport({
        scale: nextScale,
        offsetX: nextOffsetX,
        offsetY: nextOffsetY,
      });
    };

    const resizeObserver = new ResizeObserver(resize);
    resizeObserver.observe(container);
    resize();
    animate();

    canvas.addEventListener("pointermove", handleMove);
    canvas.addEventListener("pointerdown", handleDown);
    window.addEventListener("pointerup", handleUp);
    canvas.addEventListener("wheel", handleWheel, { passive: false });

    return () => {
      resizeObserver.disconnect();
      canvas.removeEventListener("pointermove", handleMove);
      canvas.removeEventListener("pointerdown", handleDown);
      window.removeEventListener("pointerup", handleUp);
      canvas.removeEventListener("wheel", handleWheel);
      window.cancelAnimationFrame(frame);
    };
  }, [graph]);

  const legendItems = graph
    ? (Object.keys(graph.totals) as MemoryGraphNodeType[])
    : [];

  return (
    <main className="flex min-h-dvh flex-col bg-slate-950 text-slate-50">
      <header className="border-slate-800 border-b bg-slate-950/90 px-6 py-4 backdrop-blur">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
          <div>
            <p className="text-sky-300 text-xs uppercase tracking-[0.28em]">
              Memory Observatory
            </p>
            <h1 className="mt-2 font-semibold text-3xl tracking-tight">
              Knowledge graph canvas
            </h1>
            <p className="mt-2 max-w-2xl text-slate-400 text-sm">
              Explore sources, ideas, topics, quotes, and nuggets from the Turso
              memory store as a living constellation.
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-2 text-xs">
            <Button
              className="bg-slate-800 text-slate-100 hover:bg-slate-700"
              onClick={() => setViewport({ scale: 1, offsetX: 0, offsetY: 0 })}
              type="button"
              variant="secondary"
            >
              Reset view
            </Button>
            <span className="rounded-full border border-slate-800 px-3 py-1 text-slate-400">
              drag to pan · wheel to zoom · drag nodes to reshape
            </span>
          </div>
        </div>
      </header>

      <div className="grid flex-1 gap-px bg-slate-900 lg:grid-cols-[minmax(0,1fr)_360px]">
        <section className="relative min-h-[60vh] bg-slate-950">
          {error ? (
            <div className="flex h-full items-center justify-center p-8">
              <div className="max-w-md rounded-2xl border border-rose-500/30 bg-rose-500/10 p-6 text-sm text-rose-100">
                <p className="font-medium">
                  Couldn&apos;t load the memory graph.
                </p>
                <p className="mt-2 text-rose-100/80">{error}</p>
              </div>
            </div>
          ) : !graph ? (
            <div className="flex h-full items-center justify-center text-slate-400 text-sm">
              Loading graph…
            </div>
          ) : (
            <div className="absolute inset-0" ref={containerRef}>
              <canvas className="h-full w-full" ref={canvasRef} />
              <div className="pointer-events-none absolute bottom-4 left-4 rounded-xl border border-slate-800/80 bg-slate-950/80 px-3 py-2 text-slate-300 text-xs backdrop-blur">
                {graph.nodes.length} nodes · {graph.edges.length} edges
              </div>
            </div>
          )}
        </section>

        <aside className="border-slate-800 bg-slate-925 flex flex-col border-l bg-slate-900/80">
          <div className="border-slate-800 border-b p-5">
            <h2 className="font-medium text-sm text-slate-200">Legend</h2>
            <div className="mt-4 grid grid-cols-2 gap-2">
              {legendItems.map((type) => (
                <div
                  className="rounded-xl border border-slate-800 bg-slate-950/60 px-3 py-2"
                  key={type}
                >
                  <div className="flex items-center gap-2">
                    <span
                      className="size-2.5 rounded-full"
                      style={{ backgroundColor: TYPE_COLORS[type] }}
                    />
                    <span className="text-slate-200 text-xs">
                      {TYPE_LABELS[type]}
                    </span>
                  </div>
                  <p className="mt-1 font-medium text-base text-white">
                    {graph?.totals[type] ?? 0}
                  </p>
                </div>
              ))}
            </div>
          </div>

          <div className="flex-1 overflow-y-auto p-5">
            {selectedNode ? (
              <>
                <div className="flex items-center gap-3">
                  <span
                    className="size-3 rounded-full"
                    style={{ backgroundColor: TYPE_COLORS[selectedNode.type] }}
                  />
                  <div>
                    <p className="text-slate-400 text-xs uppercase tracking-[0.24em]">
                      {selectedNode.type}
                    </p>
                    <h3 className="mt-1 font-semibold text-xl text-white">
                      {selectedNode.label}
                    </h3>
                  </div>
                </div>

                <p className="mt-4 text-slate-300 text-sm leading-6">
                  {selectedNode.description}
                </p>

                {selectedNode.tags.length > 0 ? (
                  <div className="mt-4 flex flex-wrap gap-2">
                    {selectedNode.tags.map((tag) => (
                      <span
                        className="rounded-full border border-slate-700 bg-slate-800/70 px-2.5 py-1 text-slate-300 text-xs"
                        key={tag}
                      >
                        {tag}
                      </span>
                    ))}
                  </div>
                ) : null}

                <div className="mt-6">
                  <h4 className="font-medium text-sm text-slate-200">
                    Metadata
                  </h4>
                  <dl className="mt-3 space-y-2">
                    {Object.entries(selectedNode.metadata).map(
                      ([key, value]) => (
                        <div
                          className="rounded-lg border border-slate-800 bg-slate-950/60 px-3 py-2"
                          key={key}
                        >
                          <dt className="text-slate-500 text-xs uppercase tracking-wide">
                            {key}
                          </dt>
                          <dd className="mt-1 wrap-break-word text-slate-200 text-sm">
                            {Array.isArray(value)
                              ? value.join(", ") || "—"
                              : value === null || value === ""
                                ? "—"
                                : String(value)}
                          </dd>
                        </div>
                      ),
                    )}
                  </dl>
                </div>

                <div className="mt-6">
                  <h4 className="font-medium text-sm text-slate-200">
                    Connected edges
                  </h4>
                  <div className="mt-3 space-y-2">
                    {relatedEdges.length > 0 ? (
                      relatedEdges.map((edge) => (
                        <div
                          className={cn(
                            "rounded-lg border border-slate-800 bg-slate-950/60 px-3 py-2 text-sm",
                            edge.source === selectedNode.id
                              ? "border-l-4 border-l-cyan-400"
                              : "border-l-4 border-l-violet-400",
                          )}
                          key={edge.id}
                        >
                          <p className="text-slate-200">{edge.label}</p>
                          <p className="mt-1 text-slate-500 text-xs">
                            {edge.source} → {edge.target}
                          </p>
                        </div>
                      ))
                    ) : (
                      <p className="text-slate-500 text-sm">
                        No explicit links yet.
                      </p>
                    )}
                  </div>
                </div>
              </>
            ) : (
              <div className="rounded-2xl border border-slate-800 bg-slate-950/60 p-5 text-slate-400 text-sm">
                Select a node to inspect it.
              </div>
            )}
          </div>
        </aside>
      </div>
    </main>
  );
}
