"use client";

import { useState } from "react";
import { ExternalLink, Play, TrendingUp, TrendingDown, Minus, Clock } from "lucide-react";
import { motion } from "framer-motion";
import { type FeedItem } from "@/hooks/use-digest";
import { getDomainById } from "@/lib/digest-domains";
import { formatDistanceToNow } from "date-fns";
import { cn } from "@/lib/utils";
import { SourceBadge } from "./source-badge";
import { VideoEmbed } from "./video-embed";

// --- Mini Signal Sparkline ---
function MiniSparkline({ color, score }: { color: string; score: number }) {
  const points = `0,10 5,${10 - (score / 20)} 10,${10 - (score / 10)} 15,${10 - (score / 15)} 20,10`;
  return (
    <svg viewBox="0 0 20 10" className="w-6 h-3 overflow-visible">
      <polyline points={points} fill="none" stroke={color} strokeWidth="1" strokeLinecap="round" strokeLinejoin="round" />
      <circle cx="20" cy="10" r="1.5" fill={color} className="animate-ping" style={{ animationDuration: '3s' }} />
      <circle cx="20" cy="10" r="1" fill={color} />
    </svg>
  );
}

// Build the image URL — multi-strategy resolution for maximum coverage
function getImageSrc(item: FeedItem): string | null {
  // Strategy 1: Direct imageUrl from RSS/OG batch resolver
  if (item.imageUrl) return item.imageUrl;
  // Strategy 2: Use our OG proxy endpoint (server-side scrapes + proxies bytes)
  if (item.url) return `/api/digest/og?url=${encodeURIComponent(item.url)}`;
  return null;
}

// Generate a favicon URL for a source
function getFaviconUrl(source: string, size: number = 64): string {
  return `https://www.google.com/s2/favicons?domain=${source}&sz=${size}`;
}

// Map domain IDs to AI-generated category hero images
const CATEGORY_HEROES: Record<string, string> = {
  // AI & Machine Learning
  "artificial-intelligence": "/digest-heroes/ai-tech.png",
  "machine-learning": "/digest-heroes/ai-tech.png",
  "deep-learning": "/digest-heroes/ai-tech.png",
  "nlp": "/digest-heroes/ai-tech.png",
  "computer-vision": "/digest-heroes/ai-tech.png",
  "robotics": "/digest-heroes/ai-tech.png",
  "data-science": "/digest-heroes/ai-tech.png",
  // Web Development
  "web-development": "/digest-heroes/web-dev.png",
  "frontend": "/digest-heroes/web-dev.png",
  "backend": "/digest-heroes/web-dev.png",
  "devops": "/digest-heroes/web-dev.png",
  "mobile-dev": "/digest-heroes/web-dev.png",
  "open-source": "/digest-heroes/web-dev.png",
  "cybersecurity": "/digest-heroes/web-dev.png",
  "cloud-computing": "/digest-heroes/web-dev.png",
  // Startups & Business
  "startups": "/digest-heroes/startup.png",
  "venture-capital": "/digest-heroes/startup.png",
  "entrepreneurship": "/digest-heroes/startup.png",
  "product-management": "/digest-heroes/startup.png",
  "seed-funding": "/digest-heroes/startup.png",
  // Blockchain & Crypto
  "blockchain": "/digest-heroes/blockchain.png",
  "cryptocurrency": "/digest-heroes/blockchain.png",
  "defi": "/digest-heroes/blockchain.png",
  "nft": "/digest-heroes/blockchain.png",
  "web3": "/digest-heroes/blockchain.png",
  "smart-contracts": "/digest-heroes/blockchain.png",
  // Science & Research
  "physics": "/digest-heroes/science.png",
  "biology": "/digest-heroes/science.png",
  "chemistry": "/digest-heroes/science.png",
  "mathematics": "/digest-heroes/science.png",
  "space": "/digest-heroes/science.png",
  "neuroscience": "/digest-heroes/science.png",
  "quantum-computing": "/digest-heroes/science.png",
};

function getCategoryHero(domainId: string): string {
  return CATEGORY_HEROES[domainId] || "/digest-heroes/general.png";
}

const sentimentConfig = {
  positive: { icon: TrendingUp, color: "text-emerald-400", bg: "bg-emerald-500/10", label: "Bullish" },
  neutral: { icon: Minus, color: "text-white/40", bg: "bg-white/5", label: "Neutral" },
  negative: { icon: TrendingDown, color: "text-red-400", bg: "bg-red-500/10", label: "Bearish" },
};

export function FeedCard({ item, index, variant = "default" }: { item: FeedItem; index: number; variant?: "default" | "compact" | "magazine" }) {
  const domain = getDomainById(item.domain);
  const sentiment = sentimentConfig[item.sentiment];
  const SentimentIcon = sentiment.icon;
  const [imageError, setImageError] = useState(false);
  const imageSrc = getImageSrc(item);

  const timeAgo = (() => {
    try {
      return formatDistanceToNow(new Date(item.publishedAt), { addSuffix: true });
    } catch {
      return "recently";
    }
  })();

  // Compact variant for list layout
  if (variant === "compact") {
    return (
      <motion.div
        initial={{ opacity: 0, x: -10 }}
        animate={{ opacity: 1, x: 0 }}
        transition={{ duration: 0.3, delay: Math.min(index * 0.04, 0.5) }}
        className="flex items-start gap-3 p-3 rounded-xl bg-black/30 border border-white/[0.06] hover:border-white/12 hover:bg-white/[0.03] transition-all group"
      >
        {/* Thumbnail — enhanced with OG proxy fallback */}
        {imageSrc && !imageError ? (
          <div className="w-24 h-16 rounded-lg overflow-hidden shrink-0 bg-white/[0.03] border border-white/[0.06]">
            <img
              src={imageSrc}
              alt=""
              className="w-full h-full object-cover"
              loading="lazy"
              referrerPolicy="no-referrer"
              onError={() => setImageError(true)}
            />
          </div>
        ) : (
          <div className="w-24 h-16 rounded-lg shrink-0 overflow-hidden relative border border-white/[0.06]">
            <img src={getCategoryHero(item.domain)} alt="" className="w-full h-full object-cover opacity-40" />
            <div className="absolute inset-0 flex items-center justify-center" style={{ background: `${item.domainColor}25` }}>
              <img src={getFaviconUrl(item.source, 32)} alt="" className="w-6 h-6 rounded-md border border-white/20 bg-black/50 p-0.5" referrerPolicy="no-referrer" />
            </div>
          </div>
        )}
        <div className="flex-1 min-w-0">
          <a href={item.url} target="_blank" rel="noopener noreferrer" className="block">
            <h4 className="text-sm font-semibold text-white/80 group-hover:text-white transition-colors line-clamp-2 leading-snug">
              {item.title}
            </h4>
          </a>
          <div className="flex items-center gap-3 mt-1.5">
            <SourceBadge source={item.source} url={item.url} color={item.domainColor} />
            <span className="text-[9px] font-mono text-white/20 flex items-center gap-1">
              <Clock className="h-2.5 w-2.5" />
              {timeAgo}
            </span>
          </div>
        </div>
      </motion.div>
    );
  }

  // Default card variant
  return (
    <motion.div
      initial={{ opacity: 0, y: 15 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.4, delay: Math.min(index * 0.05, 0.6) }}
      className="group relative bg-black/40 border border-white/[0.06] rounded-2xl overflow-hidden hover:border-white/12 transition-all duration-300 hover:shadow-[0_4px_30px_rgba(0,0,0,0.3)] backdrop-blur-xl flex flex-col"
    >
      {/* Domain accent line */}
      <div
        className="h-[2px] w-full opacity-60 group-hover:opacity-100 transition-opacity"
        style={{ background: `linear-gradient(to right, ${item.domainColor}, transparent)` }}
      />

      {/* Image section — enhanced multi-fallback */}
      {item.videoUrl ? (
        <VideoEmbed url={item.videoUrl} title={item.title} />
      ) : imageSrc && !imageError ? (
        <div className="relative h-48 overflow-hidden bg-white/[0.02]">
          <img
            src={imageSrc}
            alt={item.title}
            className="w-full h-full object-cover opacity-90 group-hover:opacity-100 group-hover:scale-105 transition-all duration-500"
            loading="lazy"
            referrerPolicy="no-referrer"
            onError={() => setImageError(true)}
          />
          <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-black/10 to-transparent" />
          {/* Source watermark on image */}
          <div className="absolute top-2.5 right-2.5 flex items-center gap-1.5 px-2 py-1 rounded-lg bg-black/70 backdrop-blur-md border border-white/15">
            <img src={getFaviconUrl(item.source, 32)} alt="" className="w-3.5 h-3.5 rounded-sm" referrerPolicy="no-referrer" />
            <span className="text-[9px] font-mono font-bold text-white/80 tracking-wider">{item.source}</span>
          </div>
          {/* Relevance score badge on image */}
          <div className="absolute top-2.5 left-2.5 flex items-center gap-1 px-2 py-1 rounded-lg border" style={{ backgroundColor: `${item.domainColor}20`, borderColor: `${item.domainColor}40` }}>
            <span className="text-[10px] font-mono font-bold" style={{ color: item.domainColor }}>{item.relevanceScore}%</span>
          </div>
        </div>
      ) : (
        /* Enhanced category hero fallback with gradients */
        <div className="relative h-48 overflow-hidden">
          <img
            src={getCategoryHero(item.domain)}
            alt=""
            className="w-full h-full object-cover opacity-50"
          />
          {/* Mesh gradient overlay */}
          <div className="absolute inset-0" style={{ background: `linear-gradient(135deg, ${item.domainColor}50, rgba(0,0,0,0.5) 50%, ${item.domainColor}20 100%)` }} />
          {/* Source branding */}
          <div className="absolute inset-0 flex flex-col items-center justify-center gap-2.5">
            <div className="relative">
              <div className="absolute inset-0 rounded-2xl animate-ping opacity-20" style={{ backgroundColor: item.domainColor }} />
              <img
                src={getFaviconUrl(item.source, 64)}
                alt=""
                className="w-12 h-12 rounded-2xl border-2 bg-black/60 p-2 backdrop-blur-sm shadow-2xl relative z-10"
                style={{ borderColor: `${item.domainColor}60` }}
                referrerPolicy="no-referrer"
              />
            </div>
            <span className="text-[11px] font-mono font-bold tracking-[0.3em] uppercase" style={{ color: item.domainColor, textShadow: `0 0 12px ${item.domainColor}60` }}>
              {item.source}
            </span>
            <span className="text-[8px] font-mono text-white/30 tracking-widest">SOURCE PREVIEW UNAVAILABLE</span>
          </div>
          <div className="absolute inset-x-0 bottom-0 h-20 bg-gradient-to-t from-black/80 to-transparent" />
          <div className="absolute top-2.5 right-2.5 px-2 py-1 rounded-lg bg-black/60 backdrop-blur-md border border-white/10">
            <span className="text-[9px] font-mono text-white/60">{item.source}</span>
          </div>
        </div>
      )}

      {/* Content */}
      <div className="p-4 flex flex-col flex-1 gap-2.5">
        {/* Domain tag + Time */}
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-1.5">
            <div className="w-2 h-2 rounded-full shrink-0" style={{ backgroundColor: item.domainColor }} />
            <span className="text-[9px] font-mono font-bold tracking-wider uppercase truncate max-w-[120px]" style={{ color: item.domainColor }}>
              {domain?.name || item.domain}
            </span>
          </div>
          <span className="text-[9px] font-mono text-white/20 flex items-center gap-1 shrink-0">
            <Clock className="h-2.5 w-2.5" />
            {timeAgo}
          </span>
        </div>

        {/* Title */}
        <a href={item.url} target="_blank" rel="noopener noreferrer" className="block">
          <h3 className="text-[13px] font-bold text-white/90 group-hover:text-white transition-colors leading-snug line-clamp-2">
            {item.title}
          </h3>
        </a>

        {/* Summary */}
        <p className="text-[11px] text-white/35 leading-relaxed line-clamp-2">
          {item.aiSummary || item.summary}
        </p>

        {/* Tags */}
        <div className="flex flex-wrap gap-1">
          {item.tags.slice(0, 3).map((tag) => (
            <span key={tag} className="px-1.5 py-0.5 rounded text-[8px] font-mono tracking-wider bg-white/[0.04] border border-white/[0.05] text-white/25">
              #{tag}
            </span>
          ))}
        </div>

        {/* Footer — pushed to bottom */}
        <div className="flex items-center justify-between pt-2 mt-auto border-t border-white/[0.04]">
          <div className="flex items-center gap-2">
            <SourceBadge source={item.source} url={item.url} color={item.domainColor} />
            <div className={cn("flex items-center gap-1 px-1.5 py-0.5 rounded-full text-[8px] font-mono", sentiment.bg)}>
              <SentimentIcon className={cn("h-2.5 w-2.5", sentiment.color)} />
              <span className={sentiment.color}>{sentiment.label}</span>
            </div>
          </div>

          {/* Telemetry HUD */}
          <div className="flex items-center gap-3 shrink-0 bg-white/[0.02] border border-white/[0.04] px-2 py-1 rounded-lg">
            <div className="flex flex-col gap-0.5">
              <span className="text-[7px] font-mono text-white/30 uppercase tracking-widest leading-none">Signal</span>
              <MiniSparkline color={item.domainColor} score={item.relevanceScore} />
            </div>
            <div className="w-[1px] h-6 bg-white/[0.06]" />
            <div className="flex flex-col items-end gap-0.5">
              <span className="text-[7px] font-mono text-white/30 uppercase tracking-widest leading-none">Match</span>
              <span className="text-[11px] font-mono font-bold leading-none tabular-nums" style={{ color: item.domainColor }}>
                {item.relevanceScore}%
              </span>
            </div>
          </div>
        </div>

        {/* Hover actions row */}
        <div className="flex items-center gap-2 opacity-0 group-hover:opacity-100 transition-opacity duration-200 -mb-1">
          <a
            href={item.url}
            target="_blank"
            rel="noopener noreferrer"
            className="flex items-center gap-1 px-2.5 py-1 rounded-lg bg-white/[0.04] border border-white/[0.08] hover:bg-white/[0.08] text-[9px] font-mono text-white/50 hover:text-white transition-all"
          >
            <ExternalLink className="h-2.5 w-2.5" />
            SOURCE
          </a>
          {item.videoUrl && (
            <a
              href={item.videoUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center gap-1 px-2.5 py-1 rounded-lg bg-red-500/10 border border-red-500/20 hover:bg-red-500/20 text-[9px] font-mono text-red-400 transition-all"
            >
              <Play className="h-2.5 w-2.5 fill-current" />
              WATCH
            </a>
          )}
        </div>
      </div>
    </motion.div>
  );
}
