"use client";

import { useEffect, useState, useRef, useCallback } from "react";
import { useDb } from "@/components/providers/db-provider";
import { documents, knowledgeItems, knowledgeChunks } from "@/db/schema";
import { Loader2, Network, ZoomIn, ZoomOut, Maximize2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { motion } from "framer-motion";

interface GraphNode {
    id: string;
    label: string;
    type: "document" | "knowledge";
    x: number;
    y: number;
    vx: number;
    vy: number;
}

interface GraphEdge {
    source: string;
    target: string;
    weight: number;
}

// Simple force-directed graph layout using canvas
export function KnowledgeGraph() {
    const { db } = useDb();
    const canvasRef = useRef<HTMLCanvasElement>(null);
    const animRef = useRef<number>(0);
    const [nodes, setNodes] = useState<GraphNode[]>([]);
    const [edges, setEdges] = useState<GraphEdge[]>([]);
    const [isLoading, setIsLoading] = useState(true);
    const [zoom, setZoom] = useState(1);
    const [hoveredNode, setHoveredNode] = useState<GraphNode | null>(null);
    const nodesRef = useRef<GraphNode[]>([]);
    const edgesRef = useRef<GraphEdge[]>([]);

    useEffect(() => {
        if (!db) return;
        (async () => {
            try {
                const docs = await db.select().from(documents).limit(30);
                const kis = await db.select().from(knowledgeItems).limit(30);

                const allItems = [
                    ...docs.map((d) => ({ id: d.id, label: d.title, type: "document" as const })),
                    ...kis.map((k) => ({ id: k.id, label: k.title, type: "knowledge" as const })),
                ];

                if (allItems.length === 0) {
                    setIsLoading(false);
                    return;
                }

                // Initialize nodes with random positions
                const width = 800;
                const height = 500;
                const graphNodes: GraphNode[] = allItems.map((item) => ({
                    ...item,
                    x: Math.random() * width,
                    y: Math.random() * height,
                    vx: 0,
                    vy: 0,
                }));

                // Create edges — connect items that share words in their titles (simple similarity)
                const graphEdges: GraphEdge[] = [];
                for (let i = 0; i < allItems.length; i++) {
                    for (let j = i + 1; j < allItems.length; j++) {
                        const wordsA = new Set(allItems[i].label.toLowerCase().split(/\s+/));
                        const wordsB = new Set(allItems[j].label.toLowerCase().split(/\s+/));
                        const commonWords = [...wordsA].filter((w) => w.length > 3 && wordsB.has(w));
                        if (commonWords.length > 0) {
                            graphEdges.push({
                                source: allItems[i].id,
                                target: allItems[j].id,
                                weight: commonWords.length / Math.max(wordsA.size, wordsB.size),
                            });
                        }
                    }
                    // Also connect items of different types to encourage cross-links
                    if (i > 0 && allItems[i].type !== allItems[i - 1].type && Math.random() > 0.6) {
                        graphEdges.push({
                            source: allItems[i].id,
                            target: allItems[i - 1].id,
                            weight: 0.3,
                        });
                    }
                }

                nodesRef.current = graphNodes;
                edgesRef.current = graphEdges;
                setNodes(graphNodes);
                setEdges(graphEdges);
                setIsLoading(false);
            } catch (e) {
                console.error("Failed to build knowledge graph:", e);
                setIsLoading(false);
            }
        })();
    }, [db]);

    // Force simulation
    const simulate = useCallback(() => {
        const ns = nodesRef.current;
        const es = edgesRef.current;
        if (ns.length === 0) return;

        const width = 800;
        const height = 500;
        const centerX = width / 2;
        const centerY = height / 2;

        // Repulsion between all nodes
        for (let i = 0; i < ns.length; i++) {
            for (let j = i + 1; j < ns.length; j++) {
                const dx = ns[j].x - ns[i].x;
                const dy = ns[j].y - ns[i].y;
                const dist = Math.max(Math.sqrt(dx * dx + dy * dy), 1);
                const force = 500 / (dist * dist);
                ns[i].vx -= (dx / dist) * force;
                ns[i].vy -= (dy / dist) * force;
                ns[j].vx += (dx / dist) * force;
                ns[j].vy += (dy / dist) * force;
            }
        }

        // Attraction along edges
        for (const edge of es) {
            const source = ns.find((n) => n.id === edge.source);
            const target = ns.find((n) => n.id === edge.target);
            if (!source || !target) continue;
            const dx = target.x - source.x;
            const dy = target.y - source.y;
            const dist = Math.sqrt(dx * dx + dy * dy);
            const force = dist * 0.01 * edge.weight;
            source.vx += (dx / dist) * force;
            source.vy += (dy / dist) * force;
            target.vx -= (dx / dist) * force;
            target.vy -= (dy / dist) * force;
        }

        // Center gravity
        for (const n of ns) {
            n.vx += (centerX - n.x) * 0.001;
            n.vy += (centerY - n.y) * 0.001;
        }

        // Apply velocity with damping
        for (const n of ns) {
            n.vx *= 0.6;
            n.vy *= 0.6;
            n.x += n.vx;
            n.y += n.vy;
            n.x = Math.max(30, Math.min(width - 30, n.x));
            n.y = Math.max(30, Math.min(height - 30, n.y));
        }
    }, []);

    // Canvas rendering
    useEffect(() => {
        if (isLoading) return;
        const canvas = canvasRef.current;
        if (!canvas) return;
        const ctx = canvas.getContext("2d");
        if (!ctx) return;

        const dpr = window.devicePixelRatio || 1;
        canvas.width = 800 * dpr;
        canvas.height = 500 * dpr;
        ctx.scale(dpr, dpr);

        const render = () => {
            simulate();
            const ns = nodesRef.current;
            const es = edgesRef.current;

            ctx.clearRect(0, 0, 800, 500);

            // Draw edges
            for (const edge of es) {
                const source = ns.find((n) => n.id === edge.source);
                const target = ns.find((n) => n.id === edge.target);
                if (!source || !target) continue;
                ctx.beginPath();
                ctx.moveTo(source.x, source.y);
                ctx.lineTo(target.x, target.y);
                ctx.strokeStyle = `rgba(139, 92, 246, ${0.1 + edge.weight * 0.3})`;
                ctx.lineWidth = 1 + edge.weight * 2;
                ctx.stroke();
            }

            // Draw nodes
            for (const n of ns) {
                const isHovered = hoveredNode?.id === n.id;
                const radius = isHovered ? 8 : 5;

                // Glow
                if (isHovered) {
                    ctx.beginPath();
                    ctx.arc(n.x, n.y, 16, 0, Math.PI * 2);
                    ctx.fillStyle = n.type === "document" ? "rgba(59, 130, 246, 0.1)" : "rgba(245, 158, 11, 0.1)";
                    ctx.fill();
                }

                // Node
                ctx.beginPath();
                ctx.arc(n.x, n.y, radius, 0, Math.PI * 2);
                ctx.fillStyle = n.type === "document" ? "#3b82f6" : "#f59e0b";
                ctx.fill();
                ctx.strokeStyle = "rgba(255,255,255,0.3)";
                ctx.lineWidth = 1;
                ctx.stroke();

                // Label
                ctx.font = `${isHovered ? "12" : "10"}px Inter, system-ui, sans-serif`;
                ctx.fillStyle = isHovered ? "rgba(255,255,255,0.9)" : "rgba(255,255,255,0.5)";
                ctx.textAlign = "center";
                const label = n.label.length > 20 ? n.label.substring(0, 18) + "..." : n.label;
                ctx.fillText(label, n.x, n.y + radius + 12);
            }

            animRef.current = requestAnimationFrame(render);
        };

        render();
        return () => cancelAnimationFrame(animRef.current);
    }, [isLoading, hoveredNode, simulate]);

    // Mouse hover detection
    const handleMouseMove = useCallback((e: React.MouseEvent<HTMLCanvasElement>) => {
        const canvas = canvasRef.current;
        if (!canvas) return;
        const rect = canvas.getBoundingClientRect();
        const x = (e.clientX - rect.left) * (800 / rect.width);
        const y = (e.clientY - rect.top) * (500 / rect.height);

        const found = nodesRef.current.find((n) => {
            const dx = n.x - x;
            const dy = n.y - y;
            return Math.sqrt(dx * dx + dy * dy) < 12;
        });
        setHoveredNode(found || null);
    }, []);

    if (isLoading) {
        return (
            <div className="flex items-center justify-center py-12">
                <Loader2 className="h-6 w-6 animate-spin text-purple-400/50" />
            </div>
        );
    }

    if (nodes.length === 0) {
        return (
            <div className="text-center py-12">
                <Network className="h-10 w-10 text-muted-foreground/30 mx-auto mb-3" />
                <p className="text-sm text-muted-foreground">No items to visualize yet. Add documents or knowledge items.</p>
            </div>
        );
    }

    return (
        <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            className="rounded-xl border border-white/10 bg-white/5 backdrop-blur-sm overflow-hidden"
        >
            <div className="px-5 py-3 border-b border-white/5 flex items-center justify-between">
                <div className="flex items-center gap-2">
                    <Network className="h-4 w-4 text-purple-400" />
                    <h3 className="font-semibold text-sm">Knowledge Graph</h3>
                    <span className="text-[10px] text-muted-foreground">
                        {nodes.length} nodes · {edges.length} connections
                    </span>
                </div>
                <div className="flex items-center gap-1">
                    <div className="flex items-center gap-3 mr-4 text-[10px] text-muted-foreground">
                        <span className="flex items-center gap-1"><span className="h-2 w-2 rounded-full bg-blue-500 inline-block" /> Documents</span>
                        <span className="flex items-center gap-1"><span className="h-2 w-2 rounded-full bg-amber-500 inline-block" /> Knowledge</span>
                    </div>
                </div>
            </div>
            <canvas
                ref={canvasRef}
                style={{ width: "100%", height: 500, cursor: hoveredNode ? "pointer" : "default" }}
                onMouseMove={handleMouseMove}
            />
        </motion.div>
    );
}
