"use client";

import {
  useState,
  useCallback,
  useRef,
  useEffect,
  useMemo,
} from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Progress } from "@/components/ui/progress";
import { Skeleton } from "@/components/ui/skeleton";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import {
  Loader2,
  Search,
  GraduationCap,
  Building2,
  Microscope,
  Atom,
  ExternalLink,
  Calendar,
  Target,
  Sparkles,
  CheckCircle2,
  Clock,
  ArrowRight,
  Briefcase,
  BookOpen,
  Award,
  Users,
  Brain,
  Filter,
  X,
  ChevronRight,
  TrendingUp,
  Shield,
  Zap,
  Star,
  Eye,
  BarChart3,
  Lightbulb,
  ArrowUpRight,
} from "lucide-react";
import { toast } from "sonner";
import type {
  FoundOpportunity,
  SearchProgress,
  NLFilterResult,
  OpportunityPreview,
} from "@/lib/ai/opportunity-finder";

// ─── Types ────────────────────────────────────────────────────────────────────

interface OpportunityFinderProps {
  onOpportunitiesFound?: (opportunities: FoundOpportunity[]) => void;
  apiKey?: string;
}

// ─── Opportunity Type Icons & Colors ──────────────────────────────────────────

const TYPE_ICONS: Record<FoundOpportunity["type"], typeof Briefcase> = {
  research: Microscope,
  internship: Briefcase,
  project: BookOpen,
  workshop: Users,
  fellowship: Award,
  other: GraduationCap,
};

const TYPE_COLORS: Record<FoundOpportunity["type"], string> = {
  research: "bg-purple-500/20 text-purple-400 border-purple-500/50",
  internship: "bg-blue-500/20 text-blue-400 border-blue-500/50",
  project: "bg-green-500/20 text-green-400 border-green-500/50",
  workshop: "bg-orange-500/20 text-orange-400 border-orange-500/50",
  fellowship: "bg-yellow-500/20 text-yellow-400 border-yellow-500/50",
  other: "bg-gray-500/20 text-gray-400 border-gray-500/50",
};

const TYPE_GLOW: Record<FoundOpportunity["type"], string> = {
  research: "hover:shadow-purple-500/20",
  internship: "hover:shadow-blue-500/20",
  project: "hover:shadow-green-500/20",
  workshop: "hover:shadow-orange-500/20",
  fellowship: "hover:shadow-yellow-500/20",
  other: "hover:shadow-gray-500/20",
};

const TYPE_BORDER: Record<FoundOpportunity["type"], string> = {
  research: "border-l-purple-500",
  internship: "border-l-blue-500",
  project: "border-l-green-500",
  workshop: "border-l-orange-500",
  fellowship: "border-l-yellow-500",
  other: "border-l-gray-500",
};

const COMPETITION_CONFIG: Record<
  string,
  { color: string; icon: typeof Shield; label: string }
> = {
  low: { color: "text-green-400", icon: Shield, label: "Low Competition" },
  medium: {
    color: "text-yellow-400",
    icon: BarChart3,
    label: "Medium Competition",
  },
  high: { color: "text-red-400", icon: TrendingUp, label: "High Competition" },
};

// ─── Progress Stage Config ────────────────────────────────────────────────────

const STAGE_CONFIG: Record<
  SearchProgress["stage"],
  { label: string; icon: typeof Search; color: string }
> = {
  initializing: {
    label: "Initializing search agent...",
    icon: Sparkles,
    color: "text-violet-400",
  },
  fetching: {
    label: "Fetching department pages...",
    icon: Search,
    color: "text-cyan-400",
  },
  analyzing: {
    label: "AI analyzing opportunities...",
    icon: Brain,
    color: "text-purple-400",
  },
  filtering: {
    label: "Filtering by relevance...",
    icon: Target,
    color: "text-green-400",
  },
  complete: {
    label: "Search complete!",
    icon: CheckCircle2,
    color: "text-green-400",
  },
  error: { label: "Error occurred", icon: Clock, color: "text-red-400" },
};

// ─── Staggered Animation Wrapper ──────────────────────────────────────────────

function StaggeredCard({
  children,
  index,
  className = "",
}: {
  children: React.ReactNode;
  index: number;
  className?: string;
}) {
  const [visible, setVisible] = useState(false);
  useEffect(() => {
    const timer = setTimeout(() => setVisible(true), index * 80);
    return () => clearTimeout(timer);
  }, [index]);

  return (
    <div
      className={`transition-all duration-500 ${visible ? "opacity-100 translate-y-0" : "opacity-0 translate-y-4"} ${className}`}
    >
      {children}
    </div>
  );
}

// ─── AI Preview Sheet Content ─────────────────────────────────────────────────

function PreviewPanel({
  opportunity,
  preview,
  isLoading,
}: {
  opportunity: FoundOpportunity;
  preview: OpportunityPreview | null;
  isLoading: boolean;
}) {
  const TypeIcon = TYPE_ICONS[opportunity.type];
  const comp = preview?.estimatedCompetition
    ? COMPETITION_CONFIG[preview.estimatedCompetition]
    : null;

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="space-y-3">
        <div className="flex items-center gap-2 flex-wrap">
          <Badge variant="outline" className={TYPE_COLORS[opportunity.type]}>
            <TypeIcon className="h-3 w-3 mr-1" />
            {opportunity.type}
          </Badge>
          <Badge
            variant="outline"
            className="border-cyan-500/50 text-cyan-400 bg-cyan-500/10"
          >
            <Building2 className="h-3 w-3 mr-1" />
            {opportunity.institution}
          </Badge>
          <Badge
            variant="outline"
            className={`${
              opportunity.relevanceScore >= 85
                ? "bg-green-500/20 text-green-400 border-green-500/50"
                : opportunity.relevanceScore >= 70
                  ? "bg-yellow-500/20 text-yellow-400 border-yellow-500/50"
                  : "bg-red-500/20 text-red-400 border-red-500/50"
            }`}
          >
            <Star className="h-3 w-3 mr-1" />
            {opportunity.relevanceScore}% match
          </Badge>
        </div>
        <h3 className="text-lg font-bold text-white leading-snug">
          {opportunity.title}
        </h3>
        <p className="text-sm text-white/50">
          {opportunity.department} &middot;{" "}
          {opportunity.deadline
            ? `Deadline: ${opportunity.deadline}`
            : "Rolling admissions"}
        </p>
      </div>

      {/* AI Summary */}
      {isLoading ? (
        <div className="space-y-3">
          <Skeleton className="h-4 w-full bg-white/10" />
          <Skeleton className="h-4 w-5/6 bg-white/10" />
          <Skeleton className="h-4 w-4/6 bg-white/10" />
          <div className="grid grid-cols-2 gap-3 mt-4">
            <Skeleton className="h-20 bg-white/10 rounded-lg" />
            <Skeleton className="h-20 bg-white/10 rounded-lg" />
          </div>
        </div>
      ) : preview ? (
        <>
          {/* Summary */}
          <div className="p-4 rounded-xl bg-gradient-to-br from-violet-500/10 to-cyan-500/10 border border-violet-500/20">
            <div className="flex items-center gap-2 mb-2">
              <Brain className="h-4 w-4 text-violet-400" />
              <span className="text-xs font-semibold text-violet-400 uppercase tracking-wider">
                AI Analysis
              </span>
            </div>
            <p className="text-sm text-white/80 leading-relaxed">
              {preview.summary}
            </p>
          </div>

          {/* Highlights */}
          {preview.highlights.length > 0 && (
            <div className="space-y-2">
              <h4 className="text-xs font-semibold text-white/60 uppercase tracking-wider flex items-center gap-2">
                <Lightbulb className="h-3.5 w-3.5 text-yellow-400" />
                Key Highlights
              </h4>
              <div className="space-y-1.5">
                {preview.highlights.map((h, i) => (
                  <div
                    key={i}
                    className="flex items-start gap-2 text-sm text-white/70"
                  >
                    <ChevronRight className="h-4 w-4 text-cyan-400 mt-0.5 shrink-0" />
                    <span>{h}</span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Match Reason */}
          <div className="p-3 rounded-lg bg-green-500/10 border border-green-500/20">
            <div className="flex items-center gap-2 mb-1">
              <Target className="h-3.5 w-3.5 text-green-400" />
              <span className="text-xs font-semibold text-green-400">
                Why This Fits
              </span>
            </div>
            <p className="text-sm text-white/70">{preview.matchReason}</p>
          </div>

          {/* Skills + Competition */}
          <div className="grid grid-cols-2 gap-3">
            {/* Skills */}
            <div className="p-3 rounded-lg bg-white/5 border border-white/10">
              <h4 className="text-xs font-semibold text-white/50 mb-2 flex items-center gap-1.5">
                <Zap className="h-3 w-3 text-cyan-400" /> Skills Required
              </h4>
              <div className="flex flex-wrap gap-1">
                {preview.skillsRequired.map((s) => (
                  <Badge
                    key={s}
                    variant="secondary"
                    className="text-[10px] bg-cyan-500/10 text-cyan-300 border-cyan-500/20"
                  >
                    {s}
                  </Badge>
                ))}
              </div>
            </div>

            {/* Competition */}
            <div className="p-3 rounded-lg bg-white/5 border border-white/10">
              <h4 className="text-xs font-semibold text-white/50 mb-2">
                Competition Level
              </h4>
              {comp && (
                <div className={`flex items-center gap-2 ${comp.color}`}>
                  <comp.icon className="h-4 w-4" />
                  <span className="text-sm font-medium">{comp.label}</span>
                </div>
              )}
            </div>
          </div>

          {/* Suggested Actions */}
          {preview.suggestedActions.length > 0 && (
            <div className="space-y-2">
              <h4 className="text-xs font-semibold text-white/60 uppercase tracking-wider flex items-center gap-2">
                <ArrowUpRight className="h-3.5 w-3.5 text-violet-400" />
                Next Steps
              </h4>
              <div className="space-y-2">
                {preview.suggestedActions.map((action, i) => (
                  <div
                    key={i}
                    className="flex items-center gap-3 p-2.5 rounded-lg bg-white/5 border border-white/10 text-sm text-white/70"
                  >
                    <span className="flex items-center justify-center h-5 w-5 rounded-full bg-violet-500/20 text-violet-400 text-[10px] font-bold shrink-0">
                      {i + 1}
                    </span>
                    {action}
                  </div>
                ))}
              </div>
            </div>
          )}
        </>
      ) : (
        <p className="text-sm text-white/50 leading-relaxed">
          {opportunity.description}
        </p>
      )}

      {/* Apply CTA */}
      {opportunity.applicationUrl && (
        <a
          href={opportunity.applicationUrl}
          target="_blank"
          rel="noopener noreferrer"
          className="flex items-center justify-center gap-2 w-full p-3 rounded-xl bg-gradient-to-r from-violet-600 to-cyan-600 hover:from-violet-700 hover:to-cyan-700 text-white font-semibold text-sm transition-all"
        >
          <ExternalLink className="h-4 w-4" />
          Apply Now
        </a>
      )}
    </div>
  );
}

// ─── Enhanced Opportunity Card ────────────────────────────────────────────────

function OpportunityCard({
  opportunity,
  onPreview,
  isActive,
}: {
  opportunity: FoundOpportunity;
  onPreview: (opp: FoundOpportunity) => void;
  isActive: boolean;
}) {
  const TypeIcon = TYPE_ICONS[opportunity.type];
  const deadlineUrgent =
    opportunity.deadline &&
    new Date(opportunity.deadline).getTime() - Date.now() <
      30 * 24 * 60 * 60 * 1000;

  return (
    <Card
      className={`
        relative group cursor-pointer border-l-2 transition-all duration-300
        ${TYPE_BORDER[opportunity.type]}
        ${isActive ? "border-white/30 bg-white/10 ring-1 ring-violet-500/30" : "border-white/10 bg-white/[0.03] hover:bg-white/[0.06] hover:border-white/20"}
        ${TYPE_GLOW[opportunity.type]} hover:shadow-lg
      `}
      onClick={() => onPreview(opportunity)}
    >
      {/* Glow overlay on hover */}
      <div className="absolute inset-0 rounded-lg bg-gradient-to-br from-violet-500/0 to-cyan-500/0 group-hover:from-violet-500/5 group-hover:to-cyan-500/5 transition-all duration-500 pointer-events-none" />

      <CardHeader className="pb-2 relative">
        <div className="flex items-start justify-between gap-2">
          <div className="flex items-center gap-1.5 flex-wrap">
            <Badge
              variant="outline"
              className={`${TYPE_COLORS[opportunity.type]} text-[10px]`}
            >
              <TypeIcon className="h-2.5 w-2.5 mr-0.5" />
              {opportunity.type}
            </Badge>
            <Badge
              variant="outline"
              className="border-white/20 text-white/50 bg-white/5 text-[10px]"
            >
              {opportunity.department.split(" ")[0]}
            </Badge>
          </div>

          {/* Relevance badge */}
          <div className="flex items-center gap-1.5">
            {deadlineUrgent && (
              <Badge className="bg-red-500/20 text-red-400 border-red-500/50 text-[10px] animate-pulse">
                <Clock className="h-2.5 w-2.5 mr-0.5" />
                Urgent
              </Badge>
            )}
            <div
              className={`
              flex items-center gap-1 px-1.5 py-0.5 rounded-md text-[10px] font-mono font-bold
              ${
                opportunity.relevanceScore >= 85
                  ? "bg-green-500/20 text-green-400"
                  : opportunity.relevanceScore >= 70
                    ? "bg-yellow-500/20 text-yellow-400"
                    : "bg-red-500/20 text-red-400"
              }
            `}
            >
              {opportunity.relevanceScore}%
            </div>
          </div>
        </div>

        <CardTitle className="text-sm font-semibold text-white leading-snug mt-2 group-hover:text-cyan-100 transition-colors">
          {opportunity.title}
        </CardTitle>
      </CardHeader>

      <CardContent className="space-y-2.5 relative">
        <p className="text-xs text-white/50 leading-relaxed line-clamp-2">
          {opportunity.description}
        </p>

        {/* Tags */}
        <div className="flex flex-wrap gap-1">
          {opportunity.tags.slice(0, 3).map((tag) => (
            <Badge
              key={tag}
              variant="secondary"
              className="text-[9px] bg-white/5 text-white/40 border-white/10 px-1.5 py-0"
            >
              {tag}
            </Badge>
          ))}
          {opportunity.tags.length > 3 && (
            <span className="text-[9px] text-white/30">
              +{opportunity.tags.length - 3}
            </span>
          )}
        </div>

        {/* Footer row */}
        <div className="flex items-center justify-between pt-1">
          <div className="flex items-center gap-2 text-[10px] text-white/30">
            {opportunity.deadline && (
              <span className="flex items-center gap-0.5">
                <Calendar className="h-2.5 w-2.5" />
                {opportunity.deadline}
              </span>
            )}
            {opportunity.eligibility && (
              <span className="flex items-center gap-0.5 truncate max-w-[120px]">
                <GraduationCap className="h-2.5 w-2.5" />
                {opportunity.eligibility.slice(0, 30)}
              </span>
            )}
          </div>
          <Button
            variant="ghost"
            size="sm"
            className="h-6 px-2 text-[10px] text-cyan-400/70 hover:text-cyan-300 hover:bg-cyan-500/10 opacity-0 group-hover:opacity-100 transition-opacity"
            onClick={(e) => {
              e.stopPropagation();
              onPreview(opportunity);
            }}
          >
            <Eye className="h-3 w-3 mr-1" />
            Preview
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}

// ─── NL Filter Bar ────────────────────────────────────────────────────────────

function NLFilterBar({
  query,
  onQueryChange,
  onSearch,
  isFiltering,
  filterResult,
  onClear,
  totalCount,
}: {
  query: string;
  onQueryChange: (q: string) => void;
  onSearch: () => void;
  isFiltering: boolean;
  filterResult: NLFilterResult | null;
  onClear: () => void;
  totalCount: number;
}) {
  const inputRef = useRef<HTMLInputElement>(null);

  return (
    <div className="space-y-3">
      {/* Search Input */}
      <div className="relative">
        <div className="absolute left-3 top-1/2 -translate-y-1/2 flex items-center gap-1.5">
          {isFiltering ? (
            <Loader2 className="h-4 w-4 text-violet-400 animate-spin" />
          ) : (
            <Brain className="h-4 w-4 text-violet-400" />
          )}
        </div>
        <Input
          ref={inputRef}
          value={query}
          onChange={(e) => onQueryChange(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && query.trim()) onSearch();
          }}
          placeholder="AI filter: &quot;ML internships&quot;, &quot;quantum research with deadline&quot;, &quot;high relevance projects&quot;..."
          className="pl-10 pr-24 h-11 bg-white/5 border-violet-500/30 text-white placeholder:text-white/30 focus:border-violet-500/60 focus:ring-violet-500/20"
        />
        <div className="absolute right-2 top-1/2 -translate-y-1/2 flex items-center gap-1">
          {query && (
            <Button
              variant="ghost"
              size="sm"
              className="h-7 w-7 p-0 text-white/40 hover:text-white"
              onClick={() => {
                onQueryChange("");
                onClear();
                inputRef.current?.focus();
              }}
            >
              <X className="h-3.5 w-3.5" />
            </Button>
          )}
          <Button
            size="sm"
            disabled={!query.trim() || isFiltering}
            onClick={onSearch}
            className="h-7 px-3 bg-violet-600 hover:bg-violet-700 text-white text-xs"
          >
            <Filter className="h-3 w-3 mr-1" />
            Filter
          </Button>
        </div>
      </div>

      {/* AI Interpretation + Filter Chips */}
      {filterResult && (
        <div className="flex flex-wrap items-center gap-2 animate-in fade-in slide-in-from-top-2 duration-300">
          {/* Interpretation badge */}
          <div className="flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-violet-500/15 border border-violet-500/30 text-xs text-violet-300">
            <Brain className="h-3 w-3" />
            <span className="max-w-[300px] truncate">
              {filterResult.interpretation}
            </span>
          </div>

          {/* Filter chips */}
          {filterResult.appliedFilters.types?.map((t) => (
            <Badge
              key={`type-${t}`}
              variant="outline"
              className="text-[10px] bg-purple-500/10 text-purple-300 border-purple-500/30"
            >
              Type: {t}
            </Badge>
          ))}
          {filterResult.appliedFilters.departments?.map((d) => (
            <Badge
              key={`dept-${d}`}
              variant="outline"
              className="text-[10px] bg-cyan-500/10 text-cyan-300 border-cyan-500/30"
            >
              Dept: {d}
            </Badge>
          ))}
          {filterResult.appliedFilters.keywords?.map((k) => (
            <Badge
              key={`kw-${k}`}
              variant="outline"
              className="text-[10px] bg-white/10 text-white/60 border-white/20"
            >
              {k}
            </Badge>
          ))}
          {filterResult.appliedFilters.minScore && (
            <Badge
              variant="outline"
              className="text-[10px] bg-green-500/10 text-green-300 border-green-500/30"
            >
              &ge;{filterResult.appliedFilters.minScore}%
            </Badge>
          )}
          {filterResult.appliedFilters.hasDeadline && (
            <Badge
              variant="outline"
              className="text-[10px] bg-orange-500/10 text-orange-300 border-orange-500/30"
            >
              <Calendar className="h-2.5 w-2.5 mr-0.5" />
              Has Deadline
            </Badge>
          )}

          {/* Count */}
          <span className="text-[10px] text-white/40 ml-auto">
            {filterResult.filtered.length}/{totalCount} shown
          </span>
        </div>
      )}
    </div>
  );
}

// ─── Quick Type Filters ───────────────────────────────────────────────────────

function QuickFilters({
  results,
  activeType,
  onTypeFilter,
}: {
  results: FoundOpportunity[];
  activeType: string | null;
  onTypeFilter: (type: string | null) => void;
}) {
  const typeCounts = useMemo(() => {
    const counts: Record<string, number> = {};
    for (const r of results) {
      counts[r.type] = (counts[r.type] || 0) + 1;
    }
    return counts;
  }, [results]);

  const types = Object.keys(typeCounts);
  if (types.length <= 1) return null;

  return (
    <div className="flex items-center gap-1.5 flex-wrap">
      <span className="text-[10px] text-white/30 mr-1">Quick:</span>
      <button
        type="button"
        onClick={() => onTypeFilter(null)}
        className={`px-2 py-0.5 rounded-full text-[10px] transition-all ${
          !activeType
            ? "bg-white/15 text-white border border-white/30"
            : "bg-white/5 text-white/40 border border-white/10 hover:bg-white/10"
        }`}
      >
        All ({results.length})
      </button>
      {types.map((type) => {
        const TypeIcon = TYPE_ICONS[type as FoundOpportunity["type"]];
        const isActive = activeType === type;
        return (
          <button
            key={type}
            type="button"
            onClick={() => onTypeFilter(isActive ? null : type)}
            className={`flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] transition-all ${
              isActive
                ? `${TYPE_COLORS[type as FoundOpportunity["type"]]} border`
                : "bg-white/5 text-white/40 border border-white/10 hover:bg-white/10"
            }`}
          >
            <TypeIcon className="h-2.5 w-2.5" />
            {type} ({typeCounts[type]})
          </button>
        );
      })}
    </div>
  );
}

// ─── Stats Bar ────────────────────────────────────────────────────────────────

function StatsBar({ results }: { results: FoundOpportunity[] }) {
  const avgScore = Math.round(
    results.reduce((a, b) => a + b.relevanceScore, 0) / results.length,
  );
  const withDeadline = results.filter((r) => r.deadline).length;
  const depts = [...new Set(results.map((r) => r.department))];

  return (
    <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
      {[
        {
          label: "Opportunities",
          value: results.length,
          icon: Target,
          color: "text-cyan-400",
        },
        {
          label: "Avg Match",
          value: `${avgScore}%`,
          icon: Star,
          color: "text-green-400",
        },
        {
          label: "With Deadline",
          value: withDeadline,
          icon: Calendar,
          color: "text-orange-400",
        },
        {
          label: "Departments",
          value: depts.length,
          icon: Building2,
          color: "text-purple-400",
        },
      ].map((stat) => (
        <div
          key={stat.label}
          className="flex items-center gap-2.5 p-2.5 rounded-lg bg-white/[0.03] border border-white/10"
        >
          <stat.icon className={`h-4 w-4 ${stat.color} shrink-0`} />
          <div>
            <div className="text-sm font-bold text-white">{stat.value}</div>
            <div className="text-[10px] text-white/40">{stat.label}</div>
          </div>
        </div>
      ))}
    </div>
  );
}

// ─── Main Component ───────────────────────────────────────────────────────────

export function OpportunityFinder({
  onOpportunitiesFound,
  apiKey,
}: OpportunityFinderProps) {
  // Search state
  const [isSearching, setIsSearching] = useState(false);
  const [progress, setProgress] = useState<SearchProgress | null>(null);
  const [results, setResults] = useState<FoundOpportunity[]>([]);
  const [showResults, setShowResults] = useState(false);
  const [searchStats, setSearchStats] = useState<{
    pagesScanned: number;
    departments: string[];
    duration: number;
  } | null>(null);

  // NL filter state
  const [nlQuery, setNlQuery] = useState("");
  const [isFiltering, setIsFiltering] = useState(false);
  const [filterResult, setFilterResult] = useState<NLFilterResult | null>(null);

  // Quick filter state
  const [activeType, setActiveType] = useState<string | null>(null);

  // Preview state
  const [previewOpp, setPreviewOpp] = useState<FoundOpportunity | null>(null);
  const [preview, setPreview] = useState<OpportunityPreview | null>(null);
  const [isPreviewLoading, setIsPreviewLoading] = useState(false);
  const [sheetOpen, setSheetOpen] = useState(false);

  // ── Computed: apply NL filter + quick type filter ──
  const displayedResults = useMemo(() => {
    let base = filterResult ? filterResult.filtered : results;
    if (activeType) {
      base = base.filter((r) => r.type === activeType);
    }
    return base;
  }, [results, filterResult, activeType]);

  // ── Search handler ──
  const handleSearch = useCallback(async () => {
    setIsSearching(true);
    setShowResults(false);
    setResults([]);
    setFilterResult(null);
    setNlQuery("");
    setActiveType(null);
    setProgress({
      stage: "initializing",
      progress: 0,
      message: "Starting search...",
      foundCount: 0,
    });

    const stages: SearchProgress[] = [
      {
        stage: "initializing",
        progress: 10,
        message: "Booting OPPU search agent...",
        foundCount: 0,
      },
      {
        stage: "fetching",
        progress: 30,
        message: "Scanning CSE department...",
        currentDepartment: "Computer Science and Engineering",
        currentInstitution: "IIT Bombay",
        foundCount: 0,
      },
      {
        stage: "fetching",
        progress: 50,
        message: "Scanning Physics department...",
        currentDepartment: "Department of Physics",
        currentInstitution: "IIT Bombay",
        foundCount: 0,
      },
      {
        stage: "analyzing",
        progress: 70,
        message: "Groq LLM analyzing opportunities...",
        foundCount: 0,
      },
      {
        stage: "filtering",
        progress: 90,
        message: "Ranking by relevance...",
        foundCount: 0,
      },
    ];

    let stageIdx = 0;
    const progressTimer = setInterval(() => {
      if (stageIdx < stages.length) {
        setProgress(stages[stageIdx]);
        stageIdx++;
      }
    }, 800);

    try {
      const res = await fetch("/api/opportunities/find", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          institutionIds: ["iitb"],
          departmentIds: ["cse", "physics"],
          useDemoData: true,
          apiKey,
        }),
      });

      clearInterval(progressTimer);
      const data = await res.json();

      if (!res.ok) throw new Error(data.error || "Search failed");

      const opps: FoundOpportunity[] = data.opportunities || [];
      setResults(opps);
      setSearchStats({
        pagesScanned: data.totalPagesScanned || 0,
        departments: data.searchedDepartments || [],
        duration: data.duration || 0,
      });
      setProgress({
        stage: "complete",
        progress: 100,
        message: `Found ${opps.length} opportunities!`,
        foundCount: opps.length,
      });

      onOpportunitiesFound?.(opps);
      setTimeout(() => setShowResults(true), 400);
      toast.success(`Found ${opps.length} opportunities!`);
    } catch (error) {
      clearInterval(progressTimer);
      console.error("Search error:", error);
      setProgress({
        stage: "error",
        progress: 0,
        message: "Search failed. Please try again.",
        foundCount: 0,
      });
      toast.error("Failed to search for opportunities");
    } finally {
      setIsSearching(false);
    }
  }, [apiKey, onOpportunitiesFound]);

  // ── NL filter handler ──
  const handleNLFilter = useCallback(async () => {
    if (!nlQuery.trim() || results.length === 0) return;
    setIsFiltering(true);
    setActiveType(null);

    try {
      const res = await fetch("/api/opportunities/filter", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          query: nlQuery,
          opportunities: results,
          apiKey,
        }),
      });

      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Filter failed");

      setFilterResult(data as NLFilterResult);
      toast.success(
        `AI filtered: ${data.filtered?.length || 0}/${results.length} match`,
      );
    } catch (error) {
      console.error("NL filter error:", error);
      toast.error("AI filter failed — showing all results");
      setFilterResult(null);
    } finally {
      setIsFiltering(false);
    }
  }, [nlQuery, results, apiKey]);

  // ── Preview handler ──
  const handlePreview = useCallback(
    async (opp: FoundOpportunity) => {
      setPreviewOpp(opp);
      setPreview(null);
      setSheetOpen(true);
      setIsPreviewLoading(true);

      try {
        const res = await fetch("/api/opportunities/preview", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            opportunity: opp,
            apiKey,
          }),
        });

        const data = await res.json();
        if (!res.ok) throw new Error(data.error || "Preview failed");

        setPreview(data as OpportunityPreview);
      } catch (error) {
        console.error("Preview error:", error);
        toast.error("AI preview generation failed");
      } finally {
        setIsPreviewLoading(false);
      }
    },
    [apiKey],
  );

  // ── Clear NL filter ──
  const clearFilter = useCallback(() => {
    setFilterResult(null);
    setActiveType(null);
  }, []);

  const StageIcon = progress ? STAGE_CONFIG[progress.stage].icon : Search;
  const stageColor = progress
    ? STAGE_CONFIG[progress.stage].color
    : "text-white";

  return (
    <TooltipProvider>
      <div className="space-y-5">
        {/* ── Search Trigger ── */}
        <Card className="border-violet-500/30 bg-gradient-to-br from-violet-950/60 to-cyan-950/40 overflow-hidden relative">
          {/* Subtle animated gradient */}
          <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_top_right,_var(--tw-gradient-stops))] from-violet-500/10 via-transparent to-cyan-500/10 pointer-events-none" />

          <CardContent className="p-6 relative">
            <div className="flex flex-col md:flex-row items-start md:items-center justify-between gap-4">
              <div className="flex items-start gap-4">
                <div className="p-3 rounded-xl bg-violet-500/20 border border-violet-500/30 shadow-lg shadow-violet-500/10">
                  <Search className="h-6 w-6 text-violet-400" />
                </div>
                <div>
                  <h3 className="text-lg font-bold text-white flex items-center gap-2">
                    AI Opportunity Finder
                    <Badge className="bg-violet-500/20 text-violet-300 border-violet-500/40 text-[10px]">
                      OPPU Engine
                    </Badge>
                  </h3>
                  <p className="text-sm text-white/50 mt-1">
                    Groq-powered agent scans institution pages &amp; discovers
                    research positions, internships, and projects
                  </p>
                  <div className="flex items-center gap-2 mt-2">
                    <Badge
                      variant="outline"
                      className="border-cyan-500/50 text-cyan-400 bg-cyan-500/10 text-[10px]"
                    >
                      <Building2 className="h-2.5 w-2.5 mr-1" />
                      IIT Bombay
                    </Badge>
                    <Badge
                      variant="outline"
                      className="border-purple-500/50 text-purple-400 bg-purple-500/10 text-[10px]"
                    >
                      <Microscope className="h-2.5 w-2.5 mr-1" />
                      CSE
                    </Badge>
                    <Badge
                      variant="outline"
                      className="border-blue-500/50 text-blue-400 bg-blue-500/10 text-[10px]"
                    >
                      <Atom className="h-2.5 w-2.5 mr-1" />
                      Physics
                    </Badge>
                  </div>
                </div>
              </div>

              <Button
                onClick={handleSearch}
                disabled={isSearching}
                size="lg"
                className="bg-gradient-to-r from-violet-600 to-cyan-600 hover:from-violet-700 hover:to-cyan-700 text-white font-semibold min-w-[180px] shadow-lg shadow-violet-500/20 hover:shadow-violet-500/40 transition-all"
              >
                {isSearching ? (
                  <>
                    <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                    Scanning...
                  </>
                ) : results.length > 0 ? (
                  <>
                    <Sparkles className="h-4 w-4 mr-2" />
                    Re-Scan
                  </>
                ) : (
                  <>
                    <Sparkles className="h-4 w-4 mr-2" />
                    Find Opportunities
                  </>
                )}
              </Button>
            </div>

            {/* Progress Bar */}
            {progress && isSearching && (
              <div className="mt-6 space-y-3 animate-in fade-in duration-300">
                <div className="flex items-center justify-between">
                  <div
                    className={`flex items-center gap-2 text-sm ${stageColor}`}
                  >
                    <StageIcon className="h-4 w-4" />
                    {progress.message}
                  </div>
                  <span className="text-xs text-white/40 font-mono">
                    {progress.progress}%
                  </span>
                </div>
                <Progress
                  value={progress.progress}
                  className="h-1.5 bg-white/10"
                />
                {progress.currentDepartment && (
                  <p className="text-[10px] text-white/30">
                    {progress.currentDepartment} @{" "}
                    {progress.currentInstitution}
                  </p>
                )}
              </div>
            )}

            {/* Completion */}
            {progress?.stage === "complete" && !isSearching && (
              <div className="mt-5 flex items-center gap-3 p-3 rounded-lg bg-green-500/10 border border-green-500/20 animate-in fade-in duration-500">
                <CheckCircle2 className="h-5 w-5 text-green-400" />
                <div className="flex-1">
                  <p className="text-sm text-green-400 font-medium">
                    {progress.message}
                  </p>
                  {searchStats && (
                    <p className="text-[10px] text-white/40 mt-0.5">
                      Scanned {searchStats.pagesScanned} pages &middot;{" "}
                      {searchStats.departments.join(", ")} &middot;{" "}
                      {(searchStats.duration / 1000).toFixed(1)}s
                    </p>
                  )}
                </div>
              </div>
            )}
          </CardContent>
        </Card>

        {/* ── Results Section ── */}
        {showResults && results.length > 0 && (
          <div className="space-y-4 animate-in fade-in slide-in-from-bottom-4 duration-500">
            {/* Stats Overview */}
            <StatsBar results={results} />

            {/* NL Filter Bar */}
            <NLFilterBar
              query={nlQuery}
              onQueryChange={setNlQuery}
              onSearch={handleNLFilter}
              isFiltering={isFiltering}
              filterResult={filterResult}
              onClear={clearFilter}
              totalCount={results.length}
            />

            {/* Quick Type Filters */}
            <QuickFilters
              results={filterResult ? filterResult.filtered : results}
              activeType={activeType}
              onTypeFilter={setActiveType}
            />

            {/* Results Header */}
            <div className="flex items-center justify-between">
              <h3 className="text-sm font-semibold text-white flex items-center gap-2">
                <Target className="h-4 w-4 text-cyan-400" />
                {filterResult ? "Filtered Results" : "All Opportunities"}
                <Badge className="bg-cyan-500/20 text-cyan-300 border-cyan-500/50 text-[10px]">
                  {displayedResults.length}
                </Badge>
              </h3>

              {/* View All Dialog */}
              {displayedResults.length > 6 && (
                <Dialog>
                  <DialogTrigger asChild>
                    <Button
                      variant="outline"
                      size="sm"
                      className="border-white/10 text-white/60 hover:text-white text-xs h-7"
                    >
                      View All
                      <ArrowRight className="h-3 w-3 ml-1" />
                    </Button>
                  </DialogTrigger>
                  <DialogContent className="max-w-5xl max-h-[85vh] overflow-hidden bg-zinc-950 border-white/10">
                    <DialogHeader>
                      <DialogTitle className="text-white flex items-center gap-2">
                        <Target className="h-5 w-5 text-cyan-400" />
                        All Opportunities ({displayedResults.length})
                      </DialogTitle>
                      <DialogDescription>
                        AI-discovered opportunities — click any card for deep
                        preview
                      </DialogDescription>
                    </DialogHeader>
                    <ScrollArea className="max-h-[65vh] pr-2">
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-3 mt-4">
                        {displayedResults.map((opp, i) => (
                          <StaggeredCard key={opp.id} index={i}>
                            <OpportunityCard
                              opportunity={opp}
                              onPreview={handlePreview}
                              isActive={previewOpp?.id === opp.id}
                            />
                          </StaggeredCard>
                        ))}
                      </div>
                    </ScrollArea>
                  </DialogContent>
                </Dialog>
              )}
            </div>

            {/* Results Grid */}
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
              {displayedResults.slice(0, 6).map((opp, i) => (
                <StaggeredCard key={opp.id} index={i}>
                  <OpportunityCard
                    opportunity={opp}
                    onPreview={handlePreview}
                    isActive={previewOpp?.id === opp.id}
                  />
                </StaggeredCard>
              ))}
            </div>

            {displayedResults.length > 6 && (
              <p className="text-center text-xs text-white/30">
                +{displayedResults.length - 6} more — click "View All" to see
                all
              </p>
            )}

            {/* Empty NL filter state */}
            {filterResult && displayedResults.length === 0 && (
              <div className="flex flex-col items-center justify-center py-8 text-center">
                <Filter className="h-8 w-8 text-white/20 mb-3" />
                <p className="text-sm text-white/40">
                  No opportunities match your filter
                </p>
                <Button
                  variant="ghost"
                  size="sm"
                  className="mt-2 text-violet-400 hover:text-violet-300"
                  onClick={clearFilter}
                >
                  Clear filter
                </Button>
              </div>
            )}
          </div>
        )}

        {/* ── AI Preview Sheet ── */}
        <Sheet open={sheetOpen} onOpenChange={setSheetOpen}>
          <SheetContent className="w-full sm:max-w-lg bg-zinc-950 border-white/10 overflow-y-auto">
            <SheetHeader className="mb-4">
              <SheetTitle className="text-white flex items-center gap-2 text-base">
                <Eye className="h-4 w-4 text-violet-400" />
                AI Deep Preview
              </SheetTitle>
              <SheetDescription className="text-white/40 text-xs">
                Groq-generated analysis with skills, competition &amp; next
                steps
              </SheetDescription>
            </SheetHeader>
            {previewOpp && (
              <PreviewPanel
                opportunity={previewOpp}
                preview={preview}
                isLoading={isPreviewLoading}
              />
            )}
          </SheetContent>
        </Sheet>
      </div>
    </TooltipProvider>
  );
}

export default OpportunityFinder;
