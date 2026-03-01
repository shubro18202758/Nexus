"use client";

import { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Play, Pause, RotateCcw, MonitorOff } from "lucide-react";
import { cn } from "@/lib/utils";

export function FocusTimer() {
    const [timeLeft, setTimeLeft] = useState(25 * 60); // 25 minutes
    const [isActive, setIsActive] = useState(false);
    const [mode, setMode] = useState<"focus" | "break">("focus");

    useEffect(() => {
        let interval: NodeJS.Timeout;

        if (isActive && timeLeft > 0) {
            interval = setInterval(() => {
                setTimeLeft((prev) => prev - 1);
            }, 1000);
        } else if (timeLeft === 0) {
            setIsActive(false);
            // Play notification sound here?
        }

        return () => clearInterval(interval);
    }, [isActive, timeLeft]);

    const toggleTimer = () => setIsActive(!isActive);

    const resetTimer = () => {
        setIsActive(false);
        setTimeLeft(mode === "focus" ? 25 * 60 : 5 * 60);
    };

    const toggleMode = () => {
        const newMode = mode === "focus" ? "break" : "focus";
        setMode(newMode);
        setTimeLeft(newMode === "focus" ? 25 * 60 : 5 * 60);
        setIsActive(false);
    };

    const formatTime = (seconds: number) => {
        const mins = Math.floor(seconds / 60);
        const secs = seconds % 60;
        return `${mins.toString().padStart(2, "0")}:${secs.toString().padStart(2, "0")}`;
    };

    return (
        <div className="p-4 border rounded-xl bg-white shadow-sm space-y-4">
            <div className="flex items-center justify-between">
                <h3 className="font-semibold text-slate-700 flex items-center gap-2">
                    <MonitorOff className="h-4 w-4" />
                    Focus Mode
                </h3>
                <span className={cn(
                    "text-xs px-2 py-1 rounded-full font-medium uppercase",
                    mode === "focus" ? "bg-red-100 text-red-700" : "bg-green-100 text-green-700"
                )}>
                    {mode}
                </span>
            </div>

            <div className="text-4xl font-mono font-bold text-slate-800 text-center py-4 tracking-wider">
                {formatTime(timeLeft)}
            </div>

            <div className="flex items-center justify-center gap-2">
                <Button
                    variant={isActive ? "secondary" : "default"}
                    size="icon"
                    onClick={toggleTimer}
                    className={cn(
                        "h-12 w-12 rounded-full",
                        isActive ? "bg-slate-100 dark:bg-slate-800" : "bg-slate-900 text-white"
                    )}
                >
                    {isActive ? <Pause className="h-5 w-5" /> : <Play className="h-5 w-5 ml-1" />}
                </Button>

                <Button variant="outline" size="icon" onClick={resetTimer} className="h-10 w-10 rounded-full">
                    <RotateCcw className="h-4 w-4" />
                </Button>
            </div>

            <div className="text-center">
                <button onClick={toggleMode} className="text-xs text-slate-400 hover:text-slate-600 underline">
                    Switch to {mode === "focus" ? "Break" : "Focus"}
                </button>
            </div>
        </div>
    );
}
