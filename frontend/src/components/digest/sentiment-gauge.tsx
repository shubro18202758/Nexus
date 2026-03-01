"use client";

import { motion } from "framer-motion";

export function SentimentGauge({ value, label, color }: { value: number; label: string; color: string }) {
    // value: -1 to 1 (negative to positive), mapped to 0-180 degrees
    const angle = ((value + 1) / 2) * 180;
    const cx = 60;
    const cy = 55;
    const r = 45;

    // Arc from 180° to 0° (left to right)
    const startAngle = 180;
    const endAngle = 180 - angle;
    const startRad = (startAngle * Math.PI) / 180;
    const endRad = (endAngle * Math.PI) / 180;

    const x1 = cx + r * Math.cos(startRad);
    const y1 = cy + r * Math.sin(startRad);
    const x2 = cx + r * Math.cos(endRad);
    const y2 = cy + r * Math.sin(endRad);

    const largeArc = angle > 180 ? 1 : 0;

    return (
        <div className="flex flex-col items-center gap-1">
            <svg width="120" height="70" viewBox="0 0 120 70" className="overflow-visible">
                {/* Background arc */}
                <path
                    d={`M ${cx - r} ${cy} A ${r} ${r} 0 0 1 ${cx + r} ${cy}`}
                    fill="none"
                    stroke="rgba(255,255,255,0.06)"
                    strokeWidth="6"
                    strokeLinecap="round"
                />
                {/* Filled arc */}
                <motion.path
                    initial={{ pathLength: 0 }}
                    animate={{ pathLength: 1 }}
                    transition={{ duration: 1.5, ease: "easeOut" }}
                    d={`M ${x1} ${y1} A ${r} ${r} 0 ${largeArc} 0 ${x2} ${y2}`}
                    fill="none"
                    stroke={color}
                    strokeWidth="6"
                    strokeLinecap="round"
                    style={{ filter: `drop-shadow(0 0 6px ${color}40)` }}
                />
                {/* Needle */}
                <motion.line
                    initial={{ rotate: 180 }}
                    animate={{ rotate: 180 - angle }}
                    transition={{ duration: 1.5, ease: "easeOut" }}
                    x1={cx}
                    y1={cy}
                    x2={cx}
                    y2={cy - r + 10}
                    stroke="white"
                    strokeWidth="1.5"
                    style={{ transformOrigin: `${cx}px ${cy}px` }}
                />
                <circle cx={cx} cy={cy} r="3" fill="white" />
                {/* Labels */}
                <text x="10" y="68" fontSize="7" fill="rgba(255,255,255,0.2)" fontFamily="monospace">−</text>
                <text x="105" y="68" fontSize="7" fill="rgba(255,255,255,0.2)" fontFamily="monospace">+</text>
            </svg>
            <span className="text-[9px] font-mono tracking-wider text-white/30 uppercase">{label}</span>
        </div>
    );
}
