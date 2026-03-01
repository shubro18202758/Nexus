"use client";

import { useEffect, useState, use } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Skeleton } from "@/components/ui/skeleton";
import {
  ArrowLeft,
  Globe,
  Instagram,
  Github,
  Mail,
  Users,
  Calendar,
  BookOpen,
  Sparkles,
  ExternalLink,
  Loader2,
  Radio,
  Zap,
  Brain,
  FileText,
  MapPin,
  TrendingUp,
  Award,
} from "lucide-react";
import Link from "next/link";
import { cn } from "@/lib/utils";
import type { Club } from "@/db/schema";

interface KnowledgeItem {
  id: string;
  clubId: string;
  knowledgeType: string;
  title: string;
  content: string;
  sourceUrl: string;
  confidence: string;
}

interface ClubEvent {
  id: string;
  clubId: string;
  title: string;
  description: string;
  eventType: string;
  registrationUrl: string;
}

interface LiveArticle {
  title: string;
  url: string;
  summary: string;
  publishedDate?: string;
  type: string;
}

interface LiveEvent {
  title: string;
  url: string;
  summary: string;
  type: string;
}

const CATEGORY_ACCENT: Record<string, string> = {
  technical: "from-cyan-500 to-blue-500",
  cultural: "from-pink-500 to-rose-500",
  sports: "from-emerald-500 to-green-500",
  entrepreneurship: "from-amber-500 to-yellow-500",
  research: "from-violet-500 to-purple-500",
  social: "from-rose-500 to-red-500",
  media: "from-blue-500 to-indigo-500",
  hobby: "from-teal-500 to-cyan-500",
  other: "from-gray-500 to-gray-400",
};

export default function ClubDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const [club, setClub] = useState<Club | null>(null);
  const [knowledge, setKnowledge] = useState<KnowledgeItem[]>([]);
  const [events, setEvents] = useState<ClubEvent[]>([]);
  const [liveArticles, setLiveArticles] = useState<LiveArticle[]>([]);
  const [liveEvents, setLiveEvents] = useState<LiveEvent[]>([]);
  const [liveAnswer, setLiveAnswer] = useState("");
  const [loading, setLoading] = useState(true);
  const [liveLoading, setLiveLoading] = useState(false);
  const [activeTab, setActiveTab] = useState("knowledge");

  // Fetch club data
  useEffect(() => {
    async function load() {
      setLoading(true);
      try {
        // Get club from list
        const clubRes = await fetch(`/api/clubs/crawl?limit=500`);
        const clubData = await clubRes.json();
        const found = (clubData.clubs ?? []).find((c: Club) => c.id === id);
        if (found) setClub(found);

        // Get knowledge
        const knowledgeRes = await fetch(`/api/clubs/${id}/knowledge`);
        const knowledgeData = await knowledgeRes.json();
        setKnowledge(knowledgeData.items ?? []);

        // Get events
        const eventsRes = await fetch(`/api/clubs/${id}/events`);
        const eventsData = await eventsRes.json();
        setEvents(eventsData.events ?? []);
      } catch (err) {
        console.error("Failed to load club:", err);
      } finally {
        setLoading(false);
      }
    }
    load();
  }, [id]);

  // Fetch live data on demand
  const fetchLive = async () => {
    if (!club) return;
    setLiveLoading(true);
    try {
      const iitLabel = club.iitId?.toUpperCase().replace("IIT", "IIT ") ?? "";
      const res = await fetch(
        `/api/clubs/${id}/live?name=${encodeURIComponent(club.name)}&iit=${encodeURIComponent(iitLabel)}`
      );
      const data = await res.json();
      setLiveArticles(data.articles ?? []);
      setLiveEvents(data.events ?? []);
      setLiveAnswer(data.answer ?? "");
    } catch (err) {
      console.error("Live fetch error:", err);
    } finally {
      setLiveLoading(false);
    }
  };

  const gradient = CATEGORY_ACCENT[club?.category ?? "other"] ?? CATEGORY_ACCENT.other;

  if (loading) {
    return (
      <div className="flex flex-col min-h-screen p-4 md:p-6 lg:p-8 space-y-6">
        <Skeleton className="h-8 w-48 bg-white/[0.06]" />
        <Skeleton className="h-32 w-full bg-white/[0.04] rounded-2xl" />
        <div className="grid grid-cols-3 gap-4">
          <Skeleton className="h-20 bg-white/[0.04] rounded-xl" />
          <Skeleton className="h-20 bg-white/[0.04] rounded-xl" />
          <Skeleton className="h-20 bg-white/[0.04] rounded-xl" />
        </div>
      </div>
    );
  }

  if (!club) {
    return (
      <div className="flex flex-col items-center justify-center min-h-screen gap-4">
        <p className="text-white/40 font-mono">Club not found</p>
        <Link href="/clubs">
          <Button variant="ghost" className="text-violet-400">
            <ArrowLeft className="w-4 h-4 mr-2" />
            Back to Clubs
          </Button>
        </Link>
      </div>
    );
  }

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      transition={{ duration: 0.6 }}
      className="flex flex-col min-h-screen p-4 md:p-6 lg:p-8 space-y-6 pb-32 overflow-x-hidden"
    >
      {/* Back Button */}
      <Link href="/clubs" className="inline-flex items-center gap-1.5 text-white/40 hover:text-white/70 transition-colors font-mono text-sm w-fit group">
        <ArrowLeft className="w-4 h-4 group-hover:-translate-x-1 transition-transform" />
        NEXUS // CLUBS
      </Link>

      {/* Hero Card */}
      <motion.div
        initial={{ y: 20 }}
        animate={{ y: 0 }}
        className="relative rounded-2xl border border-white/[0.06] bg-black/50 backdrop-blur-xl overflow-hidden"
      >
        {/* Cover gradient with mesh overlay */}
        <div className={cn("relative h-32 md:h-40 bg-gradient-to-br", gradient)}>
          <div className="absolute inset-0 opacity-30" style={{
            backgroundImage: `radial-gradient(circle at 20% 50%, rgba(255,255,255,0.15) 0%, transparent 50%),
              radial-gradient(circle at 80% 30%, rgba(255,255,255,0.1) 0%, transparent 40%),
              radial-gradient(circle at 50% 80%, rgba(0,0,0,0.2) 0%, transparent 50%)`,
          }} />
          {/* IIT Badge */}
          <div className="absolute top-3 right-3 flex items-center gap-1 px-2 py-1 rounded-lg bg-black/30 backdrop-blur-md border border-white/10">
            <MapPin className="w-3 h-3 text-white/70" />
            <span className="text-[10px] font-mono text-white/80 font-bold tracking-wider">
              {club.iitId?.toUpperCase()}
            </span>
          </div>
          {/* Category badge */}
          <div className="absolute top-3 left-3">
            <span className="px-2 py-1 rounded-lg bg-black/30 backdrop-blur-md border border-white/10 text-[10px] font-mono text-white/80 tracking-wider uppercase font-bold">
              {club.category}
            </span>
          </div>
        </div>

        {/* Logo floating between cover and content */}
        <div className="relative px-6 md:px-8">
          <div className="absolute -top-8 left-6 md:left-8">
            <div className="w-16 h-16 rounded-xl bg-black/80 border-2 border-white/10 backdrop-blur-md overflow-hidden flex items-center justify-center shadow-lg">
              {club.websiteUrl ? (
                <img
                  src={`https://www.google.com/s2/favicons?domain=${new URL(club.websiteUrl).hostname}&sz=64`}
                  alt={club.name}
                  className="w-10 h-10 object-contain"
                  onError={(e) => {
                    (e.target as HTMLImageElement).src = `https://ui-avatars.com/api/?name=${encodeURIComponent(club.name)}&background=7c3aed&color=fff&size=64`;
                  }}
                />
              ) : (
                <img
                  src={`https://ui-avatars.com/api/?name=${encodeURIComponent(club.name)}&background=7c3aed&color=fff&size=64`}
                  alt={club.name}
                  className="w-10 h-10 object-contain"
                />
              )}
            </div>
          </div>
        </div>

        <div className="p-6 md:p-8 pt-12 space-y-4">
          <div className="flex flex-col md:flex-row md:items-start md:justify-between gap-4">
            <div className="space-y-2">
              <div className="flex items-center gap-3">
                <h1 className={cn(
                  "text-3xl md:text-4xl font-bold font-space tracking-tight bg-gradient-to-r bg-clip-text text-transparent",
                  gradient
                )}>
                  {club.name}
                </h1>
                {club.isRecruiting === "true" && (
                  <Badge variant="outline" className="border-emerald-500/30 text-emerald-400 text-[10px] animate-pulse">
                    <Sparkles className="w-3 h-3 mr-1" />
                    RECRUITING
                  </Badge>
                )}
              </div>

              <p className="text-xs font-mono text-white/40 tracking-wider uppercase">
                {club.iitId?.toUpperCase()} // {club.category?.toUpperCase()} DIVISION
              </p>

              {club.tagline && (
                <p className="text-sm text-white/60 italic max-w-2xl">
                  &quot;{club.tagline}&quot;
                </p>
              )}

              {club.description && (
                <p className="text-sm text-white/50 leading-relaxed max-w-3xl">
                  {club.description}
                </p>
              )}
            </div>

            {/* Social Links */}
            <div className="flex items-center gap-2 shrink-0">
              {club.websiteUrl && (
                <a href={club.websiteUrl} target="_blank" rel="noopener noreferrer"
                  className="p-2 rounded-lg bg-white/[0.04] border border-white/[0.06] hover:bg-white/[0.08] hover:border-cyan-500/30 transition-all group/link">
                  <Globe className="w-4 h-4 text-white/40 group-hover/link:text-cyan-400" />
                </a>
              )}
              {club.instagramUrl && (
                <a href={club.instagramUrl} target="_blank" rel="noopener noreferrer"
                  className="p-2 rounded-lg bg-white/[0.04] border border-white/[0.06] hover:bg-white/[0.08] hover:border-pink-500/30 transition-all group/link">
                  <Instagram className="w-4 h-4 text-white/40 group-hover/link:text-pink-400" />
                </a>
              )}
              {club.githubUrl && (
                <a href={club.githubUrl} target="_blank" rel="noopener noreferrer"
                  className="p-2 rounded-lg bg-white/[0.04] border border-white/[0.06] hover:bg-white/[0.08] hover:border-white/20 transition-all group/link">
                  <Github className="w-4 h-4 text-white/40 group-hover/link:text-white/80" />
                </a>
              )}
              {club.email && (
                <a href={`mailto:${club.email}`}
                  className="p-2 rounded-lg bg-white/[0.04] border border-white/[0.06] hover:bg-white/[0.08] hover:border-amber-500/30 transition-all group/link">
                  <Mail className="w-4 h-4 text-white/40 group-hover/link:text-amber-400" />
                </a>
              )}
            </div>
          </div>

          {/* Meta chips */}
          <div className="flex flex-wrap gap-2">
            {club.memberCount && (
              <div className="flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-white/[0.04] border border-white/[0.06] text-xs text-white/50">
                <Users className="w-3.5 h-3.5" />
                {club.memberCount} members
              </div>
            )}
            {club.foundedYear && (
              <div className="flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-white/[0.04] border border-white/[0.06] text-xs text-white/50">
                <Calendar className="w-3.5 h-3.5" />
                Est. {club.foundedYear}
              </div>
            )}
            {club.activityScore != null && club.activityScore > 0 && (
              <div className="flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-emerald-500/[0.06] border border-emerald-500/[0.08] text-xs text-emerald-400/70">
                <TrendingUp className="w-3.5 h-3.5" />
                Activity: {club.activityScore}
              </div>
            )}
            {Array.isArray(club.tags) && (club.tags as string[]).map((tag) => (
              <span
                key={tag}
                className="px-2 py-1 rounded-lg text-[10px] font-mono bg-white/[0.04] text-white/40 border border-white/[0.04]"
              >
                #{tag}
              </span>
            ))}
          </div>
        </div>
      </motion.div>

      {/* Tabs */}
      <Tabs value={activeTab} onValueChange={setActiveTab} className="space-y-6">
        <div className="p-1 bg-black/40 border border-white/[0.05] rounded-xl backdrop-blur-md">
          <TabsList className="bg-transparent border-0 gap-1">
            <TabsTrigger
              value="knowledge"
              className="data-[state=active]:bg-violet-500/20 data-[state=active]:text-violet-300 data-[state=active]:shadow-[0_0_10px_rgba(139,92,246,0.2)] rounded-lg font-mono text-xs tracking-wide flex items-center gap-1.5 transition-all"
            >
              <Brain className="w-3 h-3" />
              Knowledge ({knowledge.length})
            </TabsTrigger>
            <TabsTrigger
              value="events"
              className="data-[state=active]:bg-emerald-500/20 data-[state=active]:text-emerald-300 data-[state=active]:shadow-[0_0_10px_rgba(16,185,129,0.2)] rounded-lg font-mono text-xs tracking-wide flex items-center gap-1.5 transition-all"
            >
              <Calendar className="w-3 h-3" />
              Events ({events.length})
            </TabsTrigger>
            <TabsTrigger
              value="live"
              onClick={() => {
                if (liveArticles.length === 0 && !liveLoading) fetchLive();
              }}
              className="data-[state=active]:bg-cyan-500/20 data-[state=active]:text-cyan-300 data-[state=active]:shadow-[0_0_10px_rgba(6,182,212,0.2)] rounded-lg font-mono text-xs tracking-wide flex items-center gap-1.5 transition-all"
            >
              <Radio className="w-3 h-3" />
              Live Intel
            </TabsTrigger>
          </TabsList>
        </div>

        {/* Knowledge Tab */}
        <TabsContent value="knowledge" className="space-y-4">
          {knowledge.length > 0 ? (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {knowledge.map((item, i) => (
                <motion.div
                  key={item.id}
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: i * 0.05 }}
                  className="rounded-xl border border-white/[0.06] bg-black/40 backdrop-blur-md p-4 space-y-2 hover:border-white/[0.12] transition-all group"
                >
                  <div className="flex items-start justify-between gap-2">
                    <h4 className="text-sm font-semibold text-white/80">{item.title}</h4>
                    <Badge variant="outline" className="text-[8px] shrink-0 border-violet-500/20 text-violet-400/70">
                      {item.knowledgeType}
                    </Badge>
                  </div>
                  <p className="text-xs text-white/50 leading-relaxed line-clamp-4">{item.content}</p>
                  <div className="flex items-center justify-between pt-1">
                    <span className="text-[9px] font-mono text-white/25">
                      confidence: {(parseFloat(item.confidence) * 100).toFixed(0)}%
                    </span>
                    {item.sourceUrl && (
                      <a href={item.sourceUrl} target="_blank" rel="noopener noreferrer"
                        className="text-[10px] text-cyan-400/50 hover:text-cyan-400 transition-colors flex items-center gap-0.5">
                        source <ExternalLink className="w-2.5 h-2.5" />
                      </a>
                    )}
                  </div>
                </motion.div>
              ))}
            </div>
          ) : (
            <EmptyTab icon={BookOpen} message="No knowledge extracted yet" detail="Run the crawler to gather intel" />
          )}
        </TabsContent>

        {/* Events Tab */}
        <TabsContent value="events" className="space-y-4">
          {events.length > 0 ? (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {events.map((ev, i) => (
                <motion.div
                  key={ev.id}
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: i * 0.05 }}
                  className="rounded-xl border border-white/[0.06] bg-black/40 backdrop-blur-md p-4 space-y-2 hover:border-emerald-500/20 transition-all"
                >
                  <div className="flex items-start justify-between gap-2">
                    <h4 className="text-sm font-semibold text-white/80">{ev.title}</h4>
                    <Badge variant="outline" className="text-[8px] shrink-0 border-emerald-500/20 text-emerald-400/70">
                      {ev.eventType}
                    </Badge>
                  </div>
                  <p className="text-xs text-white/50 line-clamp-3">{ev.description}</p>
                  {ev.registrationUrl && (
                    <a href={ev.registrationUrl} target="_blank" rel="noopener noreferrer"
                      className="inline-flex items-center gap-1 text-xs text-emerald-400/70 hover:text-emerald-400 transition-colors">
                      Register <ExternalLink className="w-3 h-3" />
                    </a>
                  )}
                </motion.div>
              ))}
            </div>
          ) : (
            <EmptyTab icon={Calendar} message="No events found" detail="Events will appear after crawling" />
          )}
        </TabsContent>

        {/* Live Intel Tab */}
        <TabsContent value="live" className="space-y-6">
          {liveLoading ? (
            <div className="flex flex-col items-center justify-center h-40 gap-3">
              <Loader2 className="w-6 h-6 text-cyan-400 animate-spin" />
              <p className="text-xs font-mono text-white/40">Scanning the web for live intel...</p>
            </div>
          ) : (
            <>
              {/* Live answer */}
              {liveAnswer && (
                <div className="rounded-xl border border-cyan-500/20 bg-cyan-500/[0.06] backdrop-blur-xl p-4 space-y-2">
                  <div className="flex items-center gap-2">
                    <Zap className="w-4 h-4 text-cyan-400" />
                    <span className="text-[10px] font-mono text-cyan-400 tracking-widest uppercase font-bold">
                      Live Summary
                    </span>
                  </div>
                  <p className="text-sm text-white/70 leading-relaxed">{liveAnswer}</p>
                </div>
              )}

              {/* Articles */}
              {liveArticles.length > 0 && (
                <div className="space-y-3">
                  <h3 className="text-[10px] font-mono text-white/40 tracking-widest uppercase">
                    Recent Articles & News
                  </h3>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                    {liveArticles.map((article, i) => (
                      <a
                        key={i}
                        href={article.url}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="rounded-xl border border-white/[0.06] bg-black/40 p-4 space-y-2 hover:border-cyan-500/20 transition-all group"
                      >
                        <h4 className="text-sm font-semibold text-white/80 group-hover:text-cyan-300 transition-colors line-clamp-2">
                          {article.title}
                        </h4>
                        <p className="text-xs text-white/40 line-clamp-2">{article.summary}</p>
                        <div className="flex items-center gap-2 text-[10px] text-white/25">
                          {article.publishedDate && <span>{article.publishedDate}</span>}
                          <ExternalLink className="w-2.5 h-2.5 ml-auto" />
                        </div>
                      </a>
                    ))}
                  </div>
                </div>
              )}

              {/* Live Events */}
              {liveEvents.length > 0 && (
                <div className="space-y-3">
                  <h3 className="text-[10px] font-mono text-white/40 tracking-widest uppercase">
                    Upcoming Events & Competitions
                  </h3>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                    {liveEvents.map((ev, i) => (
                      <a
                        key={i}
                        href={ev.url}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="rounded-xl border border-white/[0.06] bg-black/40 p-4 space-y-2 hover:border-emerald-500/20 transition-all group"
                      >
                        <div className="flex items-start justify-between gap-2">
                          <h4 className="text-sm font-semibold text-white/80 group-hover:text-emerald-300 transition-colors line-clamp-2">
                            {ev.title}
                          </h4>
                          <Badge variant="outline" className="text-[8px] shrink-0 border-emerald-500/20 text-emerald-400/70">
                            {ev.type}
                          </Badge>
                        </div>
                        <p className="text-xs text-white/40 line-clamp-2">{ev.summary}</p>
                      </a>
                    ))}
                  </div>
                </div>
              )}

              {liveArticles.length === 0 && liveEvents.length === 0 && !liveLoading && (
                <div className="flex flex-col items-center justify-center gap-3">
                  <Button onClick={fetchLive} variant="ghost" className="text-cyan-400 font-mono text-xs">
                    <Radio className="w-4 h-4 mr-2" />
                    SCAN WEB FOR LIVE INTEL
                  </Button>
                </div>
              )}
            </>
          )}
        </TabsContent>
      </Tabs>
    </motion.div>
  );
}

function EmptyTab({ icon: Icon, message, detail }: { icon: React.ComponentType<{ className?: string }>; message: string; detail: string }) {
  return (
    <div className="flex flex-col items-center justify-center h-40 border border-dashed border-white/10 rounded-2xl bg-black/20">
      <Icon className="w-8 h-8 text-white/15 mb-3" />
      <p className="text-sm text-white/30 font-mono">{message}</p>
      <p className="text-xs text-white/15">{detail}</p>
    </div>
  );
}
