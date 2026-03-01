"use client";

import React from "react";
import { motion } from "framer-motion";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";

interface ShinyButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
    children: React.ReactNode;
    className?: string;
    icon?: React.ReactNode;
}

export function ShinyButton({ children, className, icon, ...props }: ShinyButtonProps) {
    return (
        <motion.button
            whileHover={{ scale: 1.02 }}
            whileTap={{ scale: 0.98 }}
            className={cn(
                "relative overflow-hidden rounded-lg px-6 py-3 font-medium text-white transition-all",
                "bg-gradient-to-r from-violet-600 to-cyan-600 hover:from-violet-500 hover:to-cyan-500",
                "border border-white/10 shadow-lg shadow-violet-500/20",
                "group flex items-center justify-center gap-2",
                className
            )}
            {...(props as any)}
        >
            {/* Shimmer Effect */}
            <div className="absolute inset-0 -translate-x-[100%] group-hover:animate-[shimmer_1.5s_infinite] bg-gradient-to-r from-transparent via-white/25 to-transparent z-10" />

            <span className="relative z-20 flex items-center gap-2 font-mono tracking-tight">
                {icon}
                {children}
            </span>
        </motion.button>
    );
}
