"use client";

import { useState, useCallback } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
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
} from "lucide-react";
import { toast } from "sonner";
import type { FoundOpportunity, SearchProgress, Institution } from "@/lib/ai/opportunity-finder";

// ─── Types ────────────────────────────────────────────────────────────────────

interface OpportunityFinderProps {
  onOpportunitiesFound?: (opportunities: FoundOpportunity[]) => void;
  apiKey?: string;
}

// ─── Opportunity Type Icons ───────────────────────────────────────────────────

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

// ─── Progress Stage Config ────────────────────────────────────────────────────

const STAGE_CONFIG: Record<SearchProgress["stage"], { label: string; icon: typeof Search }> = {
  initializing: { label: "Initializing search agent...", icon: Sparkles },
  fetching: { label: "Fetching department pages...", icon: Search },
  analyzing: { label: "AI analyzing opportunities...", icon: Microscope },
  filtering: { label: "Filtering by relevance...", icon: Target },
  complete: { label: "Search complete!", icon: CheckCircle2 },
  error: { label: "Error occurred", icon: Clock },
};

// ─── Single Opportunity Card ──────────────────────────────────────────────────

function OpportunityResultCard({ opportunity }: { opportunity: FoundOpportunity }) {
  const [showFull, setShowFull] = useState(false);
  const TypeIcon = TYPE_ICONS[opportunity.type];
  
  return (
    <Card className="border-white/10 bg-white/5 hover:border-white/20 transition-all">
      <CardHeader className="pb-3">
        <div className="flex items-start justify-between gap-2">
          <div className="flex items-center gap-2 flex-wrap">
            <Badge variant="outline" className={TYPE_COLORS[opportunity.type]}>
              <TypeIcon className="h-3 w-3 mr-1" />
              {opportunity.type}
            </Badge>
            <Badge variant="outline" className="border-cyan-500/50 text-cyan-400 bg-cyan-500/10">
              {opportunity.department.split(" ")[0]}
            </Badge>
          </div>
          <Badge 
            variant="outline" 
            className={`${
              opportunity.relevanceScore >= 85 
                ? "bg-green-500/20 text-green-400 border-green-500/50" 
                : opportunity.relevanceScore >= 70 
                  ? "bg-yellow-500/20 text-yellow-400 border-yellow-500/50"
                  : "bg-gray-500/20 text-gray-400 border-gray-500/50"
            }`}
          >
            <Target className="h-3 w-3 mr-1" />
            {opportunity.relevanceScore}% Match
          </Badge>
        </div>
        
        <CardTitle className="text-base font-semibold text-white leading-snug mt-2">
          {opportunity.title}
        </CardTitle>
        
        <p className="text-xs text-muted-foreground flex items-center gap-1 mt-1">
          <Building2 className="h-3 w-3" />
          {opportunity.institution}
        </p>
      </CardHeader>
      
      <CardContent className="space-y-3">
        <p className={`text-sm text-white/70 ${showFull ? "" : "line-clamp-3"}`}>
          {opportunity.description}
        </p>
        
        {opportunity.description.length > 150 && (
          <button 
            onClick={() => setShowFull(!showFull)}
            className="text-xs text-cyan-400 hover:text-cyan-300"
          >
            {showFull ? "Show less" : "Read more"}
          </button>
        )}
        
        {/* Tags */}
        <div className="flex flex-wrap gap-1">
          {opportunity.tags.map((tag, idx) => (
            <span 
              key={idx}
              className="text-[10px] px-2 py-0.5 rounded-full bg-white/5 text-white/60 border border-white/10"
            >
              {tag}
            </span>
          ))}
        </div>
        
        {/* Deadline & Eligibility */}
        <div className="space-y-2 pt-2 border-t border-white/5">
          {opportunity.deadline && (
            <div className="flex items-center gap-2 text-xs text-white/60">
              <Calendar className="h-3 w-3 text-orange-400" />
              <span>Deadline: <span className="text-orange-400 font-medium">{opportunity.deadline}</span></span>
            </div>
          )}
          
          {opportunity.eligibility && (
            <div className="flex items-start gap-2 text-xs text-white/60">
              <GraduationCap className="h-3 w-3 text-purple-400 mt-0.5 shrink-0" />
              <span>{opportunity.eligibility}</span>
            </div>
          )}
        </div>
        
        {/* Action Button */}
        {opportunity.applicationUrl && (
          <a
            href={opportunity.applicationUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="flex items-center justify-center gap-2 w-full py-2 mt-2 rounded-lg bg-gradient-to-r from-violet-600/80 to-cyan-600/80 hover:from-violet-600 hover:to-cyan-600 text-white text-sm font-medium transition-all"
          >
            Apply Now
            <ExternalLink className="h-3.5 w-3.5" />
          </a>
        )}
      </CardContent>
    </Card>
  );
}

// ─── Main Opportunity Finder Component ────────────────────────────────────────

export function OpportunityFinder({ onOpportunitiesFound, apiKey }: OpportunityFinderProps) {
  const [isSearching, setIsSearching] = useState(false);
  const [progress, setProgress] = useState<SearchProgress | null>(null);
  const [results, setResults] = useState<FoundOpportunity[]>([]);
  const [searchStats, setSearchStats] = useState<{
    departments: string[];
    pagesScanned: number;
    duration: number;
  } | null>(null);
  const [showResults, setShowResults] = useState(false);

  // Simulate progress during API call
  const simulateProgress = useCallback(async () => {
    const stages: SearchProgress[] = [
      { stage: "initializing", progress: 10, message: "Initializing search agent...", foundCount: 0 },
      { stage: "fetching", progress: 25, message: "Fetching CSE department pages...", currentDepartment: "Computer Science and Engineering", currentInstitution: "IIT Bombay", foundCount: 0 },
      { stage: "fetching", progress: 45, message: "Fetching Physics department pages...", currentDepartment: "Department of Physics", currentInstitution: "IIT Bombay", foundCount: 0 },
      { stage: "analyzing", progress: 65, message: "AI analyzing opportunities...", foundCount: 0 },
      { stage: "filtering", progress: 85, message: "Filtering by relevance...", foundCount: 0 },
    ];
    
    for (const stage of stages) {
      setProgress(stage);
      await new Promise(r => setTimeout(r, 700));
    }
  }, []);

  const handleSearch = async () => {
    setIsSearching(true);
    setShowResults(false);
    setResults([]);
    setProgress({ stage: "initializing", progress: 0, message: "Starting search...", foundCount: 0 });

    // Start progress simulation
    const progressPromise = simulateProgress();

    try {
      const response = await fetch("/api/opportunities/find", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          institutionIds: ["iit-bombay"],
          departmentIds: ["cse", "physics"],
          useDemoData: true, // Demo mode for presentation
          apiKey,
        }),
      });

      await progressPromise; // Wait for progress animation

      if (!response.ok) {
        throw new Error("Search failed");
      }

      const data = await response.json();

      setProgress({
        stage: "complete",
        progress: 100,
        message: `Found ${data.opportunities?.length || 0} opportunities!`,
        foundCount: data.opportunities?.length || 0,
      });

      setResults(data.opportunities || []);
      setSearchStats({
        departments: data.searchedDepartments || [],
        pagesScanned: data.totalPagesScanned || 0,
        duration: data.duration || 0,
      });
      
      onOpportunitiesFound?.(data.opportunities || []);
      
      // Show results after a short delay
      setTimeout(() => {
        setShowResults(true);
      }, 500);

      toast.success(`Found ${data.opportunities?.length || 0} opportunities!`);
    } catch (error) {
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
  };

  const StageIcon = progress ? STAGE_CONFIG[progress.stage].icon : Search;

  return (
    <div className="space-y-6">
      {/* Search Trigger Section */}
      <Card className="border-violet-500/30 bg-gradient-to-br from-violet-950/50 to-cyan-950/50">
        <CardContent className="p-6">
          <div className="flex flex-col md:flex-row items-start md:items-center justify-between gap-4">
            <div className="flex items-start gap-4">
              <div className="p-3 rounded-xl bg-violet-500/20 border border-violet-500/30">
                <Search className="h-6 w-6 text-violet-400" />
              </div>
              <div>
                <h3 className="text-lg font-semibold text-white">AI Opportunity Finder</h3>
                <p className="text-sm text-muted-foreground mt-1">
                  Powered by Groq LLMs to scan institution department pages and find relevant opportunities
                </p>
                <div className="flex items-center gap-3 mt-2">
                  <Badge variant="outline" className="border-cyan-500/50 text-cyan-400 bg-cyan-500/10">
                    <Building2 className="h-3 w-3 mr-1" />
                    IIT Bombay
                  </Badge>
                  <Badge variant="outline" className="border-purple-500/50 text-purple-400 bg-purple-500/10">
                    <Microscope className="h-3 w-3 mr-1" />
                    CSE
                  </Badge>
                  <Badge variant="outline" className="border-blue-500/50 text-blue-400 bg-blue-500/10">
                    <Atom className="h-3 w-3 mr-1" />
                    Physics
                  </Badge>
                </div>
              </div>
            </div>
            
            <Button
              onClick={handleSearch}
              disabled={isSearching}
              size="lg"
              className="bg-gradient-to-r from-violet-600 to-cyan-600 hover:from-violet-700 hover:to-cyan-700 text-white font-semibold min-w-[180px]"
            >
              {isSearching ? (
                <>
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                  Searching...
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
            <div className="mt-6 space-y-3">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2 text-sm text-white/80">
                  <StageIcon className="h-4 w-4 text-cyan-400" />
                  {progress.message}
                </div>
                <span className="text-xs text-muted-foreground font-mono">
                  {progress.progress}%
                </span>
              </div>
              <Progress value={progress.progress} className="h-2 bg-white/10">
                <div 
                  className="h-full bg-gradient-to-r from-violet-500 to-cyan-500 transition-all duration-300 rounded-full"
                  style={{ width: `${progress.progress}%` }}
                />
              </Progress>
              {progress.currentDepartment && (
                <p className="text-xs text-muted-foreground">
                  Scanning: {progress.currentDepartment} @ {progress.currentInstitution}
                </p>
              )}
            </div>
          )}
          
          {/* Completion State */}
          {progress?.stage === "complete" && !isSearching && (
            <div className="mt-6 flex items-center gap-3 p-3 rounded-lg bg-green-500/10 border border-green-500/30">
              <CheckCircle2 className="h-5 w-5 text-green-400" />
              <div className="flex-1">
                <p className="text-sm text-green-400 font-medium">{progress.message}</p>
                {searchStats && (
                  <p className="text-xs text-muted-foreground mt-1">
                    Scanned {searchStats.pagesScanned} pages across {searchStats.departments.join(", ")} in {(searchStats.duration / 1000).toFixed(1)}s
                  </p>
                )}
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Results Grid */}
      {showResults && results.length > 0 && (
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <h3 className="text-lg font-semibold text-white flex items-center gap-2">
              <Target className="h-5 w-5 text-cyan-400" />
              Found Opportunities
              <Badge className="ml-2 bg-cyan-500/20 text-cyan-300 border-cyan-500/50">
                {results.length}
              </Badge>
            </h3>
            <Dialog>
              <DialogTrigger asChild>
                <Button variant="outline" size="sm" className="border-white/10 text-white/70 hover:text-white">
                  View All
                  <ArrowRight className="h-3.5 w-3.5 ml-1" />
                </Button>
              </DialogTrigger>
              <DialogContent className="max-w-4xl max-h-[80vh] overflow-y-auto bg-zinc-950 border-white/10">
                <DialogHeader>
                  <DialogTitle className="text-white flex items-center gap-2">
                    <Target className="h-5 w-5 text-cyan-400" />
                    All Opportunities ({results.length})
                  </DialogTitle>
                  <DialogDescription>
                    AI-discovered opportunities from IIT Bombay CSE and Physics departments
                  </DialogDescription>
                </DialogHeader>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mt-4">
                  {results.map((opp) => (
                    <OpportunityResultCard key={opp.id} opportunity={opp} />
                  ))}
                </div>
              </DialogContent>
            </Dialog>
          </div>
          
          {/* Preview Cards - Show top 3 */}
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {results.slice(0, 3).map((opp) => (
              <OpportunityResultCard key={opp.id} opportunity={opp} />
            ))}
          </div>
          
          {results.length > 3 && (
            <p className="text-center text-sm text-muted-foreground">
              +{results.length - 3} more opportunities available
            </p>
          )}
        </div>
      )}
    </div>
  );
}

export default OpportunityFinder;
