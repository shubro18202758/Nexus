"use client";

import React, { useState } from "react";
import { motion } from "framer-motion";
import { cn } from "@/lib/utils";

interface AuraCardProps extends React.HTMLAttributes<HTMLDivElement> {
    children: React.ReactNode;
    withGlow?: boolean;
    transparency?: "glass" | "solid";
}

export function AuraCard({
    children,
    className,
    withGlow = true,
    transparency = "glass",
    ...props
}: AuraCardProps) {
    const [mousePosition, setMousePosition] = useState({ x: 0, y: 0 });

    const handleMouseMove = (e: React.MouseEvent<HTMLDivElement>) => {
        const rect = e.currentTarget.getBoundingClientRect();
        setMousePosition({
            x: e.clientX - rect.left,
            y: e.clientY - rect.top,
        });
    };

    return (
        <motion.div
            className={cn(
                "relative rounded-xl overflow-hidden border border-white/10 group backdrop-blur-md",
                transparency === "glass" ? "bg-black/40" : "bg-[#050510]",
                className
            )}
            onMouseMove={handleMouseMove}
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.4 }}
            {...(props as any)}
        >
            {/* Holographic Border Effect */}
            {withGlow && (
                <div
                    className="absolute inset-0 pointer-events-none opacity-0 group-hover:opacity-100 transition-opacity duration-300"
                    style={{
                        background: `radial-gradient(600px circle at ${mousePosition.x}px ${mousePosition.y}px, rgba(139, 92, 246, 0.15), transparent 40%)`,
                    }}
                />
            )}

            {/* Border Highlight */}
            <div
                className="absolute inset-0 pointer-events-none rounded-xl"
                style={{
                    background: `radial-gradient(400px circle at ${mousePosition.x}px ${mousePosition.y}px, rgba(255, 255, 255, 0.1), transparent 40%)`,
                    maskImage: "linear-gradient(black, black), linear-gradient(black, black)",
                    maskClip: "content-box, border-box",
                    maskComposite: "exclude",
                    padding: "1px",
                }}
            />

            {/* Content with Noise Texture */}
            <div className="relative z-10 p-5 h-full">
                {/* Subtle Grain Overlay */}
                <div
                    className="absolute inset-0 opacity-[0.03] pointer-events-none mix-blend-overlay"
                    style={{ backgroundImage: `url("data:image/svg+xml,%3Csvg viewBox='0 0 200 200' xmlns='http://www.w3.org/2000/svg'%3E%3Cfilter id='noiseFilter'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.8' numOctaves='3' stitchTiles='stitch'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23noiseFilter)'/%3E%3C/svg%3E")` }}
                />
                {children}
            </div>
        </motion.div>
    );
}
