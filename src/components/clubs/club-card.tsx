"use client";

import { motion } from "framer-motion";
import { useState } from "react";
import { cn } from "@/lib/utils";
import { Badge } from "@/components/ui/badge";
import {
  Globe, Instagram, Github, Mail, Users, Sparkles,
  ExternalLink, CheckSquare, Square, Star, TrendingUp,
  MapPin, Linkedin, Cpu, Music, Dumbbell, Lightbulb,
  FlaskConical, Heart, Camera, Palette,
} from "lucide-react";
import type { Club } from "@/db/schema";
import Link from "next/link";

const CATEGORY_COLORS: Record<string, { bg: string; text: string; glow: string; gradient: string }> = {
  technical: { bg: "bg-cyan-500/15", text: "text-cyan-400", glow: "rgba(6,182,212,0.3)", gradient: "from-cyan-500/20 to-blue-500/10" },
  cultural: { bg: "bg-pink-500/15", text: "text-pink-400", glow: "rgba(236,72,153,0.3)", gradient: "from-pink-500/20 to-rose-500/10" },
  sports: { bg: "bg-emerald-500/15", text: "text-emerald-400", glow: "rgba(16,185,129,0.3)", gradient: "from-emerald-500/20 to-green-500/10" },
  entrepreneurship: { bg: "bg-amber-500/15", text: "text-amber-400", glow: "rgba(245,158,11,0.3)", gradient: "from-amber-500/20 to-yellow-500/10" },
  research: { bg: "bg-violet-500/15", text: "text-violet-400", glow: "rgba(139,92,246,0.3)", gradient: "from-violet-500/20 to-purple-500/10" },
  social: { bg: "bg-rose-500/15", text: "text-rose-400", glow: "rgba(244,63,94,0.3)", gradient: "from-rose-500/20 to-red-500/10" },
  media: { bg: "bg-blue-500/15", text: "text-blue-400", glow: "rgba(59,130,246,0.3)", gradient: "from-blue-500/20 to-indigo-500/10" },
  hobby: { bg: "bg-teal-500/15", text: "text-teal-400", glow: "rgba(20,184,166,0.3)", gradient: "from-teal-500/20 to-cyan-500/10" },
  other: { bg: "bg-gray-500/15", text: "text-gray-400", glow: "rgba(156,163,175,0.3)", gradient: "from-gray-500/20 to-gray-500/10" },
};

const IIT_SHORT: Record<string, string> = {
  iitb: "IIT Bombay", iitd: "IIT Delhi", iitk: "IIT Kanpur", iitm: "IIT Madras",
  iitr: "IIT Roorkee", iith: "IIT Hyderabad", iitg: "IIT Guwahati", iitbbs: "IIT Bhubaneswar",
};

// Deterministic hash for consistent unique visuals per club
function hashStr(s: string): number {
  let h = 0;
  for (let i = 0; i < s.length; i++) {
    h = ((h << 5) - h + s.charCodeAt(i)) | 0;
  }
  return Math.abs(h);
}

// Category-specific icons for logo placeholder
const CATEGORY_ICONS: Record<string, React.ComponentType<{ className?: string }>> = {
  technical: Cpu,
  cultural: Music,
  sports: Dumbbell,
  entrepreneurship: Lightbulb,
  research: FlaskConical,
  social: Heart,
  media: Camera,
  hobby: Palette,
};

// Generate a unique gradient for cover images based on club name + category
function getCoverGradient(name: string, category: string): string {
  const h = hashStr(name + (category ?? "other"));
  const hue1 = h % 360;
  const hue2 = (hue1 + 40 + (h % 60)) % 360;
  const angle = 120 + (h % 60);
  return `linear-gradient(${angle}deg, hsl(${hue1}, 65%, 20%) 0%, hsl(${hue2}, 55%, 15%) 100%)`;
}

// Generate a unique mesh pattern for cover images
function getMeshPattern(name: string): string {
  const h = hashStr(name);
  const size = 16 + (h % 12);
  const opacity = 0.06 + (h % 8) * 0.01;
  return `radial-gradient(circle at 1px 1px, rgba(255,255,255,${opacity}) 1px, transparent 0)`;
}

function getCategoryStyle(category: string) {
  return CATEGORY_COLORS[category?.toLowerCase()] ?? CATEGORY_COLORS.other;
}

function getLogoUrl(logoUrl?: string | null, websiteUrl?: string | null, name?: string): string {
  // Prefer club's own logo if available
  if (logoUrl) return logoUrl;
  if (websiteUrl) {
    try {
      const domain = new URL(websiteUrl).hostname;
      // Use larger favicon size for better quality
      return `https://www.google.com/s2/favicons?domain=${domain}&sz=128`;
    } catch { /* fall through */ }
  }
  // Fallback: gradient avatar with first letter, colored by category hash
  const initial = (name ?? "C")[0].toUpperCase();
  const h = hashStr(name ?? "C");
  const hue = h % 360;
  const bg = `${hue.toString(16).padStart(2, "0")}${((hue + 60) % 256).toString(16).padStart(2, "0")}${((hue + 120) % 256).toString(16).padStart(2, "0")}`;
  return `https://ui-avatars.com/api/?name=${encodeURIComponent(initial)}&background=${bg.slice(0, 6)}&color=fff&size=128&bold=true&format=svg`;
}

interface ClubCardProps {
  club: Club;
  index?: number;
  isCompareMode?: boolean;
  isSelected?: boolean;
  onToggleCompare?: (club: Club) => void;
  viewMode?: "grid" | "list";
}

export function ClubCard({ club, index = 0, isCompareMode, isSelected, onToggleCompare, viewMode = "grid" }: ClubCardProps) {
  const [mousePos, setMousePos] = useState({ x: 0, y: 0 });
  const [imgError, setImgError] = useState(false);
  const catStyle = getCategoryStyle(club.category ?? "other");
  const logoUrl = getLogoUrl(club.logoUrl, club.websiteUrl, club.name);
  const iitName = IIT_SHORT[club.iitId ?? ""] ?? club.iitId?.toUpperCase();
  const coverGradient = getCoverGradient(club.name, club.category ?? "other");
  const meshPattern = getMeshPattern(club.name);
  const CategoryIcon = CATEGORY_ICONS[club.category?.toLowerCase() ?? ""] ?? Cpu;

  // List mode
  if (viewMode === "list") {
    return (
      <Link href={`/clubs/${club.id}`}>
        <motion.div
          initial={{ opacity: 0, x: -20 }}
          animate={{ opacity: 1, x: 0 }}
          transition={{ duration: 0.3, delay: index * 0.03 }}
          whileHover={{ x: 4 }}
          className="group relative flex items-center gap-4 rounded-xl border border-white/[0.06] bg-black/40 backdrop-blur-xl p-4 cursor-pointer hover:border-white/[0.12] transition-all"
        >
          {/* Compare checkbox */}
          {isCompareMode && (
            <button
              onClick={(e) => { e.preventDefault(); e.stopPropagation(); onToggleCompare?.(club); }}
              className="shrink-0"
            >
              {isSelected
                ? <CheckSquare className="w-5 h-5 text-violet-400" />
                : <Square className="w-5 h-5 text-white/20 hover:text-white/50" />}
            </button>
          )}

          {/* Logo */}
          <div className={cn("shrink-0 w-11 h-11 rounded-lg bg-gradient-to-br flex items-center justify-center overflow-hidden border border-white/[0.08] ring-1 ring-white/[0.04]", catStyle.gradient)}>
            {!imgError ? (
              <img src={logoUrl} alt="" className="w-7 h-7 rounded-sm object-cover" onError={() => setImgError(true)} />
            ) : (
              <CategoryIcon className={cn("w-5 h-5", catStyle.text)} />
            )}
          </div>

          {/* Info */}
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2">
              <h3 className="font-bold text-sm text-white truncate font-space tracking-tight">{club.name}</h3>
              {club.isRecruiting === "true" && (
                <span className="flex items-center gap-0.5 text-[8px] text-emerald-400 font-mono">
                  <span className="w-1.5 h-1.5 bg-emerald-400 rounded-full animate-pulse" />
                  HIRING
                </span>
              )}
            </div>
            <p className="text-xs text-white/40 truncate">{club.description || club.tagline || "No description"}</p>
          </div>

          {/* IIT Badge */}
          <Badge variant="outline" className="shrink-0 text-[9px] border-white/[0.08] text-white/40 font-mono">
            <MapPin className="w-2.5 h-2.5 mr-0.5" /> {iitName}
          </Badge>

          {/* Category */}
          <span className={cn("shrink-0 px-2 py-0.5 rounded-full text-[9px] font-mono border border-white/[0.04]", catStyle.bg, catStyle.text)}>
            {club.category?.toUpperCase()}
          </span>

          {club.memberCount && (
            <span className="shrink-0 text-[10px] text-white/30 font-mono flex items-center gap-1">
              <Users className="w-3 h-3" /> {club.memberCount}
            </span>
          )}

          <ExternalLink className="w-3.5 h-3.5 text-white/15 group-hover:text-white/40 transition-colors shrink-0" />
        </motion.div>
      </Link>
    );
  }

  // Grid mode (default)
  return (
    <Link href={`/clubs/${club.id}`}>
      <motion.div
        initial={{ opacity: 0, y: 20, scale: 0.95 }}
        animate={{ opacity: 1, y: 0, scale: 1 }}
        transition={{ duration: 0.4, delay: index * 0.04 }}
        whileHover={{ y: -6, scale: 1.02 }}
        onMouseMove={(e) => {
          const rect = e.currentTarget.getBoundingClientRect();
          setMousePos({ x: e.clientX - rect.left, y: e.clientY - rect.top });
        }}
        className="group relative rounded-2xl border border-white/[0.06] bg-black/50 backdrop-blur-xl overflow-hidden cursor-pointer transition-all hover:border-white/[0.12] hover:shadow-[0_8px_32px_rgba(0,0,0,0.4)]"
      >
        {/* Compare checkbox overlay */}
        {isCompareMode && (
          <button
            onClick={(e) => { e.preventDefault(); e.stopPropagation(); onToggleCompare?.(club); }}
            className="absolute top-3 right-3 z-20"
          >
            {isSelected
              ? <CheckSquare className="w-5 h-5 text-violet-400 drop-shadow-lg" />
              : <Square className="w-5 h-5 text-white/30 hover:text-white/60 drop-shadow-lg" />}
          </button>
        )}

        {/* Holographic glow on hover */}
        <div
          className="absolute inset-0 pointer-events-none opacity-0 group-hover:opacity-100 transition-opacity duration-500"
          style={{
            background: `radial-gradient(400px circle at ${mousePos.x}px ${mousePos.y}px, ${catStyle.glow}, transparent 50%)`,
          }}
        />

        {/* Cover image / gradient header — unique per club */}
        <div className="relative h-28 w-full overflow-hidden" style={{ background: coverGradient }}>
          {club.coverImageUrl ? (
            <img src={club.coverImageUrl} alt="" className="absolute inset-0 w-full h-full object-cover opacity-80 transition-opacity duration-500 group-hover:opacity-90" />
          ) : (
            /* Decorative category icon watermark when no cover image */
            <div className="absolute inset-0 flex items-center justify-center opacity-[0.07]">
              <CategoryIcon className="w-20 h-20 text-white" />
            </div>
          )}
          {/* Mesh pattern overlay (subtle when cover image exists) */}
          {!club.coverImageUrl && (
            <div className="absolute inset-0" style={{ backgroundImage: meshPattern, backgroundSize: `${16 + hashStr(club.name) % 12}px ${16 + hashStr(club.name) % 12}px` }} />
          )}
          {/* Fade to card */}
          <div className="absolute inset-x-0 bottom-0 h-16 bg-gradient-to-t from-black/95 via-black/50 to-transparent" />

          {/* IIT Badge */}
          <div className="absolute top-2.5 left-3 z-10">
            <span className="px-2 py-0.5 rounded-md text-[8px] font-mono font-bold bg-black/60 backdrop-blur-md border border-white/[0.1] text-white/70 flex items-center gap-1">
              <MapPin className="w-2.5 h-2.5" /> {iitName}
            </span>
          </div>

          {/* Activity score */}
          {(club.activityScore ?? 0) > 0 && (
            <div className="absolute top-2.5 right-3 z-10">
              <span className="px-1.5 py-0.5 rounded-md text-[8px] font-mono font-bold bg-emerald-500/20 backdrop-blur-md border border-emerald-500/20 text-emerald-400 flex items-center gap-0.5">
                <TrendingUp className="w-2.5 h-2.5" /> {club.activityScore}
              </span>
            </div>
          )}
        </div>

        {/* Logo floating */}
        <div className="relative -mt-8 ml-4 z-10">
          <div className={cn(
            "w-14 h-14 rounded-xl bg-gradient-to-br flex items-center justify-center overflow-hidden",
            "border-2 border-black/80 shadow-xl ring-1 ring-white/[0.08]",
            catStyle.gradient
          )}>
            {!imgError ? (
              <img src={logoUrl} alt="" className="w-10 h-10 rounded-md object-contain" onError={() => setImgError(true)} />
            ) : (
              <div className="flex flex-col items-center justify-center">
                <CategoryIcon className={cn("w-6 h-6", catStyle.text)} />
              </div>
            )}
          </div>
        </div>

        <div className="p-4 pt-2 space-y-2.5 relative z-10">
          {/* Header */}
          <div className="flex items-start justify-between gap-2">
            <div className="flex-1 min-w-0">
              <h3 className="font-bold text-sm text-white truncate group-hover:text-white/90 transition-colors font-space tracking-tight">
                {club.name}
              </h3>
              <p className="text-[10px] font-mono text-white/35 uppercase tracking-widest mt-0.5 flex items-center gap-1.5">
                <span className={cn("w-1.5 h-1.5 rounded-full", catStyle.bg.replace("/15", ""))} />
                {club.category?.toUpperCase() ?? "UNKNOWN"}
              </p>
            </div>
            <ExternalLink className="w-3.5 h-3.5 text-white/15 group-hover:text-white/40 transition-colors shrink-0 mt-0.5" />
          </div>

          {/* Tagline */}
          {club.tagline && (
            <p className="text-xs text-white/45 italic line-clamp-1">
              &quot;{club.tagline}&quot;
            </p>
          )}

          {/* Description */}
          <p className="text-xs text-white/55 line-clamp-2 leading-relaxed">
            {club.description || "No description available yet."}
          </p>

          {/* Tags */}
          {Array.isArray(club.tags) && club.tags.length > 0 && (
            <div className="flex flex-wrap gap-1">
              {(club.tags as string[]).slice(0, 3).map((tag) => (
                <span
                  key={tag}
                  className="px-1.5 py-0.5 rounded-md text-[9px] font-mono bg-white/[0.05] text-white/35 border border-white/[0.04]"
                >
                  {tag}
                </span>
              ))}
              {(club.tags as string[]).length > 3 && (
                <span className="text-[9px] text-white/25 px-1">+{(club.tags as string[]).length - 3}</span>
              )}
            </div>
          )}

          {/* Footer */}
          <div className="flex items-center gap-3 pt-2 border-t border-white/[0.04]">
            {club.memberCount && (
              <div className="flex items-center gap-1 text-[10px] text-white/35">
                <Users className="w-3 h-3" />
                <span>{club.memberCount}</span>
              </div>
            )}
            {club.foundedYear && (
              <div className="text-[10px] text-white/25 font-mono">
                Est. {club.foundedYear}
              </div>
            )}
            {club.isRecruiting === "true" && (
              <Badge variant="outline" className="text-[7px] h-4 px-1.5 border-emerald-500/30 text-emerald-400 animate-pulse">
                <Sparkles className="w-2.5 h-2.5 mr-0.5" />
                RECRUITING
              </Badge>
            )}
            <div className="ml-auto flex items-center gap-1.5">
              {club.websiteUrl && <Globe className="w-3 h-3 text-white/20 hover:text-cyan-400 transition-colors" />}
              {club.instagramUrl && <Instagram className="w-3 h-3 text-white/20 hover:text-pink-400 transition-colors" />}
              {club.linkedinUrl && <Linkedin className="w-3 h-3 text-white/20 hover:text-blue-400 transition-colors" />}
              {club.githubUrl && <Github className="w-3 h-3 text-white/20 hover:text-white/60 transition-colors" />}
              {club.email && <Mail className="w-3 h-3 text-white/20 hover:text-amber-400 transition-colors" />}
            </div>
          </div>
        </div>
      </motion.div>
    </Link>
  );
}
