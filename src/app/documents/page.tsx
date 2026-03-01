"use client";

import { useEffect, useState } from "react";
import { Plus, File, Trash2, Loader2, Sparkles, FolderOpen } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useDb } from "@/components/providers/db-provider";
import { documents } from "@/db/schema";
import { desc, eq } from "drizzle-orm";
import { useRouter } from "next/navigation";
import { v4 as uuidv4 } from "uuid";
import { TemplatePicker } from "@/components/editor/template-picker";
import { AuraCard } from "@/components/ui/aura-card";
import { motion } from "framer-motion";

export default function DocumentsPage() {
  const { db, workspaceId } = useDb();
  const router = useRouter();
  const [docs, setDocs] = useState<any[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [showTemplatePicker, setShowTemplatePicker] = useState(false);

  const fetchDocs = async () => {
    if (!db) return;
    const res = await db.select().from(documents).orderBy(desc(documents.createdAt));
    setDocs(res);
  };

  useEffect(() => {
    fetchDocs();
  }, [db]);

  const handleCreate = async () => {
    if (!db) return;
    setIsLoading(true);
    try {
      const newId = uuidv4();
      await db.insert(documents).values({
        id: newId,
        workspaceId: workspaceId,
        title: "Untitled Document",
        content: "<p>Start writing...</p>",
      });
      router.push(`/documents/${newId}`);
    } catch (e) {
      console.error(e);
      setIsLoading(false);
    }
  };

  const handleDelete = async (id: string, e: React.MouseEvent) => {
    e.stopPropagation();
    if (!db) return;
    if (confirm("Are you sure you want to delete this document?")) {
      await db.delete(documents).where(eq(documents.id, id));
      fetchDocs();
    }
  };

  return (
    <div className="flex flex-col h-full min-h-screen p-6 md:p-8 space-y-8">
      <div className="max-w-7xl mx-auto w-full space-y-8">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div className="space-y-1">
            <h1 className="text-3xl font-bold tracking-tight bg-gradient-to-r from-violet-400 via-fuchsia-400 to-cyan-400 bg-clip-text text-transparent drop-shadow-[0_0_10px_rgba(139,92,246,0.3)]">
              DATA VAULT
            </h1>
            <p className="text-muted-foreground font-mono text-xs tracking-wider uppercase text-cyan-500/60 flex items-center gap-2">
              <span className="w-2 h-2 bg-cyan-500 rounded-full animate-pulse shadow-[0_0_5px_cyan]"></span>
              Secure Storage // {docs.length} Files Encrypted
            </p>
          </div>
          <Button
            onClick={() => setShowTemplatePicker(true)}
            className="relative overflow-hidden bg-violet-600 hover:bg-violet-500 text-white border border-violet-400/50 shadow-[0_0_15px_-5px_purple] transition-all hover:shadow-[0_0_25px_-5px_fuchsia]"
          >
            <Plus className="mr-2 h-4 w-4" />
            <span className="font-mono tracking-wide">NEW.FILE</span>
          </Button>
        </div>

        {/* Template Picker */}
        <TemplatePicker isOpen={showTemplatePicker} onClose={() => setShowTemplatePicker(false)} />

        {/* Document Grid */}
        <div className="grid gap-5 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
          {docs.map((doc, i) => (
            <AuraCard
              key={doc.id}
              className="group cursor-pointer min-h-[160px] flex flex-col justify-between hover:scale-[1.02] transition-transform duration-300"
              transparency="glass"
              onClick={() => router.push(`/documents/${doc.id}`)}
              style={{ animationDelay: `${i * 50}ms` }}
            >
              <div className="flex items-start justify-between">
                <div className="bg-gradient-to-br from-violet-500/10 to-transparent p-3 rounded-xl border border-violet-500/20 shadow-inner group-hover:border-cyan-500/30 transition-colors">
                  <File className="h-6 w-6 text-violet-400 group-hover:text-cyan-400 transition-colors" />
                </div>
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-8 w-8 text-white/20 opacity-0 group-hover:opacity-100 hover:text-red-400 hover:bg-red-500/10 transition-all duration-200"
                  onClick={(e) => handleDelete(doc.id, e)}
                >
                  <Trash2 className="h-4 w-4" />
                </Button>
              </div>

              <div className="space-y-1">
                <h3 className="text-lg font-bold text-foreground/90 truncate group-hover:text-transparent group-hover:bg-clip-text group-hover:bg-gradient-to-r group-hover:from-white group-hover:to-cyan-200 transition-all">
                  {doc.title}
                </h3>
                <div className="flex items-center gap-2 text-[10px] text-muted-foreground font-mono uppercase">
                  <span>ID: {doc.id.slice(0, 4)}...{doc.id.slice(-4)}</span>
                  <span className="w-px h-3 bg-white/10" />
                  <span>{new Date(doc.createdAt).toLocaleDateString("en-US", { month: "short", day: "numeric" })}</span>
                </div>
              </div>
            </AuraCard>
          ))}

          {docs.length === 0 && (
            <div className="col-span-full flex flex-col items-center justify-center py-20 text-center border border-dashed border-white/10 rounded-3xl bg-black/20">
              <div className="bg-gradient-to-br from-violet-500/10 to-purple-500/10 p-6 rounded-full border border-violet-500/20 mb-4 shadow-[0_0_30px_-5px_rgba(139,92,246,0.3)]">
                <FolderOpen className="h-10 w-10 text-violet-400" />
              </div>
              <h3 className="text-lg font-bold text-white font-mono tracking-wide">SECTOR EMPTY</h3>
              <p className="text-muted-foreground mt-1 max-w-sm text-sm">
                No data artifacts found in this sector. Initialize a new file to begin.
              </p>
              <Button
                onClick={handleCreate}
                variant="outline"
                className="mt-6 border-violet-500/50 text-violet-300 hover:bg-violet-500/10 hover:text-white hover:border-violet-400 hover:shadow-[0_0_20px_-5px_purple] transition-all"
              >
                <Plus className="mr-2 h-4 w-4" /> INITIALIZE
              </Button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
