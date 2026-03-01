"use client";

import { motion } from "framer-motion";

export function CyberGrid() {
    return (
        <div className="fixed inset-0 z-0 pointer-events-none overflow-hidden">
            {/* Moving Perspective Grid */}
            <div className="absolute inset-0 [transform:perspective(500px)_rotateX(60deg)] opacity-20">
                <div className="absolute inset-0 bg-[linear-gradient(to_right,#4f4f4f2e_1px,transparent_1px),linear-gradient(to_bottom,#4f4f4f2e_1px,transparent_1px)] bg-[size:40px_40px] [mask-image:linear-gradient(to_bottom,transparent,black)] animate-grid-flow" />
            </div>

            {/* ambient glows */}
            <div className="absolute top-0 left-0 w-full h-full bg-gradient-to-b from-transparent via-cyan-900/5 to-violet-900/10" />
            <div className="absolute -top-[50%] -left-[50%] w-[200%] h-[200%] bg-[radial-gradient(circle_at_center,rgba(56,189,248,0.03),transparent_50%)] animate-pulse-slow" />
        </div>
    );
}
