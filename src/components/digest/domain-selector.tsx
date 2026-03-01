"use client";

import { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Search, Check, ChevronDown, ChevronUp, Sparkles, X } from "lucide-react";
import { DOMAINS, DOMAIN_CATEGORIES, type DomainCategory } from "@/lib/digest-domains";
import { useDigest } from "@/hooks/use-digest";
import { cn } from "@/lib/utils";
import { ScrollArea } from "@/components/ui/scroll-area";

export function DomainSelector() {
  const { activeDomains, toggleDomain, setActiveDomains } = useDigest();
  const [search, setSearch] = useState("");
  const [expandedCategory, setExpandedCategory] = useState<DomainCategory | null>(null);
  const [showAll, setShowAll] = useState(false);

  const filtered = search
    ? DOMAINS.filter(
        (d) =>
          d.name.toLowerCase().includes(search.toLowerCase()) ||
          d.category.toLowerCase().includes(search.toLowerCase()) ||
          d.searchKeywords.some((k) => k.toLowerCase().includes(search.toLowerCase()))
      )
    : DOMAINS;

  const toggleCategory = (catId: DomainCategory) => {
    setExpandedCategory(expandedCategory === catId ? null : catId);
  };

  const selectAllInCategory = (catId: DomainCategory) => {
    const domainIds = DOMAINS.filter((d) => d.category === catId).map((d) => d.id);
    const allSelected = domainIds.every((id) => activeDomains.includes(id));
    if (allSelected) {
      setActiveDomains(activeDomains.filter((id) => !domainIds.includes(id)));
    } else {
      const newDomains = new Set([...activeDomains, ...domainIds]);
      setActiveDomains(Array.from(newDomains));
    }
  };

  return (
    <motion.div
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.5, delay: 0.1 }}
    >
      {/* Active domains carousel */}
      <div className="flex items-center gap-2 mb-3 overflow-x-auto pb-2 scrollbar-hide">
        <span className="text-[9px] font-mono text-white/30 tracking-widest uppercase whitespace-nowrap shrink-0">ACTIVE:</span>
        {activeDomains.length === 0 ? (
          <span className="text-[10px] font-mono text-white/20">None selected — pick domains below</span>
        ) : (
          activeDomains.map((id) => {
            const domain = DOMAINS.find((d) => d.id === id);
            if (!domain) return null;
            return (
              <motion.button
                key={id}
                layout
                initial={{ scale: 0 }}
                animate={{ scale: 1 }}
                exit={{ scale: 0 }}
                onClick={() => toggleDomain(id)}
                className="flex items-center gap-1.5 px-3 py-1 rounded-full text-[10px] font-mono font-bold tracking-wider whitespace-nowrap transition-all border shrink-0"
                style={{ backgroundColor: `${domain.accentColor}15`, borderColor: `${domain.accentColor}40` }}
              >
                <span style={{ color: domain.accentColor }}>{domain.name}</span>
                <X className="h-2.5 w-2.5 text-white/40 hover:text-white/80" />
              </motion.button>
            );
          })
        )}

        <button
          onClick={() => setShowAll(!showAll)}
          className="flex items-center gap-1 px-3 py-1 rounded-full text-[10px] font-mono font-bold tracking-wider border border-dashed border-white/20 text-white/40 hover:text-white/70 hover:border-white/40 transition-all whitespace-nowrap shrink-0"
        >
          <Sparkles className="h-3 w-3" />
          {showAll ? "HIDE" : `BROWSE ${DOMAINS.length} DOMAINS`}
        </button>
      </div>

      {/* Expandable domain browser */}
      <AnimatePresence>
        {showAll && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: "auto", opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.3 }}
            className="overflow-hidden"
          >
            <div className="bg-black/40 border border-white/[0.06] rounded-2xl p-4 backdrop-blur-xl mb-4">
              {/* Search */}
              <div className="relative mb-4">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-white/30" />
                <input
                  type="text"
                  placeholder="Search domains (e.g., 'AI', 'football', 'music')..."
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  className="w-full bg-white/5 border border-white/10 rounded-xl pl-9 pr-4 py-2.5 text-sm font-mono text-white placeholder:text-white/20 focus:outline-none focus:border-amber-500/40 focus:shadow-[0_0_15px_rgba(245,158,11,0.1)] transition-all"
                />
              </div>

              <ScrollArea className="max-h-[400px]">
                <div className="space-y-3">
                  {DOMAIN_CATEGORIES.map((cat) => {
                    const catDomains = filtered.filter((d) => d.category === cat.id);
                    if (catDomains.length === 0) return null;
                    const isExpanded = expandedCategory === cat.id || !!search;
                    const allSelected = catDomains.every((d) => activeDomains.includes(d.id));

                    return (
                      <div key={cat.id} className="border border-white/[0.06] rounded-xl overflow-hidden">
                        {/* Category header — using div not button to avoid nesting */}
                        <div className="w-full flex items-center justify-between px-4 py-2.5 hover:bg-white/[0.03] transition-all">
                          <div
                            className="flex items-center gap-3 flex-1 cursor-pointer"
                            onClick={() => toggleCategory(cat.id)}
                            role="button"
                            tabIndex={0}
                          >
                            <div className={cn("w-2 h-8 rounded-full bg-gradient-to-b shrink-0", cat.gradient)} />
                            <span className="text-xs font-mono font-bold tracking-wider text-white/80 uppercase">
                              {cat.label}
                            </span>
                            <span className="text-[10px] font-mono text-white/30">
                              {catDomains.filter((d) => activeDomains.includes(d.id)).length}/{catDomains.length}
                            </span>
                            {isExpanded ? (
                              <ChevronUp className="h-3.5 w-3.5 text-white/30" />
                            ) : (
                              <ChevronDown className="h-3.5 w-3.5 text-white/30" />
                            )}
                          </div>
                          <button
                            onClick={() => selectAllInCategory(cat.id)}
                            className={cn(
                              "text-[9px] font-mono tracking-wider px-2 py-0.5 rounded-md border transition-all shrink-0",
                              allSelected
                                ? "bg-amber-500/20 border-amber-500/30 text-amber-300"
                                : "border-white/10 text-white/30 hover:text-white/60"
                            )}
                          >
                            {allSelected ? "DESELECT ALL" : "SELECT ALL"}
                          </button>
                        </div>

                        {/* Domain grid */}
                        <AnimatePresence>
                          {isExpanded && (
                            <motion.div
                              initial={{ height: 0 }}
                              animate={{ height: "auto" }}
                              exit={{ height: 0 }}
                              className="overflow-hidden"
                            >
                              <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-2 p-3 pt-1">
                                {catDomains.map((domain) => {
                                  const isActive = activeDomains.includes(domain.id);
                                  return (
                                    <button
                                      key={domain.id}
                                      onClick={() => toggleDomain(domain.id)}
                                      className={cn(
                                        "relative flex flex-col items-center gap-1.5 p-3 rounded-xl border transition-all text-center group hover:scale-[1.02] active:scale-[0.98]",
                                        isActive
                                          ? "border-amber-500/40 bg-gradient-to-b from-amber-500/10 to-transparent shadow-[0_0_15px_rgba(245,158,11,0.1)]"
                                          : "border-white/[0.06] bg-white/[0.02] hover:bg-white/[0.04] hover:border-white/10"
                                      )}
                                    >
                                      {isActive && (
                                        <div className="absolute top-1.5 right-1.5">
                                          <Check className="h-3 w-3 text-amber-400" />
                                        </div>
                                      )}
                                      <div
                                        className="w-8 h-8 rounded-lg flex items-center justify-center"
                                        style={{ backgroundColor: `${domain.accentColor}15` }}
                                      >
                                        <div className="w-3.5 h-3.5 rounded-full" style={{ backgroundColor: domain.accentColor }} />
                                      </div>
                                      <span className={cn(
                                        "text-[10px] font-mono tracking-wide leading-tight",
                                        isActive ? "text-white font-bold" : "text-white/50 group-hover:text-white/70"
                                      )}>
                                        {domain.name}
                                      </span>
                                    </button>
                                  );
                                })}
                              </div>
                            </motion.div>
                          )}
                        </AnimatePresence>
                      </div>
                    );
                  })}
                </div>
              </ScrollArea>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </motion.div>
  );
}
