"use client";

import { useState, useEffect, useCallback } from "react";
import { Button } from "@/components/ui/button";
import {
    Maximize2, Minimize2, Moon, Volume2,
    VolumeX, Eye, EyeOff
} from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";
import { cn } from "@/lib/utils";

interface ZenModeProps {
    isActive: boolean;
    onToggle: () => void;
}

export function ZenMode({ isActive, onToggle }: ZenModeProps) {
    const [isAmbientPlaying, setIsAmbientPlaying] = useState(false);
    const [showWordCount, setShowWordCount] = useState(true);

    // Escape key to exit
    useEffect(() => {
        if (!isActive) return;
        const handleKey = (e: KeyboardEvent) => {
            if (e.key === "Escape") onToggle();
        };
        document.addEventListener("keydown", handleKey);
        return () => document.removeEventListener("keydown", handleKey);
    }, [isActive, onToggle]);

    // Toggle ambient sound (brown noise via oscillator)
    const toggleAmbient = useCallback(() => {
        if (isAmbientPlaying) {
            // Stop
            if ((window as any).__zenAudioCtx) {
                (window as any).__zenAudioCtx.close();
                (window as any).__zenAudioCtx = null;
            }
            setIsAmbientPlaying(false);
        } else {
            // Start brown noise
            try {
                const ctx = new AudioContext();
                const bufferSize = 2 * ctx.sampleRate;
                const buffer = ctx.createBuffer(1, bufferSize, ctx.sampleRate);
                const output = buffer.getChannelData(0);
                let lastOut = 0;
                for (let i = 0; i < bufferSize; i++) {
                    const white = Math.random() * 2 - 1;
                    output[i] = (lastOut + 0.02 * white) / 1.02;
                    lastOut = output[i];
                    output[i] *= 3.5; // Amplify
                }
                const source = ctx.createBufferSource();
                source.buffer = buffer;
                source.loop = true;

                const gain = ctx.createGain();
                gain.gain.value = 0.15; // Gentle volume

                source.connect(gain);
                gain.connect(ctx.destination);
                source.start();

                (window as any).__zenAudioCtx = ctx;
                setIsAmbientPlaying(true);
            } catch (e) {
                console.error("Ambient audio failed:", e);
            }
        }
    }, [isAmbientPlaying]);

    // Cleanup on unmount
    useEffect(() => {
        return () => {
            if ((window as any).__zenAudioCtx) {
                (window as any).__zenAudioCtx.close();
                (window as any).__zenAudioCtx = null;
            }
        };
    }, []);

    return (
        <>
            {/* Zen Toggle Button */}
            <Button
                variant="ghost"
                size="sm"
                className="h-8 text-xs gap-1.5 text-muted-foreground hover:text-foreground"
                onClick={onToggle}
                title={isActive ? "Exit Zen Mode (Esc)" : "Enter Zen Mode"}
            >
                {isActive ? <Minimize2 className="h-3.5 w-3.5" /> : <Maximize2 className="h-3.5 w-3.5" />}
                {isActive ? "Exit Zen" : "Zen Mode"}
            </Button>

            {/* Zen Mode Overlay Controls */}
            <AnimatePresence>
                {isActive && (
                    <motion.div
                        initial={{ opacity: 0, y: -10 }}
                        animate={{ opacity: 1, y: 0 }}
                        exit={{ opacity: 0, y: -10 }}
                        className="fixed top-4 right-4 z-50 flex items-center gap-2 p-2 rounded-xl bg-slate-900/80 backdrop-blur-xl border border-white/10 shadow-lg"
                    >
                        <Button
                            variant="ghost"
                            size="sm"
                            className={cn(
                                "h-7 text-xs gap-1 rounded-lg",
                                isAmbientPlaying ? "text-purple-300" : "text-muted-foreground"
                            )}
                            onClick={toggleAmbient}
                            title="Toggle ambient sounds"
                        >
                            {isAmbientPlaying ? <Volume2 className="h-3.5 w-3.5" /> : <VolumeX className="h-3.5 w-3.5" />}
                            {isAmbientPlaying ? "Sound On" : "Sound Off"}
                        </Button>

                        <div className="h-4 w-px bg-white/10" />

                        <Button
                            variant="ghost"
                            size="sm"
                            className="h-7 text-xs gap-1 text-muted-foreground rounded-lg"
                            onClick={onToggle}
                        >
                            <Minimize2 className="h-3.5 w-3.5" /> Exit
                        </Button>
                    </motion.div>
                )}
            </AnimatePresence>
        </>
    );
}
