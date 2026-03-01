"use client";

// ===================================================================
// MailFeed v3 — Premium Market Intelligence Feed
// Brand logos, rich HTML preview, image galleries, professional
// card layout with deep visual hierarchy
// ===================================================================

import { useEffect, useState, useMemo, useCallback, useRef } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
    Mail, Clock, Paperclip, Star, Eye, EyeOff, Calendar,
    RefreshCw, Inbox, Filter, ChevronDown, ChevronUp,
    ArrowUpRight, User, Loader2, AlertCircle, Sparkles,
    Brain, Zap, FileText, ArrowRight, X, MessageCircle,
    Shield, TrendingUp, Bell, Search, Hash, MailOpen,
    Activity, Signal, Cpu, Image as ImageIcon, ExternalLink,
    Globe, LayoutGrid, Type
} from "lucide-react";
import { useMailStore, type MailItem, type DateRange } from "@/hooks/use-mail-store";
import type { FilterIntent } from "@/lib/mail/mail-filter-engine";
import { MailConnect } from "./mail-connect";
import { MailChat } from "./mail-chat";
import { cn } from "@/lib/utils";
import { formatDistanceToNow, format } from "date-fns";

// ─── Category colour map ───
const CATEGORY_STYLES: Record<string, { bg: string; text: string; border: string; icon: string }> = {
    academic:       { bg: "bg-blue-500/15",    text: "text-blue-300",    border: "border-blue-500/25", icon: "📚" },
    administrative: { bg: "bg-slate-500/15",   text: "text-slate-300",   border: "border-slate-500/25", icon: "📋" },
    opportunity:    { bg: "bg-emerald-500/15", text: "text-emerald-300", border: "border-emerald-500/25", icon: "🎯" },
    social:         { bg: "bg-pink-500/15",    text: "text-pink-300",    border: "border-pink-500/25", icon: "💬" },
    financial:      { bg: "bg-amber-500/15",   text: "text-amber-300",   border: "border-amber-500/25", icon: "💰" },
    technical:      { bg: "bg-cyan-500/15",    text: "text-cyan-300",    border: "border-cyan-500/25", icon: "⚙️" },
    newsletter:     { bg: "bg-violet-500/15",  text: "text-violet-300",  border: "border-violet-500/25", icon: "📰" },
    personal:       { bg: "bg-rose-500/15",    text: "text-rose-300",    border: "border-rose-500/25", icon: "👤" },
    other:          { bg: "bg-white/[0.08]",   text: "text-white/60",    border: "border-white/10", icon: "📄" },
};

const SENTIMENT_STYLES: Record<string, { dot: string; label: string; color: string }> = {
    urgent:   { dot: "bg-red-500 shadow-[0_0_6px_rgba(239,68,68,0.6)] animate-pulse", label: "Urgent", color: "text-red-400" },
    negative: { dot: "bg-orange-500 shadow-[0_0_6px_rgba(249,115,22,0.5)]", label: "Negative", color: "text-orange-400" },
    positive: { dot: "bg-emerald-500 shadow-[0_0_6px_rgba(16,185,129,0.5)]", label: "Positive", color: "text-emerald-400" },
    neutral:  { dot: "bg-white/30", label: "Neutral", color: "text-white/40" },
};

const DATE_RANGES: { value: DateRange; label: string }[] = [
    { value: "1d", label: "Today" },
    { value: "3d", label: "3 Days" },
    { value: "1w", label: "1 Week" },
    { value: "2w", label: "2 Weeks" },
    { value: "1m", label: "1 Month" },
];

// ─── Colour hash for sender avatars (fallback) ───
function hashColor(str: string): string {
    const colors = [
        "from-violet-500 to-purple-600", "from-cyan-500 to-blue-600",
        "from-emerald-500 to-teal-600", "from-amber-500 to-orange-600",
        "from-rose-500 to-pink-600", "from-indigo-500 to-blue-600",
        "from-fuchsia-500 to-purple-600", "from-sky-500 to-cyan-600",
    ];
    let hash = 0;
    for (let i = 0; i < str.length; i++) hash = str.charCodeAt(i) + ((hash << 5) - hash);
    return colors[Math.abs(hash) % colors.length];
}

// ─── Clean snippet for display (strip URLs, excess whitespace) ───
function cleanSnippet(raw: string): string {
    return raw
        .replace(/\[?https?:\/\/[^\s\]){}>]+\]?/gi, "")
        .replace(/\{[^}]*\}/g, "")
        .replace(/[<>]/g, "")
        .replace(/\s+/g, " ")
        .trim();
}

// ─── Extract root domain (e.g. "no-reply.hack2skill.com" → "hack2skill.com") ───
function getRootDomain(domain: string): string {
    const parts = domain.split(".");
    if (parts.length <= 2) return domain;
    // Handle country-code TLDs like co.in, co.uk, com.au
    const ccSlds = ["co", "com", "org", "net", "ac", "gov", "edu"];
    if (parts.length >= 3 && ccSlds.includes(parts[parts.length - 2]) && parts[parts.length - 1].length === 2) {
        return parts.slice(-3).join(".");
    }
    return parts.slice(-2).join(".");
}

// ─── Brand Logo with aggressive multi-source fallback ───
function BrandLogo({ address, name, size = "md" }: {
    address: string; name: string; size?: "sm" | "md" | "lg";
}) {
    const [phase, setPhase] = useState(0); // 0=loading, 1..N=trying sources, -1=fallback
    const [currentSrc, setCurrentSrc] = useState<string | null>(null);
    const domain = address.split("@")[1] || "";
    const rootDomain = getRootDomain(domain);
    const avatarColor = hashColor(address);

    const sizeMap = {
        sm: { box: "w-10 h-10 rounded-lg", text: "text-sm", img: 24 },
        md: { box: "w-14 h-14 rounded-xl", text: "text-base", img: 36 },
        lg: { box: "w-20 h-20 rounded-2xl", text: "text-xl", img: 52 },
    };
    const s = sizeMap[size];

    // Build ordered list of logo sources to try
    const sources = useMemo(() => {
        if (!domain) return [];
        const srcs: string[] = [];
        // 1. Clearbit (root domain — best quality)
        srcs.push(`https://logo.clearbit.com/${rootDomain}`);
        // 2. Clearbit with full subdomain (for unique brands like mail.google.com)
        if (rootDomain !== domain) srcs.push(`https://logo.clearbit.com/${domain}`);
        // 3. Google favicons (root domain)
        srcs.push(`https://www.google.com/s2/favicons?domain=${rootDomain}&sz=128`);
        // 4. Direct favicon.ico from root domain
        srcs.push(`https://${rootDomain}/favicon.ico`);
        // 5. DuckDuckGo icons (another source)
        srcs.push(`https://icons.duckduckgo.com/ip3/${rootDomain}.ico`);
        return srcs;
    }, [domain, rootDomain]);

    // Reset on domain change
    useEffect(() => {
        if (sources.length === 0) { setPhase(-1); return; }
        setPhase(0);
        setCurrentSrc(sources[0]);
    }, [sources]);

    const handleError = useCallback(() => {
        setPhase(prev => {
            const next = prev + 1;
            if (next < sources.length) {
                setCurrentSrc(sources[next]);
                return next;
            }
            setCurrentSrc(null);
            return -1;
        });
    }, [sources]);

    // Also detect "loaded but blank" — Google favicons sometimes return a 1x1 or 16x16 default
    const handleLoad = useCallback((e: React.SyntheticEvent<HTMLImageElement>) => {
        const img = e.currentTarget;
        // If natural size is tiny (≤16px) and we're on a Google favicon source, skip to next
        if (img.naturalWidth <= 16 && img.naturalHeight <= 16 && currentSrc?.includes("google.com/s2/favicons")) {
            handleError();
        }
    }, [currentSrc, handleError]);

    if (currentSrc && phase >= 0) {
        return (
            <div className={cn(
                s.box,
                "relative shrink-0 bg-white/[0.08] border border-white/[0.10] flex items-center justify-center overflow-hidden backdrop-blur-sm",
                "shadow-[0_2px_12px_rgba(0,0,0,0.3),inset_0_1px_0_rgba(255,255,255,0.05)]"
            )}>
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                    src={currentSrc}
                    alt={`${name} logo`}
                    width={s.img}
                    height={s.img}
                    className="object-contain"
                    onError={handleError}
                    onLoad={handleLoad}
                    loading="lazy"
                    referrerPolicy="no-referrer"
                />
                <div className="absolute inset-0 bg-gradient-to-br from-white/[0.03] to-transparent pointer-events-none" />
            </div>
        );
    }

    // Ultimate fallback: coloured initial avatar
    return (
        <div className={cn(
            s.box,
            "shrink-0 flex items-center justify-center font-black tracking-wide",
            "bg-gradient-to-br shadow-lg ring-2 ring-white/[0.08]",
            avatarColor, "text-white", s.text
        )}>
            {name[0]?.toUpperCase() || "?"}
        </div>
    );
}

// ─── Rich HTML Viewer (sandboxed iframe) ───
function HtmlViewer({ html }: { html: string }) {
    const iframeRef = useRef<HTMLIFrameElement>(null);
    const [height, setHeight] = useState(300);

    useEffect(() => {
        const iframe = iframeRef.current;
        if (!iframe) return;
        const doc = iframe.contentDocument || iframe.contentWindow?.document;
        if (!doc) return;

        doc.open();
        doc.write(`<!DOCTYPE html><html><head><style>
            * { box-sizing: border-box; }
            body { margin:0; padding:16px; font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif; font-size:13px; line-height:1.6; color:rgba(255,255,255,0.78); background:transparent; word-break:break-word; overflow-wrap:break-word; }
            a { color:#818cf8; text-decoration:underline; }
            img { max-width:100%; height:auto; border-radius:8px; margin:8px 0; }
            table { border-collapse:collapse; max-width:100%; }
            td,th { padding:6px 10px; border:1px solid rgba(255,255,255,0.08); }
            h1,h2,h3,h4 { color:rgba(255,255,255,0.9); margin:12px 0 6px; }
            blockquote { border-left:3px solid rgba(139,92,246,0.4); margin:8px 0; padding:4px 12px; color:rgba(255,255,255,0.5); }
            pre,code { background:rgba(255,255,255,0.05); padding:2px 6px; border-radius:4px; font-size:12px; }
            hr { border:none; border-top:1px solid rgba(255,255,255,0.08); margin:16px 0; }
            ul,ol { padding-left:20px; }
            p { margin:0 0 10px; }
        </style></head><body>${html}</body></html>`);
        doc.close();

        const resize = () => { if (doc.body) setHeight(Math.min(Math.max(doc.body.scrollHeight + 32, 150), 800)); };
        setTimeout(resize, 100);
        setTimeout(resize, 500);
    }, [html]);

    return (
        <iframe
            ref={iframeRef}
            className="w-full rounded-xl border-0 bg-transparent"
            style={{ height }}
            sandbox="allow-same-origin"
            title="Email content"
        />
    );
}

// ─── Domain Badge ───
function DomainBadge({ domain }: { domain: string }) {
    if (!domain) return null;
    const clean = domain.replace(/^(mail\.|email\.|newsletter\.|noreply\.)/, "");
    return (
        <span className="inline-flex items-center gap-1 text-[11px] font-mono text-white/40 px-2 py-0.5 rounded-md bg-white/[0.04] border border-white/[0.06] truncate max-w-[180px]">
            <Globe className="h-2.5 w-2.5 shrink-0" />
            {clean}
        </span>
    );
}

// ─── Single Mail Card (Premium v3) ───
function MailCard({ mail, index }: { mail: MailItem; index: number }) {
    const { selectedMails, toggleMailSelection, isClassifying } = useMailStore();
    const [expanded, setExpanded] = useState(false);
    const [viewMode, setViewMode] = useState<"formatted" | "raw">("formatted");
    const isUnread = !mail.flags.includes("\\Seen");
    const isSelected = selectedMails.includes(mail.uid);
    const timeAgo = formatDistanceToNow(new Date(mail.date), { addSuffix: true });
    const dateStr = format(new Date(mail.date), "MMM d, h:mm a");
    const s = mail.summary;
    const senderName = mail.from.name || mail.from.address.split("@")[0];
    const senderDomain = mail.from.address.split("@")[1] || "";
    const isAnalyzing = isClassifying && mail.nlRelevant === undefined;
    const cleanedSnippet = cleanSnippet(mail.snippet || "");
    const hasImages = (mail.images?.length || 0) > 0;
    const hasHtml = !!(mail.htmlBody && mail.htmlBody.length > 50);

    return (
        <motion.div
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.25, delay: Math.min(index * 0.03, 0.35) }}
            className={cn(
                "group relative rounded-2xl border-2 backdrop-blur-xl transition-all duration-300 cursor-pointer overflow-hidden",
                isAnalyzing ? "opacity-50 bg-white/[0.02] border-white/[0.05] grayscale-[40%] scale-[0.99]" : "hover:scale-[1.003]",
                !isAnalyzing && isSelected
                    ? "bg-violet-500/[0.12] border-violet-400/50 shadow-[0_0_50px_rgba(139,92,246,0.2),inset_0_1px_0_rgba(255,255,255,0.05)] ring-2 ring-violet-400/40"
                    : !isAnalyzing && s?.actionRequired
                        ? "bg-gradient-to-br from-amber-500/[0.08] to-orange-500/[0.04] border-amber-500/30 hover:border-amber-400/50 hover:shadow-[0_4px_40px_rgba(245,158,11,0.15)]"
                        : !isAnalyzing && s?.priority === "high"
                            ? "bg-gradient-to-br from-red-500/[0.08] to-rose-500/[0.04] border-red-500/30 hover:border-red-400/45 hover:shadow-[0_4px_40px_rgba(239,68,68,0.15)]"
                            : !isAnalyzing && isUnread
                                ? "bg-gradient-to-br from-violet-500/[0.06] via-black/40 to-cyan-500/[0.04] border-violet-500/25 hover:border-violet-400/40 hover:shadow-[0_4px_40px_rgba(139,92,246,0.12)]"
                                : "bg-black/40 border-white/[0.08] hover:border-white/[0.18] hover:bg-black/50 hover:shadow-[0_4px_30px_rgba(0,0,0,0.3)]"
            )}
            onClick={() => setExpanded(!expanded)}
        >
            {/* Selection Checkbox */}
            <div
                className="absolute top-5 right-5 z-10"
                onClick={(e) => {
                    e.stopPropagation();
                    toggleMailSelection(mail.uid);
                }}
            >
                <div className={cn(
                    "w-5 h-5 rounded-md border-2 flex items-center justify-center transition-all duration-200",
                    isSelected
                        ? "bg-violet-500 border-violet-400 text-white shadow-[0_0_10px_rgba(139,92,246,0.4)] scale-110"
                        : "bg-black/60 border-white/15 text-transparent hover:border-violet-400/50 hover:bg-violet-500/10"
                )}>
                    {isSelected && <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" className="w-3 h-3"><polyline points="20 6 9 17 4 12"></polyline></svg>}
                </div>
            </div>
            {/* Top priority gradient bar */}
            {s && (
                <div className={cn(
                    "absolute top-0 left-0 right-0 h-[3px]",
                    s.priority === "high" ? "bg-gradient-to-r from-red-500 via-red-400 to-red-500/0 shadow-[0_2px_8px_rgba(239,68,68,0.3)]" :
                        s.priority === "medium" ? "bg-gradient-to-r from-amber-500 via-amber-400 to-amber-500/0 shadow-[0_2px_8px_rgba(245,158,11,0.25)]" :
                            "bg-gradient-to-r from-emerald-500/60 via-emerald-400/30 to-transparent"
                )} />
            )}
            {/* Subtle inner glow at top */}
            <div className="absolute top-0 left-0 right-0 h-16 bg-gradient-to-b from-white/[0.02] to-transparent pointer-events-none" />

            <div className="p-5">
                {/* Header Row */}
                <div className="flex items-start gap-4">
                    {/* Brand Logo */}
                    <div className="relative shrink-0">
                        <BrandLogo address={mail.from.address} name={senderName} size="md" />
                        {isUnread && (
                            <div className="absolute -top-1 -right-1 w-3.5 h-3.5 rounded-full bg-violet-500 border-2 border-black shadow-[0_0_10px_rgba(139,92,246,0.7)] animate-pulse" />
                        )}
                    </div>

                    <div className="flex-1 min-w-0">
                        {/* Sender + Domain + Time */}
                        <div className="flex items-center justify-between gap-2 mb-1">
                            <div className="flex items-center gap-2.5 min-w-0">
                                <span className={cn(
                                    "text-sm font-mono truncate",
                                    isUnread ? "font-extrabold text-white drop-shadow-[0_0_8px_rgba(255,255,255,0.1)]" : "font-semibold text-white/85"
                                )}>
                                    {senderName}
                                </span>
                                <DomainBadge domain={senderDomain} />
                            </div>
                            <div className="flex items-center gap-2.5 shrink-0">
                                {isAnalyzing && (
                                    <span className="flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-violet-500/15 border border-violet-500/25 text-[10px] font-mono text-violet-300 shadow-[0_0_12px_rgba(139,92,246,0.15)] animate-pulse">
                                        <Loader2 className="h-2.5 w-2.5 animate-spin" />
                                        Analysing...
                                    </span>
                                )}
                                <span className="text-xs font-mono text-white/45 px-2 py-0.5 rounded-md bg-white/[0.03]">{timeAgo}</span>
                            </div>
                        </div>

                        {/* Subject */}
                        <h4 className={cn(
                            "text-[15px] leading-snug mb-3 pr-8",
                            isUnread ? "font-bold text-white" : "font-semibold text-white/80"
                        )}>
                            {mail.subject}
                        </h4>

                        {/* AI Summary one-liner */}
                        {s ? (
                            <div className="flex items-start gap-2.5 mb-3 px-3.5 py-3 rounded-xl bg-gradient-to-r from-cyan-500/[0.08] via-blue-500/[0.04] to-transparent border border-cyan-500/15 shadow-[inset_0_1px_0_rgba(6,182,212,0.06)]">
                                <Sparkles className="h-3.5 w-3.5 text-cyan-400 shrink-0 mt-0.5 drop-shadow-[0_0_4px_rgba(6,182,212,0.5)]" />
                                <p className="text-[13px] text-cyan-100/85 leading-relaxed font-medium line-clamp-2">
                                    {s.oneLiner}
                                </p>
                            </div>
                        ) : (
                            <div className="mb-3 px-3.5 py-3 rounded-xl bg-white/[0.03] border border-white/[0.06]">
                                <p className="text-[13px] text-white/55 line-clamp-3 leading-relaxed whitespace-normal">
                                    {cleanedSnippet || "(No preview available)"}
                                </p>
                            </div>
                        )}

                        {/* Tags Row */}
                        <div className="flex items-center gap-2 flex-wrap">
                            {s?.priority === "high" && (
                                <span className="text-[11px] font-mono font-black px-2.5 py-1 rounded-lg bg-red-500/20 text-red-300 border border-red-500/30 flex items-center gap-1.5 shadow-[0_0_12px_rgba(239,68,68,0.15)] animate-pulse">
                                    <TrendingUp className="h-2.5 w-2.5" /> URGENT
                                </span>
                            )}
                            {s?.priority === "medium" && (
                                <span className="text-[11px] font-mono font-bold px-2.5 py-1 rounded-lg bg-amber-500/20 text-amber-300 border border-amber-500/25 flex items-center gap-1">
                                    <span className="w-1.5 h-1.5 rounded-full bg-amber-400"></span> IMPORTANT
                                </span>
                            )}
                            {s?.actionRequired && (
                                <span className="text-[11px] font-mono font-black px-2.5 py-1 rounded-lg bg-gradient-to-r from-amber-500/20 to-orange-500/15 text-amber-300 border border-amber-500/30 flex items-center gap-1.5 shadow-[0_0_12px_rgba(245,158,11,0.12)]">
                                    <Zap className="h-2.5 w-2.5 drop-shadow-[0_0_3px_rgba(245,158,11,0.5)]" /> ACTION REQUIRED
                                </span>
                            )}
                            {mail.hasAttachments && (
                                <span className="flex items-center gap-1.5 text-[11px] font-mono font-medium text-white/60 px-2.5 py-1 rounded-lg bg-white/[0.06] border border-white/[0.10]">
                                    <Paperclip className="h-2.5 w-2.5" /> ATTACHMENT
                                </span>
                            )}
                            {mail.nlReason && (
                                <span className="text-[11px] font-mono text-violet-300/70 italic truncate max-w-[260px] px-2.5 py-1 rounded-lg bg-violet-500/[0.10] border border-violet-500/20">
                                    ↳ {mail.nlReason}
                                </span>
                            )}
                            {hasImages && !expanded && (
                                <span className="flex items-center gap-1.5 text-[10px] font-mono text-white/40 px-2.5 py-1 rounded-lg bg-white/[0.04] border border-white/[0.06]">
                                    <ImageIcon className="h-3 w-3" /> {mail.images!.length} image{mail.images!.length > 1 ? "s" : ""}
                                </span>
                            )}
                            <span className="text-[11px] font-mono text-white/40 ml-auto px-2 py-0.5 rounded bg-white/[0.03]">{dateStr}</span>
                        </div>

                        {/* ─── Collapsed Image Thumbnail Strip ─── */}
                        {hasImages && !expanded && (
                            <div className="mt-3 flex items-center gap-2">
                                <div className="flex items-center gap-1.5 overflow-hidden">
                                    {mail.images!.slice(0, 4).map((src, idx) => (
                                        <div key={idx} className="relative w-14 h-10 rounded-lg overflow-hidden border border-white/[0.10] bg-black/40 shrink-0">
                                            {/* eslint-disable-next-line @next/next/no-img-element */}
                                            <img
                                                src={src}
                                                alt={`Preview ${idx + 1}`}
                                                className="w-full h-full object-cover"
                                                loading="lazy"
                                                referrerPolicy="no-referrer"
                                            />
                                        </div>
                                    ))}
                                    {mail.images!.length > 4 && (
                                        <div className="w-14 h-10 rounded-lg border border-white/[0.08] bg-black/60 flex items-center justify-center shrink-0">
                                            <span className="text-[10px] font-mono text-white/50">+{mail.images!.length - 4}</span>
                                        </div>
                                    )}
                                </div>
                            </div>
                        )}
                    </div>

                    {/* Expand indicator */}
                    <div className="shrink-0 mt-2">
                        <div className={cn(
                            "w-8 h-8 rounded-xl flex items-center justify-center transition-all duration-300",
                            expanded ? "bg-violet-500/25 text-violet-400 shadow-[0_0_12px_rgba(139,92,246,0.2)] border border-violet-500/30" : "bg-white/[0.04] text-white/25 group-hover:text-white/50 group-hover:bg-white/[0.08] border border-transparent group-hover:border-white/[0.08]"
                        )}>
                            {expanded ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
                        </div>
                    </div>
                </div>
            </div>

            {/* Expanded Detail */}
            <AnimatePresence>
                {expanded && (
                    <motion.div
                        initial={{ opacity: 0, height: 0 }}
                        animate={{ opacity: 1, height: "auto" }}
                        exit={{ opacity: 0, height: 0 }}
                        className="overflow-hidden"
                    >
                        <div className="px-5 pb-5 pt-0">
                            <div className="border-t border-white/[0.08] pt-5">
                                {/* AI Intelligence Card */}
                                {s && (
                                    <div className="mb-5 p-5 rounded-2xl bg-gradient-to-br from-cyan-500/[0.08] via-blue-500/[0.05] to-violet-500/[0.06] border border-cyan-500/20 shadow-[0_4px_30px_rgba(6,182,212,0.06),inset_0_1px_0_rgba(255,255,255,0.03)]">
                                        <div className="flex items-center gap-2.5 mb-4">
                                            <div className="p-2 bg-cyan-500/20 rounded-xl border border-cyan-500/20 shadow-[0_0_10px_rgba(6,182,212,0.15)]">
                                                <Brain className="h-4 w-4 text-cyan-400 drop-shadow-[0_0_5px_rgba(6,182,212,0.5)]" />
                                            </div>
                                            <span className="text-[11px] font-mono text-cyan-400/80 uppercase tracking-[0.2em] font-bold">AI Intelligence Summary</span>
                                        </div>
                                        <h5 className="text-[15px] font-bold text-white/90 mb-4 leading-snug">{s.title}</h5>

                                        {s.senderContext && (
                                            <div className="flex items-start gap-2.5 mb-4 bg-black/30 p-3.5 rounded-xl border border-white/[0.06]">
                                                <div className="p-1 bg-white/[0.06] rounded-lg shrink-0 mt-0.5">
                                                    <User className="h-3.5 w-3.5 text-white/50" />
                                                </div>
                                                <p className="text-[12px] text-white/65 leading-relaxed font-mono">
                                                    {s.senderContext}
                                                </p>
                                            </div>
                                        )}

                                        {s.keyPoints.length > 0 && (
                                            <div className="space-y-2.5">
                                                {s.keyPoints.map((kp, i) => (
                                                    <div key={i} className="flex items-start gap-3">
                                                        <div className="w-5 h-5 rounded-md bg-cyan-500/15 border border-cyan-500/20 shrink-0 mt-0.5 flex items-center justify-center shadow-[0_0_6px_rgba(6,182,212,0.15)]">
                                                            <span className="text-[10px] font-bold font-mono text-cyan-400">{i + 1}</span>
                                                        </div>
                                                        <span className="text-[12px] text-white/65 leading-relaxed">{kp}</span>
                                                    </div>
                                                ))}
                                            </div>
                                        )}

                                        {s.deadline && (
                                            <div className="mt-5 inline-flex items-center gap-2.5 px-4 py-2 rounded-xl bg-red-500/15 border border-red-500/25 shadow-[0_0_20px_rgba(239,68,68,0.1)]">
                                                <AlertCircle className="h-3.5 w-3.5 text-red-400 drop-shadow-[0_0_4px_rgba(239,68,68,0.5)]" />
                                                <span className="text-[11px] font-mono font-bold text-red-300 uppercase tracking-wider">
                                                    Deadline: {s.deadline}
                                                </span>
                                            </div>
                                        )}

                                        {/* Follow-up Actions */}
                                        {s.followUps && s.followUps.length > 0 && (
                                            <div className="mt-5">
                                                <div className="text-[10px] font-mono text-amber-400/60 uppercase tracking-[0.15em] font-bold mb-2.5 flex items-center gap-1.5">
                                                    <ArrowRight className="h-3 w-3" /> Follow-up Actions
                                                </div>
                                                <div className="space-y-1.5">
                                                    {s.followUps.map((fu, i) => (
                                                        <div key={i} className="flex items-start gap-2.5 px-3 py-2 rounded-lg bg-amber-500/[0.06] border border-amber-500/15">
                                                            <div className="w-4 h-4 rounded-md border border-amber-500/30 bg-amber-500/10 shrink-0 mt-0.5 flex items-center justify-center">
                                                                <span className="text-[9px] font-bold text-amber-400">{i + 1}</span>
                                                            </div>
                                                            <span className="text-[11px] text-amber-200/80 leading-relaxed">{fu}</span>
                                                        </div>
                                                    ))}
                                                </div>
                                            </div>
                                        )}

                                        {/* Extracted Entities */}
                                        {s.entities && s.entities.length > 0 && (
                                            <div className="mt-4">
                                                <div className="text-[10px] font-mono text-violet-400/60 uppercase tracking-[0.15em] font-bold mb-2 flex items-center gap-1.5">
                                                    <Hash className="h-3 w-3" /> Key Entities
                                                </div>
                                                <div className="flex flex-wrap gap-1.5">
                                                    {s.entities.map((e, i) => (
                                                        <span key={i} className="text-[11px] font-mono px-2.5 py-1 rounded-lg bg-violet-500/[0.08] border border-violet-500/15 text-violet-300/80">
                                                            {e}
                                                        </span>
                                                    ))}
                                                </div>
                                            </div>
                                        )}

                                        {/* Category + Sentiment Footer */}
                                        <div className="mt-5 pt-4 border-t border-white/[0.05] flex items-center gap-3 flex-wrap">
                                            {s.category && CATEGORY_STYLES[s.category] && (
                                                <span className={cn(
                                                    "text-[11px] font-mono font-bold px-3 py-1.5 rounded-lg border uppercase tracking-wider flex items-center gap-1.5",
                                                    CATEGORY_STYLES[s.category].bg,
                                                    CATEGORY_STYLES[s.category].text,
                                                    CATEGORY_STYLES[s.category].border
                                                )}>
                                                    <span className="text-[11px]">{CATEGORY_STYLES[s.category].icon}</span>
                                                    {s.category}
                                                </span>
                                            )}
                                            {s.sentiment && SENTIMENT_STYLES[s.sentiment] && (
                                                <span className="flex items-center gap-1.5 text-[11px] font-mono text-white/50 px-3 py-1.5 rounded-lg bg-white/[0.04] border border-white/[0.06]">
                                                    <span className={cn("w-2 h-2 rounded-full", SENTIMENT_STYLES[s.sentiment].dot)} />
                                                    {SENTIMENT_STYLES[s.sentiment].label}
                                                </span>
                                            )}
                                        </div>
                                    </div>
                                )}

                                {/* ─── Image Gallery ─── */}
                                {hasImages && (
                                    <div className="mt-5 rounded-2xl bg-black/50 border border-white/[0.06] overflow-hidden">
                                        <div className="flex items-center gap-2 px-5 py-3 border-b border-white/[0.06] bg-white/[0.02]">
                                            <ImageIcon className="h-3.5 w-3.5 text-white/30" />
                                            <span className="text-[10px] font-mono text-white/40 uppercase tracking-[0.15em] font-bold">
                                                Attached Images ({mail.images!.length})
                                            </span>
                                        </div>
                                        <div className="p-4 grid grid-cols-2 sm:grid-cols-3 gap-3">
                                            {mail.images!.map((src, idx) => (
                                                <a
                                                    key={idx}
                                                    href={src}
                                                    target="_blank"
                                                    rel="noopener noreferrer"
                                                    onClick={(e) => e.stopPropagation()}
                                                    className="group/img relative rounded-xl overflow-hidden border border-white/[0.08] hover:border-violet-500/40 transition-all bg-black/40 aspect-[4/3]"
                                                >
                                                    {/* eslint-disable-next-line @next/next/no-img-element */}
                                                    <img
                                                        src={src}
                                                        alt={`Image ${idx + 1}`}
                                                        className="w-full h-full object-cover transition-transform duration-300 group-hover/img:scale-105"
                                                        loading="lazy"
                                                    />
                                                    <div className="absolute inset-0 bg-gradient-to-t from-black/60 via-transparent to-transparent opacity-0 group-hover/img:opacity-100 transition-opacity flex items-end justify-between p-2.5">
                                                        <span className="text-[10px] font-mono text-white/70">{idx + 1}/{mail.images!.length}</span>
                                                        <ExternalLink className="h-3.5 w-3.5 text-white/70" />
                                                    </div>
                                                </a>
                                            ))}
                                        </div>
                                    </div>
                                )}

                                {/* Email Content Viewer with Format Toggle */}
                                <div className="mt-5 rounded-2xl bg-black/50 border border-white/[0.06] overflow-hidden shadow-[inset_0_2px_10px_rgba(0,0,0,0.3)]">
                                    {/* Viewer Header with Toggle */}
                                    <div className="flex items-center justify-between px-5 py-3 border-b border-white/[0.06] bg-white/[0.02]">
                                        <div className="flex items-center gap-2">
                                            <FileText className="h-3.5 w-3.5 text-white/30" />
                                            <span className="text-[10px] font-mono text-white/40 uppercase tracking-[0.15em] font-bold">Email Content</span>
                                        </div>
                                        {hasHtml && (
                                            <div className="flex items-center gap-0.5 p-0.5 bg-black/40 border border-white/[0.06] rounded-lg">
                                                <button
                                                    onClick={(e) => { e.stopPropagation(); setViewMode("formatted"); }}
                                                    className={cn(
                                                        "flex items-center gap-1.5 px-3 py-1.5 rounded-md text-[10px] font-mono font-bold tracking-wider transition-all",
                                                        viewMode === "formatted"
                                                            ? "bg-violet-500/20 text-violet-300 border border-violet-500/25"
                                                            : "text-white/30 hover:text-white/50"
                                                    )}
                                                >
                                                    <LayoutGrid className="h-2.5 w-2.5" /> FORMATTED
                                                </button>
                                                <button
                                                    onClick={(e) => { e.stopPropagation(); setViewMode("raw"); }}
                                                    className={cn(
                                                        "flex items-center gap-1.5 px-3 py-1.5 rounded-md text-[10px] font-mono font-bold tracking-wider transition-all",
                                                        viewMode === "raw"
                                                            ? "bg-white/[0.08] text-white/60 border border-white/[0.10]"
                                                            : "text-white/30 hover:text-white/50"
                                                    )}
                                                >
                                                    <Type className="h-2.5 w-2.5" /> PLAIN TEXT
                                                </button>
                                            </div>
                                        )}
                                    </div>

                                    {/* Content Area */}
                                    <div className="max-h-[600px] overflow-y-auto custom-scrollbar">
                                        {viewMode === "formatted" && hasHtml ? (
                                            <div className="p-1" onClick={(e) => e.stopPropagation()}>
                                                <HtmlViewer html={mail.htmlBody!} />
                                            </div>
                                        ) : (
                                            <div className="p-5">
                                                <pre className="text-[12px] text-white/45 font-mono whitespace-pre-wrap break-all leading-[1.7]">
                                                    {mail.body.substring(0, 5000) || "(No text content)"}
                                                </pre>
                                            </div>
                                        )}
                                    </div>
                                </div>

                                {/* Metadata */}
                                <div className="mt-3 flex items-center gap-2 text-[11px] font-mono text-white/35">
                                    <Mail className="h-2.5 w-2.5" />
                                    <span>{mail.from.address}</span>
                                    <span className="text-white/15">|</span>
                                    <span>{dateStr}</span>
                                    {mail.to && mail.to.length > 0 && (
                                        <><span className="text-white/15">|</span><span className="truncate max-w-[180px]">To: {mail.to.map(t => t.address).join(", ")}</span></>
                                    )}
                                </div>
                            </div>
                        </div>
                    </motion.div>
                )}
            </AnimatePresence>
        </motion.div>
    );
}

// ─── Main Feed ───
export function MailFeed() {
    const {
        isConnected, isLoading, error, mails, filteredMails,
        dateRange, setDateRange, fetchMails, filters, setFilters,
        activeFolder, folders, setActiveFolder,
        applyNLFilter, summariseAll, summariseSelected,
        isSummarising, isClassifying, summariseProgress,
        selectedMails, selectAllMails, clearMailSelection,
        filterIntent, isParsingIntent
    } = useMailStore();

    const [showFilters, setShowFilters] = useState(false);
    const [keywordInput, setKeywordInput] = useState("");
    const [nlInput, setNlInput] = useState(filters.nlPrompt);
    const [chatOpen, setChatOpen] = useState(false);

    const hasActiveFilters = filters.unreadOnly || filters.hasAttachments ||
        filters.senders.length > 0 || filters.keywords.length > 0 || filters.nlPrompt.trim().length > 0;
    const displayMails = hasActiveFilters ? filteredMails : mails;
    const unreadCount = mails.filter(m => !m.flags.includes("\\Seen")).length;
    const summarisedCount = mails.filter(m => m.summary).length;
    const highPriority = mails.filter(m => m.summary?.priority === "high").length;
    const actionRequired = mails.filter(m => m.summary?.actionRequired).length;
    const totalImages = mails.reduce((sum, m) => sum + (m.images?.length || 0), 0);

    // Top senders for stats
    const topSenders = useMemo(() => {
        const counts: Record<string, number> = {};
        mails.forEach(m => {
            const key = m.from.name || m.from.address;
            counts[key] = (counts[key] || 0) + 1;
        });
        return Object.entries(counts).sort((a, b) => b[1] - a[1]).slice(0, 3);
    }, [mails]);

    if (!isConnected) {
        return <MailConnect />;
    }

    return (
        <div className="flex h-full">
            {/* Left: Mail Feed */}
            <div className={cn("flex flex-col h-full overflow-hidden", chatOpen ? "w-[60%]" : "w-full")}>
                {/* Top Dashboard Bar */}
                <div className="shrink-0 p-4 pb-0 space-y-3">
                    {/* Connection + Stats Row */}
                    <div className="flex items-center justify-between gap-4">
                        <div className="flex items-center gap-3">
                            {/* Status indicator */}
                            <div className="flex items-center gap-2 px-3 py-2 bg-emerald-500/[0.08] border border-emerald-500/20 rounded-xl">
                                <span className="relative flex h-2 w-2">
                                    <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75" />
                                    <span className="relative inline-flex rounded-full h-2 w-2 bg-emerald-500" />
                                </span>
                                <span className="text-[10px] font-mono font-bold text-emerald-300">LIVE</span>
                            </div>

                            {/* Mail stats */}
                            <div className="flex items-center gap-3 px-3 py-1.5 bg-black/30 rounded-xl border border-white/[0.08]">
                                <div className="flex items-center gap-1.5">
                                    <Inbox className="h-3.5 w-3.5 text-white/50" />
                                    <span className="text-sm font-bold font-mono text-white">{mails.length}</span>
                                    <span className="text-[11px] font-mono text-white/55 uppercase">total</span>
                                </div>
                                <div className="w-px h-4 bg-white/[0.06]" />
                                <div className="flex items-center gap-1.5">
                                    <MailOpen className="h-3.5 w-3.5 text-violet-400/70" />
                                    <span className="text-sm font-bold font-mono text-violet-300">{unreadCount}</span>
                                    <span className="text-[11px] font-mono text-white/55 uppercase">unread</span>
                                </div>
                                {summarisedCount > 0 && (
                                    <>
                                        <div className="w-px h-4 bg-white/[0.06]" />
                                        <div className="flex items-center gap-1.5">
                                            <Brain className="h-3.5 w-3.5 text-cyan-400/70" />
                                            <span className="text-sm font-bold font-mono text-cyan-300">{summarisedCount}</span>
                                            <span className="text-[11px] font-mono text-white/55 uppercase">analysed</span>
                                        </div>
                                    </>
                                )}
                                {highPriority > 0 && (
                                    <>
                                        <div className="w-px h-4 bg-white/[0.06]" />
                                        <div className="flex items-center gap-1.5">
                                            <Bell className="h-3.5 w-3.5 text-red-400/70" />
                                            <span className="text-sm font-bold font-mono text-red-300">{highPriority}</span>
                                            <span className="text-[11px] font-mono text-white/55 uppercase">urgent</span>
                                        </div>
                                    </>
                                )}
                                {totalImages > 0 && (
                                    <>
                                        <div className="w-px h-4 bg-white/[0.06]" />
                                        <div className="flex items-center gap-1.5">
                                            <ImageIcon className="h-3.5 w-3.5 text-violet-400/70" />
                                            <span className="text-sm font-bold font-mono text-violet-300">{totalImages}</span>
                                            <span className="text-[11px] font-mono text-white/55 uppercase">media</span>
                                        </div>
                                    </>
                                )}
                            </div>
                        </div>

                        {/* Right actions */}
                        <div className="flex items-center gap-2">
                            <button
                                onClick={fetchMails}
                                disabled={isLoading}
                                className="p-2 rounded-xl bg-white/[0.05] border border-white/[0.08] text-white/50 hover:text-white/80 hover:bg-white/[0.08] transition-all"
                            >
                                <RefreshCw className={cn("h-3.5 w-3.5", isLoading && "animate-spin")} />
                            </button>
                            <button
                                onClick={() => setChatOpen(!chatOpen)}
                                className={cn(
                                    "flex items-center gap-2 px-4 py-2 rounded-xl text-[10px] font-mono font-bold tracking-wider transition-all border",
                                    chatOpen
                                        ? "bg-cyan-500/15 border-cyan-500/25 text-cyan-300 shadow-[0_0_15px_rgba(6,182,212,0.12)]"
                                        : "bg-gradient-to-r from-cyan-500/10 to-violet-500/10 border-cyan-500/15 text-cyan-300/70 hover:text-cyan-300 hover:border-cyan-500/30"
                                )}
                            >
                                <MessageCircle className="h-3.5 w-3.5" />
                                ASK AI
                            </button>
                        </div>
                    </div>

                    {/* AI Smart Filter */}
                    <div className="relative">
                        <div className="flex gap-2">
                            <div className="flex-1 relative">
                                <Sparkles className="absolute left-3.5 top-1/2 -translate-y-1/2 h-4 w-4 text-violet-400/40" />
                                <input
                                    type="text"
                                    value={nlInput}
                                    onChange={e => setNlInput(e.target.value)}
                                    onKeyDown={e => { if (e.key === "Enter") applyNLFilter(nlInput); }}
                                    placeholder='AI Filter — "show me scholarship emails", "urgent deadlines this week"...'
                                    className="w-full pl-11 pr-4 py-2.5 bg-black/40 border border-violet-500/20 rounded-xl text-xs font-mono text-white placeholder:text-white/35 focus:border-violet-500/40 focus:outline-none focus:shadow-[0_0_20px_rgba(139,92,246,0.1)] transition-all"
                                />
                                {isClassifying && (
                                    <div className="absolute right-3 top-1/2 -translate-y-1/2 flex items-center gap-1.5">
                                        <Loader2 className="h-3 w-3 animate-spin text-violet-400" />
                                        <span className="text-[10px] font-mono text-violet-300/60">
                                            {isParsingIntent ? "Parsing intent..." : "Classifying..."}
                                        </span>
                                    </div>
                                )}
                            </div>
                            <button
                                onClick={() => applyNLFilter(nlInput)}
                                disabled={isClassifying || !nlInput.trim()}
                                className="px-5 py-2.5 bg-gradient-to-r from-violet-600/30 to-purple-600/30 border border-violet-500/25 rounded-xl text-[10px] font-mono font-bold text-violet-200 hover:from-violet-600/40 hover:to-purple-600/40 transition-all disabled:opacity-30 shadow-[0_0_10px_rgba(139,92,246,0.08)]"
                            >
                                <Search className="h-3.5 w-3.5" />
                            </button>
                            {filters.nlPrompt && (
                                <button
                                    onClick={() => { setNlInput(""); applyNLFilter(""); }}
                                    className="px-3 py-2.5 bg-red-500/10 border border-red-500/20 rounded-xl text-red-400 hover:bg-red-500/20 transition-all"
                                >
                                    <X className="h-3.5 w-3.5" />
                                </button>
                            )}
                        </div>
                        {filters.nlPrompt && (
                            <div className="mt-1.5 text-[11px] font-mono text-violet-300/50 flex items-center gap-2">
                                <Signal className="h-2.5 w-2.5" />
                                Active filter: &quot;{filters.nlPrompt}&quot; — <span className="text-violet-300/70 font-bold">{filteredMails.length}</span> matches
                            </div>
                        )}

                        {/* ─── Recommended AI Prompts ─── */}
                        {!filters.nlPrompt && !isClassifying && (
                            <div className="mt-3">
                                <div className="flex items-center gap-2 mb-2">
                                    <Sparkles className="h-3 w-3 text-violet-400/50" />
                                    <span className="text-[10px] font-mono text-white/35 uppercase tracking-widest">Try asking</span>
                                </div>
                                <div className="flex flex-wrap gap-1.5">
                                    {[
                                        { label: "Urgent deadlines this week", icon: "🔥" },
                                        { label: "Placement & internship updates", icon: "💼" },
                                        { label: "Scholarship & financial aid", icon: "🎓" },
                                        { label: "Hackathon & competition invites", icon: "🏆" },
                                        { label: "Unread from professors", icon: "📚" },
                                        { label: "Hostel & mess notices", icon: "🏠" },
                                        { label: "Emails with attachments today", icon: "📎" },
                                        { label: "Club & fest announcements", icon: "🎪" },
                                    ].map((prompt) => (
                                        <button
                                            key={prompt.label}
                                            onClick={() => { setNlInput(prompt.label); applyNLFilter(prompt.label); }}
                                            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-[11px] font-mono text-white/50 bg-white/[0.04] border border-white/[0.08] hover:bg-violet-500/10 hover:border-violet-500/25 hover:text-violet-300 transition-all cursor-pointer"
                                        >
                                            <span className="text-[12px]">{prompt.icon}</span>
                                            {prompt.label}
                                        </button>
                                    ))}
                                </div>
                            </div>
                        )}

                        {/* ─── Customisable Category Filter Chips ─── */}
                        {!isClassifying && (
                            <div className="mt-3">
                                <div className="flex items-center gap-2 mb-2">
                                    <Filter className="h-3 w-3 text-white/30" />
                                    <span className="text-[10px] font-mono text-white/35 uppercase tracking-widest">Quick Filters</span>
                                </div>
                                <div className="flex flex-wrap gap-1.5">
                                    {(Object.entries(CATEGORY_STYLES) as [string, typeof CATEGORY_STYLES[string]][]).map(([cat, style]) => {
                                        const count = mails.filter(m => m.nlCategory === cat || m.summary?.category === cat).length;
                                        if (count === 0) return null;
                                        const isActive = filters.nlPrompt?.toLowerCase().includes(cat);
                                        return (
                                            <button
                                                key={cat}
                                                onClick={() => { setNlInput(`Show me ${cat} emails`); applyNLFilter(`Show me ${cat} emails`); }}
                                                className={cn(
                                                    "flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-[11px] font-mono font-bold border transition-all cursor-pointer",
                                                    isActive
                                                        ? cn(style.bg, style.text, style.border, "ring-1 ring-current/20")
                                                        : "bg-white/[0.03] text-white/40 border-white/[0.06] hover:bg-white/[0.06] hover:text-white/60"
                                                )}
                                            >
                                                <span className="text-[11px]">{style.icon}</span>
                                                <span className="capitalize">{cat}</span>
                                                <span className="text-[9px] opacity-60">({count})</span>
                                            </button>
                                        );
                                    })}
                                </div>
                            </div>
                        )}

                        {/* Filter Intent Visualization (Two-pass status) */}
                        <AnimatePresence>
                            {(isParsingIntent || filterIntent) && filters.nlPrompt && (
                                <motion.div
                                    initial={{ opacity: 0, height: 0 }}
                                    animate={{ opacity: 1, height: "auto" }}
                                    exit={{ opacity: 0, height: 0 }}
                                    className="mt-2 overflow-hidden"
                                >
                                    <div className="p-3.5 rounded-xl bg-gradient-to-r from-violet-500/[0.06] via-purple-500/[0.04] to-cyan-500/[0.06] border border-violet-500/15">
                                        {/* Two-pass progress indicator */}
                                        <div className="flex items-center gap-3 mb-3">
                                            <div className={cn(
                                                "flex items-center gap-1.5 text-[10px] font-mono font-bold tracking-wider",
                                                filterIntent ? "text-emerald-400" : "text-violet-400"
                                            )}>
                                                {isParsingIntent ? (
                                                    <><Loader2 className="h-2.5 w-2.5 animate-spin" /> PARSING INTENT...</>
                                                ) : (
                                                    <><Brain className="h-2.5 w-2.5" /> INTENT PARSED</>
                                                )}
                                            </div>
                                            <div className="h-px flex-1 bg-white/[0.06]" />
                                            <div className={cn(
                                                "flex items-center gap-1.5 text-[10px] font-mono font-bold tracking-wider",
                                                !isClassifying && filterIntent ? "text-emerald-400" : isClassifying && !isParsingIntent ? "text-cyan-400" : "text-white/20"
                                            )}>
                                                {isClassifying && !isParsingIntent ? (
                                                    <><Loader2 className="h-2.5 w-2.5 animate-spin" /> CLASSIFYING...</>
                                                ) : !isClassifying && filterIntent ? (
                                                    <><Zap className="h-2.5 w-2.5" /> COMPLETE</>
                                                ) : (
                                                    <><Activity className="h-2.5 w-2.5" /> PENDING</>
                                                )}
                                            </div>
                                        </div>

                                        {filterIntent && (
                                            <div className="space-y-2.5">
                                                {/* Parsed query */}
                                                <div className="flex items-start gap-2">
                                                    <span className="text-[10px] font-mono text-white/40 uppercase tracking-wider shrink-0 mt-0.5 w-14">Query</span>
                                                    <span className="text-xs font-medium text-white/75 leading-relaxed">{filterIntent.parsedQuery}</span>
                                                </div>

                                                {/* Topics */}
                                                {filterIntent.topics.length > 0 && (
                                                    <div className="flex items-center gap-2 flex-wrap">
                                                        <span className="text-[10px] font-mono text-white/35 uppercase tracking-wider shrink-0 w-14">Topics</span>
                                                        {filterIntent.topics.map((t, i) => (
                                                            <span key={i} className="text-[11px] font-mono px-2 py-0.5 rounded-md bg-violet-500/15 border border-violet-500/20 text-violet-300">
                                                                {t}
                                                            </span>
                                                        ))}
                                                    </div>
                                                )}

                                                {/* Sender hints + Time hint + Urgency */}
                                                <div className="flex items-center gap-3 flex-wrap">
                                                    {filterIntent.senderHints.length > 0 && (
                                                        <div className="flex items-center gap-1.5">
                                                            <User className="h-2.5 w-2.5 text-white/20" />
                                                            {filterIntent.senderHints.map((s, i) => (
                                                                <span key={i} className="text-[11px] font-mono text-cyan-300/70 px-1.5 py-0.5 rounded bg-cyan-500/10 border border-cyan-500/15">
                                                                    {s}
                                                                </span>
                                                            ))}
                                                        </div>
                                                    )}
                                                    {filterIntent.timeHint && (
                                                        <div className="flex items-center gap-1.5">
                                                            <Clock className="h-2.5 w-2.5 text-white/20" />
                                                            <span className="text-[11px] font-mono text-amber-300/70">{filterIntent.timeHint}</span>
                                                        </div>
                                                    )}
                                                    {filterIntent.urgencyBias && filterIntent.urgencyBias !== "any" && (
                                                        <span className={cn(
                                                            "text-[10px] font-mono font-bold px-2 py-0.5 rounded-md border",
                                                            filterIntent.urgencyBias === "urgent-only"
                                                                ? "bg-red-500/15 text-red-300 border-red-500/20"
                                                                : "bg-emerald-500/15 text-emerald-300 border-emerald-500/20"
                                                        )}>
                                                            {filterIntent.urgencyBias === "urgent-only" ? "URGENT ONLY" : "NON-URGENT"}
                                                        </span>
                                                    )}
                                                </div>

                                                {/* Confidence bar */}
                                                <div className="flex items-center gap-2.5">
                                                    <span className="text-[10px] font-mono text-white/35 uppercase tracking-wider shrink-0 w-14">Conf.</span>
                                                    <div className="flex-1 h-1.5 rounded-full bg-white/[0.06] overflow-hidden">
                                                        <div
                                                            className={cn(
                                                                "h-full rounded-full transition-all duration-500",
                                                                filterIntent.parseConfidence > 0.8
                                                                    ? "bg-gradient-to-r from-emerald-500 to-emerald-400"
                                                                    : filterIntent.parseConfidence > 0.5
                                                                        ? "bg-gradient-to-r from-amber-500 to-amber-400"
                                                                        : "bg-gradient-to-r from-red-500 to-red-400"
                                                            )}
                                                            style={{ width: `${Math.round(filterIntent.parseConfidence * 100)}%` }}
                                                        />
                                                    </div>
                                                    <span className="text-[11px] font-mono text-white/55 font-bold">
                                                        {Math.round(filterIntent.parseConfidence * 100)}%
                                                    </span>
                                                </div>
                                            </div>
                                        )}
                                    </div>
                                </motion.div>
                            )}
                        </AnimatePresence>
                    </div>

                    {/* Controls Row */}
                    <div className="flex items-center justify-between gap-3">
                        {/* Date range pills */}
                        <div className="flex items-center gap-0.5 p-0.5 bg-black/40 border border-white/[0.05] rounded-xl">
                            {DATE_RANGES.map(r => (
                                <button
                                    key={r.value}
                                    onClick={() => setDateRange(r.value)}
                                    className={cn(
                                        "px-3 py-1.5 rounded-lg text-[11px] font-mono font-bold tracking-wider transition-all",
                                        dateRange === r.value
                                            ? "bg-violet-500/20 text-violet-300 shadow-[inset_0_0_8px_rgba(139,92,246,0.12)]"
                                            : "text-white/25 hover:text-white/50 hover:bg-white/[0.04]"
                                    )}
                                >
                                    {r.label.toUpperCase()}
                                </button>
                            ))}
                        </div>

                        {/* Right controls */}
                        <div className="flex items-center gap-2">
                            {/* Selection actions */}
                            {selectedMails.length > 0 && (
                                <div className="flex items-center gap-2 mr-2 pr-4 border-r border-white/[0.08]">
                                    <span className="text-[11px] font-mono text-white/50">{selectedMails.length} selected</span>
                                    <button
                                        onClick={clearMailSelection}
                                        className="text-[11px] font-mono text-white/40 hover:text-white/70 underline underline-offset-2 transition-colors"
                                    >
                                        Clear
                                    </button>
                                </div>
                            )}

                            {selectedMails.length === 0 && displayMails.length > 0 && (
                                <button
                                    onClick={selectAllMails}
                                    className="px-3 py-2 rounded-xl border border-white/[0.06] bg-black/40 text-[11px] font-mono text-white/40 hover:text-white/60 hover:bg-white/[0.04] transition-all"
                                >
                                    Select All
                                </button>
                            )}

                            {/* Summarise */}
                            <button
                                onClick={selectedMails.length > 0 ? summariseSelected : summariseAll}
                                disabled={isSummarising || mails.length === 0}
                                className={cn(
                                    "flex items-center gap-2 px-4 py-2 rounded-xl text-[10px] font-mono font-bold tracking-wider transition-all border",
                                    isSummarising
                                        ? "bg-cyan-500/10 border-cyan-500/20 text-cyan-300"
                                        : "bg-gradient-to-r from-cyan-500/10 to-emerald-500/10 border-cyan-500/15 text-cyan-300/70 hover:text-cyan-300 hover:from-cyan-500/15 hover:to-emerald-500/15 hover:border-cyan-500/30",
                                    (selectedMails.length > 0 && !isSummarising) && "shadow-[0_0_15px_rgba(6,182,212,0.15)] ring-1 ring-cyan-500/30"
                                )}
                            >
                                {isSummarising ? (
                                    <><Loader2 className="h-3.5 w-3.5 animate-spin" /> {summariseProgress.done}/{summariseProgress.total}</>
                                ) : (
                                    <><Cpu className="h-3.5 w-3.5" /> {selectedMails.length > 0 ? `SUMMARISE SELECTED (${selectedMails.length})` : "SUMMARISE ALL"}</>
                                )}
                            </button>

                            {/* Folder selector */}
                            {folders.length > 1 && (
                                <select
                                    value={activeFolder}
                                    onChange={e => setActiveFolder(e.target.value)}
                                    className="px-3 py-2 bg-black/40 border border-white/[0.06] rounded-xl text-[11px] font-mono text-white/50 focus:outline-none focus:border-violet-500/25"
                                >
                                    {folders.map(f => (
                                        <option key={f.path} value={f.path}>{f.name}</option>
                                    ))}
                                </select>
                            )}

                            {/* Filters */}
                            <button
                                onClick={() => setShowFilters(!showFilters)}
                                className={cn(
                                    "flex items-center gap-1.5 px-3 py-2 rounded-xl text-[11px] font-mono font-bold tracking-wider transition-all border",
                                    showFilters || hasActiveFilters
                                        ? "bg-violet-500/10 border-violet-500/20 text-violet-300"
                                        : "bg-white/[0.02] border-white/[0.06] text-white/25 hover:text-white/50"
                                )}
                            >
                                <Filter className="h-3 w-3" />
                                {hasActiveFilters && (
                                    <span className="w-5 h-5 rounded-full bg-violet-500/25 text-violet-200 flex items-center justify-center text-[10px]">
                                        {filters.senders.length + filters.keywords.length + (filters.unreadOnly ? 1 : 0) + (filters.hasAttachments ? 1 : 0) + (filters.nlPrompt ? 1 : 0)}
                                    </span>
                                )}
                            </button>
                        </div>
                    </div>

                    {/* Filter Panel */}
                    <AnimatePresence>
                        {showFilters && (
                            <motion.div
                                initial={{ opacity: 0, height: 0 }}
                                animate={{ opacity: 1, height: "auto" }}
                                exit={{ opacity: 0, height: 0 }}
                                className="overflow-hidden"
                            >
                                <div className="p-4 bg-black/30 border border-white/[0.05] rounded-xl space-y-3">
                                    <div className="flex items-center gap-2 flex-wrap">
                                        <button
                                            onClick={() => setFilters({ unreadOnly: !filters.unreadOnly })}
                                            className={cn(
                                                "flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-[11px] font-mono font-bold border transition-all",
                                                filters.unreadOnly
                                                    ? "bg-violet-500/15 border-violet-500/25 text-violet-300"
                                                    : "bg-white/[0.02] border-white/[0.06] text-white/25 hover:text-white/50"
                                            )}
                                        >
                                            {filters.unreadOnly ? <Eye className="h-3 w-3" /> : <EyeOff className="h-3 w-3" />}
                                            UNREAD ONLY
                                        </button>
                                        <button
                                            onClick={() => setFilters({ hasAttachments: !filters.hasAttachments })}
                                            className={cn(
                                                "flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-[11px] font-mono font-bold border transition-all",
                                                filters.hasAttachments
                                                    ? "bg-amber-500/15 border-amber-500/25 text-amber-300"
                                                    : "bg-white/[0.02] border-white/[0.06] text-white/25 hover:text-white/50"
                                            )}
                                        >
                                            <Paperclip className="h-3 w-3" />
                                            HAS ATTACHMENTS
                                        </button>
                                    </div>

                                    <div>
                                        <label className="text-[10px] font-mono text-white/35 uppercase tracking-widest mb-1.5 block">Keyword Filter</label>
                                        <input
                                            type="text"
                                            value={keywordInput}
                                            onChange={e => setKeywordInput(e.target.value)}
                                            onKeyDown={e => {
                                                if (e.key === "Enter" && keywordInput.trim()) {
                                                    setFilters({ keywords: [...filters.keywords, keywordInput.trim()] });
                                                    setKeywordInput("");
                                                }
                                            }}
                                            placeholder="Type keyword + Enter"
                                            className="w-full px-3 py-2 bg-white/[0.02] border border-white/[0.06] rounded-xl text-[10px] font-mono text-white placeholder:text-white/12 focus:border-violet-500/25 focus:outline-none"
                                        />
                                        {filters.keywords.length > 0 && (
                                            <div className="flex flex-wrap gap-1.5 mt-2">
                                                {filters.keywords.map(k => (
                                                    <span
                                                        key={k}
                                                        onClick={() => setFilters({ keywords: filters.keywords.filter(x => x !== k) })}
                                                        className="flex items-center gap-1 px-2.5 py-1 rounded-lg bg-violet-500/10 border border-violet-500/20 text-[10px] font-mono text-violet-300 cursor-pointer hover:bg-red-500/10 hover:border-red-500/20 hover:text-red-300 transition-colors"
                                                    >
                                                        <Hash className="h-2 w-2" /> {k} ×
                                                    </span>
                                                ))}
                                            </div>
                                        )}
                                    </div>
                                </div>
                            </motion.div>
                        )}
                    </AnimatePresence>
                </div>

                {/* Mail List (scrollable) */}
                <div className="flex-1 overflow-y-auto custom-scrollbar p-4 pt-3 space-y-3">
                    {/* Error */}
                    {error && (
                        <div className="flex items-center gap-3 p-4 bg-red-500/[0.06] border border-red-500/15 rounded-xl">
                            <AlertCircle className="h-4 w-4 text-red-400 shrink-0" />
                            <span className="text-xs font-mono text-red-300">{error}</span>
                        </div>
                    )}

                    {/* Loading */}
                    {isLoading && (
                        <div className="flex items-center justify-center py-16">
                            <div className="flex flex-col items-center gap-4">
                                <div className="relative">
                                    <div className="w-16 h-16 rounded-2xl bg-gradient-to-br from-violet-500/15 to-cyan-500/10 border border-violet-500/20 flex items-center justify-center">
                                        <Loader2 className="h-8 w-8 animate-spin text-violet-400" />
                                    </div>
                                    <div className="absolute -top-1 -right-1 w-4 h-4 rounded-full bg-violet-500/30 animate-pulse" />
                                </div>
                                <div className="text-center">
                                    <p className="text-xs font-mono text-white/40">Syncing your inbox...</p>
                                    <p className="text-[11px] font-mono text-white/30 mt-1">Fetching emails via IMAP</p>
                                </div>
                            </div>
                        </div>
                    )}

                    {/* Mail cards */}
                    {!isLoading && (
                        <>
                            {displayMails.length === 0 ? (
                                <div className="flex flex-col items-center justify-center py-20 text-center">
                                    <div className="w-16 h-16 rounded-2xl bg-white/[0.02] border border-white/[0.06] flex items-center justify-center mb-4">
                                        <Mail className="h-8 w-8 text-white/10" />
                                    </div>
                                    <p className="text-sm font-mono text-white/25">No emails found</p>
                                    <p className="text-[10px] font-mono text-white/10 mt-1.5 max-w-[200px]">
                                        {hasActiveFilters ? "Try adjusting your filters or widening the date range" : "Expand the date range to load older emails"}
                                    </p>
                                </div>
                            ) : (
                                displayMails.map((mail, i) => (
                                    <MailCard key={mail.messageId || `uid-${mail.uid}`} mail={mail} index={i} />
                                ))
                            )}
                        </>
                    )}
                </div>
            </div>

            {/* Right: Chat Panel */}
            <AnimatePresence>
                {chatOpen && (
                    <motion.div
                        initial={{ opacity: 0, width: 0 }}
                        animate={{ opacity: 1, width: "40%" }}
                        exit={{ opacity: 0, width: 0 }}
                        transition={{ duration: 0.3, ease: "easeInOut" }}
                        className="border-l border-white/[0.06] bg-black/20 backdrop-blur-md overflow-hidden"
                    >
                        <MailChat />
                    </motion.div>
                )}
            </AnimatePresence>
        </div>
    );
}
