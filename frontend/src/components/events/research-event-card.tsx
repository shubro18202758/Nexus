"use client";

import { useState, useCallback } from "react";
import { motion } from "framer-motion";
import { AuraCard } from "@/components/ui/aura-card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
    ExternalLink,
    Calendar,
    MapPin,
    Trophy,
    Users,
    Clock,
    Globe,
    Sparkles,
    ArrowUpRight,
    Shield,
    Ticket,
    Copy,
    Check,
    Share2,
} from "lucide-react";
import { cn } from "@/lib/utils";
import type { ResearchedEvent } from "@/lib/events/research-engine";

// ─── Platform branding ──────────────────────────────────────────

const PLATFORM_COLORS: Record<string, { bg: string; text: string; border: string }> = {
    devpost: { bg: "bg-blue-500/15", text: "text-blue-400", border: "border-blue-500/30" },
    unstop: { bg: "bg-orange-500/15", text: "text-orange-400", border: "border-orange-500/30" },
    eventbrite: { bg: "bg-red-500/15", text: "text-red-400", border: "border-red-500/30" },
    meetup: { bg: "bg-rose-500/15", text: "text-rose-400", border: "border-rose-500/30" },
    luma: { bg: "bg-purple-500/15", text: "text-purple-400", border: "border-purple-500/30" },
    mlh: { bg: "bg-blue-600/15", text: "text-blue-300", border: "border-blue-400/30" },
    hackerearth: { bg: "bg-green-500/15", text: "text-green-400", border: "border-green-500/30" },
    kaggle: { bg: "bg-cyan-500/15", text: "text-cyan-400", border: "border-cyan-500/30" },
    devfolio: { bg: "bg-indigo-500/15", text: "text-indigo-400", border: "border-indigo-500/30" },
    gdg: { bg: "bg-emerald-500/15", text: "text-emerald-400", border: "border-emerald-500/30" },
    konfhub: { bg: "bg-yellow-500/15", text: "text-yellow-400", border: "border-yellow-500/30" },
    townscript: { bg: "bg-pink-500/15", text: "text-pink-400", border: "border-pink-500/30" },
    web: { bg: "bg-white/8", text: "text-white/75", border: "border-white/15" },
};

const EVENT_TYPE_ICONS: Record<string, typeof Trophy> = {
    hackathon: Trophy,
    contest: Shield,
    workshop: Sparkles,
    conference: Globe,
    meetup: Users,
    networking: Users,
    "speaker-session": Globe,
    "startup-pitch": ArrowUpRight,
};

const FRESHNESS_STYLES: Record<string, { label: string; color: string; pulse: boolean }> = {
    upcoming: { label: "UPCOMING", color: "text-emerald-400 bg-emerald-500/15 border-emerald-500/30", pulse: false },
    ongoing: { label: "LIVE NOW", color: "text-cyan-400 bg-cyan-500/15 border-cyan-500/30", pulse: true },
    "deadline-soon": { label: "DEADLINE SOON", color: "text-amber-400 bg-amber-500/15 border-amber-500/30", pulse: true },
    past: { label: "ENDED", color: "text-white/50 bg-white/5 border-white/10", pulse: false },
    unknown: { label: "DISCOVERED", color: "text-white/60 bg-white/8 border-white/12", pulse: false },
};

interface ResearchEventCardProps {
    event: ResearchedEvent;
    index: number;
}

export function ResearchEventCard({ event, index }: ResearchEventCardProps) {
    const [isExpanded, setIsExpanded] = useState(false);
    const [copied, setCopied] = useState(false);

    const platformStyle = PLATFORM_COLORS[event.sourcePlatform] || PLATFORM_COLORS.web;
    const freshnessStyle = FRESHNESS_STYLES[event.freshness] || FRESHNESS_STYLES.unknown;
    const TypeIcon = EVENT_TYPE_ICONS[event.eventType] || Globe;

    const formatDate = (date: string | null) => {
        if (!date) return null;
        try {
            return new Date(date).toLocaleDateString("en-US", {
                month: "short",
                day: "numeric",
                year: "numeric",
            });
        } catch {
            return date;
        }
    };

    const handleCopyLink = useCallback(async () => {
        try {
            await navigator.clipboard.writeText(event.rsvpUrl);
            setCopied(true);
            setTimeout(() => setCopied(false), 2000);
        } catch {
            // Fallback for non-secure contexts
            const ta = document.createElement("textarea");
            ta.value = event.rsvpUrl;
            document.body.appendChild(ta);
            ta.select();
            document.execCommand("copy");
            document.body.removeChild(ta);
            setCopied(true);
            setTimeout(() => setCopied(false), 2000);
        }
    }, [event.rsvpUrl]);

    return (
        <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.4, delay: index * 0.05 }}
        >
            <AuraCard
                className="flex flex-col h-full group relative overflow-hidden border-2 hover:border-violet-500/40 hover:-translate-y-1.5 hover:shadow-[0_8px_40px_rgba(139,92,246,0.12)] transition-all duration-300"
                transparency="glass"
            >
                {/* Confidence gradient strip */}
                <div
                    className="absolute top-0 left-0 w-full h-1"
                    style={{
                        background: `linear-gradient(90deg, 
                            ${event.confidenceScore > 0.7 ? "rgb(16,185,129)" : event.confidenceScore > 0.4 ? "rgb(234,179,8)" : "rgb(239,68,68)"} 0%, 
                            transparent ${event.confidenceScore * 100}%
                        )`,
                    }}
                />

                {/* Header: Platform + Freshness + Type */}
                <div className="p-5 pb-2.5 space-y-3">
                    <div className="flex items-center justify-between gap-2">
                        <div className="flex items-center gap-2 flex-wrap">
                            {/* Platform badge */}
                            <Badge
                                variant="outline"
                                className={cn("text-[10px] uppercase tracking-wider font-mono", platformStyle.bg, platformStyle.text, platformStyle.border)}
                            >
                                {event.sourcePlatform}
                            </Badge>

                            {/* Event type badge */}
                            <Badge variant="outline" className="text-[10px] uppercase tracking-wider font-mono bg-violet-500/10 text-violet-400 border-violet-500/30">
                                <TypeIcon className="w-3 h-3 mr-1" />
                                {event.eventType}
                            </Badge>
                        </div>

                        {/* Freshness indicator */}
                        <Badge
                            variant="outline"
                            className={cn("text-[9px] uppercase tracking-widest font-bold font-mono", freshnessStyle.color, freshnessStyle.pulse && "animate-pulse")}
                        >
                            <span className={cn("w-1.5 h-1.5 rounded-full mr-1.5 inline-block", {
                                "bg-emerald-400": event.freshness === "upcoming",
                                "bg-cyan-400": event.freshness === "ongoing",
                                "bg-amber-400": event.freshness === "deadline-soon",
                                "bg-white/30": event.freshness === "unknown",
                            })} />
                            {freshnessStyle.label}
                        </Badge>
                    </div>

                    {/* Title */}
                    <h3 className="text-base font-semibold text-white leading-tight line-clamp-2 group-hover:text-violet-300 transition-colors">
                        {event.title}
                    </h3>

                    {/* Organizer */}
                    {event.organizer && (
                        <p className="text-xs text-white/70 font-mono">by {event.organizer}</p>
                    )}
                </div>

                {/* Theme Tags */}
                {event.themes.length > 0 && (
                    <div className="px-5 pb-2 flex flex-wrap gap-1.5">
                        {event.themes.slice(0, 4).map((theme) => (
                            <span
                                key={theme}
                                className="text-[10px] px-2.5 py-0.5 rounded-full bg-white/8 text-white/70 border border-white/12 font-mono"
                            >
                                {theme}
                            </span>
                        ))}
                        {event.themes.length > 4 && (
                            <span className="text-[10px] px-2 py-0.5 text-white/50">+{event.themes.length - 4}</span>
                        )}
                    </div>
                )}

                {/* Description */}
                <div className="px-5 pb-3 flex-1">
                    <p className={cn("text-sm text-white/80 leading-relaxed", isExpanded ? "" : "line-clamp-3")}>
                        {event.description}
                    </p>
                    {event.description.length > 120 && (
                        <button
                            onClick={() => setIsExpanded(!isExpanded)}
                            className="text-xs text-violet-400 hover:text-violet-300 mt-1 font-mono transition-colors"
                        >
                            {isExpanded ? "Show less" : "Read more"}
                        </button>
                    )}
                </div>

                {/* Metadata Grid */}
                <div className="px-5 pb-3 grid grid-cols-2 gap-2.5">
                    {/* Date */}
                    {event.eventDate && (
                        <div className="flex items-center gap-2 text-xs text-white/75 font-mono">
                            <Calendar className="w-3.5 h-3.5 text-emerald-400" />
                            <span>{formatDate(event.eventDate)}</span>
                        </div>
                    )}

                    {/* Location */}
                    <div className="flex items-center gap-2 text-xs text-white/75 font-mono">
                        {event.isVirtual ? (
                            <Globe className="w-3.5 h-3.5 text-blue-400" />
                        ) : (
                            <MapPin className="w-3.5 h-3.5 text-red-400" />
                        )}
                        <span className="truncate">{event.location}</span>
                    </div>

                    {/* Prize Pool */}
                    {event.prizePool && (
                        <div className="flex items-center gap-2 text-xs text-white/75 font-mono">
                            <Trophy className="w-3.5 h-3.5 text-amber-400" />
                            <span className="font-semibold">{event.prizePool}</span>
                        </div>
                    )}

                    {/* Team Size */}
                    {event.teamSize && (
                        <div className="flex items-center gap-2 text-xs text-white/75 font-mono">
                            <Users className="w-3.5 h-3.5 text-violet-400" />
                            <span>Team: {event.teamSize}</span>
                        </div>
                    )}

                    {/* Deadline */}
                    {event.registrationDeadline && (
                        <div className="flex items-center gap-2 text-xs text-white/75 font-mono">
                            <Clock className="w-3.5 h-3.5 text-amber-400" />
                            <span>Deadline: {formatDate(event.registrationDeadline)}</span>
                        </div>
                    )}

                    {/* Free/Paid */}
                    <div className="flex items-center gap-2 text-xs text-white/75 font-mono">
                        <Ticket className="w-3.5 h-3.5 text-green-400" />
                        <span className="font-medium">{event.isFree ? "Free" : "Paid"}</span>
                    </div>
                </div>

                {/* Footer: Actions */}
                <div className="px-5 pb-4 pt-3 border-t border-white/10 flex items-center justify-between">
                    <div className="flex items-center gap-3">
                        <span className="inline-flex items-center gap-1.5 text-[10px] text-white/60 font-mono font-medium">
                            <span className={cn("w-2 h-2 rounded-full", {
                                "bg-emerald-400 shadow-[0_0_6px_rgba(16,185,129,0.5)]": event.confidenceScore > 0.7,
                                "bg-amber-400 shadow-[0_0_6px_rgba(234,179,8,0.5)]": event.confidenceScore > 0.4,
                                "bg-red-400 shadow-[0_0_6px_rgba(239,68,68,0.5)]": event.confidenceScore <= 0.4,
                            })} />
                            {Math.round(event.confidenceScore * 100)}% match
                        </span>
                        {event.eligibility && (
                            <span className="text-[10px] text-white/55 font-mono">• {event.eligibility}</span>
                        )}
                    </div>

                    <div className="flex items-center gap-1.5">
                        {/* Copy link */}
                        <button
                            onClick={handleCopyLink}
                            className="h-8 w-8 rounded-lg flex items-center justify-center text-white/45 hover:text-white/80 hover:bg-white/10 transition-all"
                            title="Copy event link"
                        >
                            {copied ? (
                                <Check className="w-3.5 h-3.5 text-emerald-400" />
                            ) : (
                                <Copy className="w-3.5 h-3.5" />
                            )}
                        </button>

                        {/* Share (uses Web Share API if available) */}
                        <button
                            onClick={() => {
                                if (navigator.share) {
                                    navigator.share({
                                        title: event.title,
                                        text: `Check out ${event.title}`,
                                        url: event.rsvpUrl,
                                    }).catch(() => {});
                                } else {
                                    handleCopyLink();
                                }
                            }}
                            className="h-8 w-8 rounded-lg flex items-center justify-center text-white/45 hover:text-white/80 hover:bg-white/10 transition-all"
                            title="Share event"
                        >
                            <Share2 className="w-3.5 h-3.5" />
                        </button>

                        {/* RSVP button */}
                        <a
                            href={event.rsvpUrl}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="inline-flex"
                        >
                            <Button
                                size="sm"
                                className="h-9 px-5 bg-gradient-to-r from-violet-600 to-blue-600 hover:from-violet-500 hover:to-blue-500 text-white text-xs font-bold font-mono rounded-xl shadow-[0_0_20px_rgba(139,92,246,0.3)] hover:shadow-[0_0_35px_rgba(139,92,246,0.45)] transition-all duration-300 hover:scale-105"
                            >
                                <ExternalLink className="w-3.5 h-3.5 mr-1.5" />
                                RSVP / Apply
                            </Button>
                        </a>
                    </div>
                </div>
            </AuraCard>
        </motion.div>
    );
}
