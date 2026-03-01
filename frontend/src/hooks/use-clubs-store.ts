import { create } from "zustand";
import type { Club } from "@/db/schema";

interface CrawlEvent {
  type: string;
  stage?: string;
  iitId?: string;
  message?: string;
  clubName?: string;
  clubId?: string;
  data?: unknown;
}

// Agentic search result from the multi-agent pipeline
interface AgenticResult {
  answer: string;
  intent: string;
  subQueries: string[];
  confidence: number;
  suggestedFollowups: string[];
  comparisonData?: {
    clubs: Array<{
      name: string;
      iitId: string;
      category: string;
      strengths: string[];
      weaknesses: string[];
      rating: number;
    }>;
    verdict: string;
    dimensions: string[];
  };
  recommendations?: Array<{
    clubName: string;
    iitId: string;
    matchScore: number;
    reason: string;
    highlights: string[];
  }>;
}

// View modes
type ViewMode = "grid" | "list" | "compare";

// Sort options
type SortBy = "name" | "memberCount" | "foundedYear" | "updatedAt" | "activityScore";

interface ClubsState {
  // Data
  clubs: Club[];
  selectedClub: Club | null;
  searchResults: Club[];
  searchAnswer: string;

  // Agentic search state
  agenticResult: AgenticResult | null;
  searchHistory: Array<{ query: string; timestamp: number; intent: string }>;

  // Comparison
  compareList: Club[];
  isCompareMode: boolean;

  // Crawl pipeline
  crawlEvents: CrawlEvent[];
  isCrawling: boolean;
  crawlProgress: string;

  // Filters & View
  activeIIT: string;
  activeCategory: string;
  searchQuery: string;
  localFilter: string;          // Client-side text filter for non-AI browsing
  viewMode: ViewMode;
  sortBy: SortBy;
  sortDesc: boolean;
  showRecruiting: boolean;

  // Stats
  stats: {
    totalClubs: number;
    totalKnowledge: number;
    totalEvents: number;
    byCategory: { category: string; count: number }[];
    byIIT: { iitId: string; count: number }[];
  } | null;

  // Loading
  isLoading: boolean;
  isSearching: boolean;

  // Setters
  setClubs: (clubs: Club[]) => void;
  setSelectedClub: (club: Club | null) => void;
  setSearchResults: (results: Club[], answer: string) => void;
  setAgenticResult: (r: AgenticResult | null) => void;
  addCrawlEvent: (event: CrawlEvent) => void;
  clearCrawlEvents: () => void;
  setIsCrawling: (v: boolean) => void;
  setCrawlProgress: (msg: string) => void;
  setActiveIIT: (iit: string) => void;
  setActiveCategory: (cat: string) => void;
  setSearchQuery: (q: string) => void;
  setLocalFilter: (q: string) => void;
  setStats: (stats: ClubsState["stats"]) => void;
  setIsLoading: (v: boolean) => void;
  setIsSearching: (v: boolean) => void;
  setViewMode: (mode: ViewMode) => void;
  setSortBy: (sort: SortBy) => void;
  toggleSortDesc: () => void;
  setShowRecruiting: (v: boolean) => void;

  // Compare actions
  toggleCompare: (club: Club) => void;
  clearCompare: () => void;
  setCompareMode: (v: boolean) => void;

  // Async actions
  fetchClubs: (iitId?: string, category?: string) => Promise<void>;
  fetchStats: () => Promise<void>;
  searchClubs: (query: string) => Promise<void>;
  startCrawl: (config: { iitIds: string[]; maxClubsPerIIT: number; preview: boolean }) => Promise<void>;
}

export const useClubsStore = create<ClubsState>((set, get) => ({
  clubs: [],
  selectedClub: null,
  searchResults: [],
  searchAnswer: "",
  agenticResult: null,
  searchHistory: [],
  compareList: [],
  isCompareMode: false,
  crawlEvents: [],
  isCrawling: false,
  crawlProgress: "",
  activeIIT: "all",
  activeCategory: "all",
  searchQuery: "",
  localFilter: "",
  viewMode: "grid",
  sortBy: "activityScore",
  sortDesc: true,
  showRecruiting: false,
  stats: null,
  isLoading: false,
  isSearching: false,

  setClubs: (clubs) => set({ clubs }),
  setSelectedClub: (club) => set({ selectedClub: club }),
  setSearchResults: (results, answer) => set({ searchResults: results, searchAnswer: answer }),
  setAgenticResult: (r) => set({ agenticResult: r }),
  addCrawlEvent: (event) => set((s) => ({ crawlEvents: [...s.crawlEvents, event] })),
  clearCrawlEvents: () => set({ crawlEvents: [] }),
  setIsCrawling: (v) => set({ isCrawling: v }),
  setCrawlProgress: (msg) => set({ crawlProgress: msg }),
  setActiveIIT: (iit) => set({ activeIIT: iit }),
  setActiveCategory: (cat) => set({ activeCategory: cat }),
  setSearchQuery: (q) => set({ searchQuery: q }),
  setLocalFilter: (q) => set({ localFilter: q }),
  setStats: (stats) => set({ stats }),
  setIsLoading: (v) => set({ isLoading: v }),
  setIsSearching: (v) => set({ isSearching: v }),
  setViewMode: (mode) => set({ viewMode: mode }),
  setSortBy: (sort) => set({ sortBy: sort }),
  toggleSortDesc: () => set((s) => ({ sortDesc: !s.sortDesc })),
  setShowRecruiting: (v) => set({ showRecruiting: v }),

  // Compare actions
  toggleCompare: (club) => set((s) => {
    const exists = s.compareList.find((c) => c.id === club.id);
    if (exists) return { compareList: s.compareList.filter((c) => c.id !== club.id) };
    if (s.compareList.length >= 4) return s;
    return { compareList: [...s.compareList, club] };
  }),
  clearCompare: () => set({ compareList: [], isCompareMode: false }),
  setCompareMode: (v) => set({ isCompareMode: v }),

  fetchClubs: async (iitId, category) => {
    set({ isLoading: true });
    try {
      const params = new URLSearchParams();
      if (iitId && iitId !== "all") params.set("iitId", iitId);
      if (category && category !== "all") params.set("category", category);
      const res = await fetch(`/api/clubs/crawl?${params}`);
      const data = await res.json();
      set({ clubs: data.clubs ?? [] });
    } catch (err) {
      console.error("fetchClubs error:", err);
    } finally {
      set({ isLoading: false });
    }
  },

  fetchStats: async () => {
    try {
      const res = await fetch("/api/clubs/stats");
      const data = await res.json();
      set({ stats: data });
    } catch (err) {
      console.error("fetchStats error:", err);
    }
  },

  searchClubs: async (query) => {
    set({ isSearching: true, searchQuery: query });
    try {
      const { activeIIT, activeCategory } = get();
      const res = await fetch("/api/clubs/search", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          query,
          iitId: activeIIT !== "all" ? activeIIT : undefined,
          category: activeCategory !== "all" ? activeCategory : undefined,
        }),
      });
      const data = await res.json();
      set({
        searchResults: data.clubs ?? [],
        searchAnswer: data.answer ?? "",
        agenticResult: data.agenticResult ?? null,
        searchHistory: [
          ...get().searchHistory.slice(-9),
          { query, timestamp: Date.now(), intent: data.agenticResult?.intent ?? "search" },
        ],
      });
    } catch (err) {
      console.error("searchClubs error:", err);
    } finally {
      set({ isSearching: false });
    }
  },

  startCrawl: async (config) => {
    set({ isCrawling: true, crawlEvents: [], crawlProgress: "Connecting..." });
    try {
      const res = await fetch("/api/clubs/crawl", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(config),
      });

      const reader = res.body?.getReader();
      if (!reader) throw new Error("No stream");

      const decoder = new TextDecoder();
      let buffer = "";

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split("\n\n");
        buffer = lines.pop() ?? "";

        for (const line of lines) {
          if (!line.startsWith("data: ")) continue;
          try {
            const event = JSON.parse(line.slice(6));
            get().addCrawlEvent(event);

            if (event.message) {
              set({ crawlProgress: event.message });
            }

            if (event.type === "persisted") {
              get().fetchClubs(get().activeIIT, get().activeCategory);
            }
          } catch { /* skip malformed */ }
        }
      }
    } catch (err) {
      console.error("Crawl error:", err);
      get().addCrawlEvent({ type: "fatal_error", message: String(err) });
    } finally {
      set({ isCrawling: false, crawlProgress: "" });
      get().fetchClubs(get().activeIIT, get().activeCategory);
      get().fetchStats();
    }
  },
}));
