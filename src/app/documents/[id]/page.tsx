"use client";

import { useEffect, useState, useCallback, use } from "react";
import { useRouter } from "next/navigation";
import { ArrowLeft, Save, Sparkles, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useDb } from "@/components/providers/db-provider";
import { documents } from "@/db/schema";
import { eq } from "drizzle-orm";
import { Editor } from "@/components/editor/editor-wrapper";
import { RelatedContext } from "@/components/editor/related-context";
import { DocAnalytics } from "@/components/editor/doc-analytics";
import { ZenMode } from "@/components/editor/zen-mode";
import { cn } from "@/lib/utils";

export default function DocumentEditorPage({ params }: { params: Promise<{ id: string }> }) {
    const { db } = useDb();
    const router = useRouter();

    // Unwrap params
    const [unwrappedParams, setUnwrappedParams] = useState<{ id: string } | null>(null);

    useEffect(() => {
        params.then(setUnwrappedParams);
    }, [params]);

    const [doc, setDoc] = useState<any>(null);
    const [title, setTitle] = useState("");
    const [content, setContent] = useState("");
    const [isSaving, setIsSaving] = useState(false);
    const [lastSaved, setLastSaved] = useState<Date | null>(null);
    const [isZen, setIsZen] = useState(false);

    // Load document
    useEffect(() => {
        if (!db || !unwrappedParams) return;
        const loadDoc = async () => {
            const res = await db.select().from(documents).where(eq(documents.id, unwrappedParams.id));
            if (res.length > 0) {
                setDoc(res[0]);
                setTitle(res[0].title);
                if (res[0].content) {
                    setContent(res[0].content);
                } else {
                    setContent("");
                }
            } else {
                router.push("/documents"); // Not found
            }
        };
        loadDoc();
    }, [db, unwrappedParams, router]);

    // Save function
    const saveDoc = useCallback(async (newContent?: string, newTitle?: string) => {
        if (!db || !unwrappedParams) return;
        setIsSaving(true);
        try {
            await db.update(documents)
                .set({
                    title: newTitle ?? title,
                    content: newContent ?? content,
                    // updatedAt: new Date() // Schema doesn't have updatedAt yet, but handy
                })
                .where(eq(documents.id, unwrappedParams.id));
            setLastSaved(new Date());
        } catch (e) {
            console.error("Save failed", e);
        } finally {
            setIsSaving(false);
        }
    }, [db, unwrappedParams, title, content]);

    // Debounced auto-save
    //   useEffect(() => {
    //     const timer = setTimeout(() => {
    //         if (doc && (title !== doc.title || content !== doc.content)) {
    //             saveDoc();
    //         }
    //     }, 2000);
    //     return () => clearTimeout(timer);
    //   }, [title, content, doc, saveDoc]);

    if (!doc) {
        return <div className="flex h-screen items-center justify-center text-muted-foreground">Loading...</div>;
    }

    return (
        <div className={cn("flex flex-col h-screen bg-[#030014] transition-all", isZen && "fixed inset-0 z-50")}>
            {/* Header */}
            <div className="bg-black/40 backdrop-blur-xl border-b border-white/10 p-4 flex items-center justify-between sticky top-0 z-20">
                <div className="flex items-center gap-4 flex-1">
                    <Button variant="ghost" size="icon" onClick={() => router.push("/documents")}>
                        <ArrowLeft className="h-4 w-4" />
                    </Button>
                    <Input
                        value={title}
                        onChange={(e) => {
                            setTitle(e.target.value);
                            // In a real app, debounced save here too
                        }}
                        onBlur={() => saveDoc(undefined, title)}
                        className="text-lg font-semibold border-transparent hover:border-input focus:border-input w-full max-w-md px-2"
                    />
                </div>

                <div className="flex items-center gap-2 text-sm text-muted-foreground">
                    {isSaving ? (
                        <span className="flex items-center gap-1"><Loader2 className="h-3 w-3 animate-spin" /> Saving...</span>
                    ) : lastSaved ? (
                        <span>Saved {lastSaved.toLocaleTimeString()}</span>
                    ) : null}
                    <Button variant="default" size="sm" onClick={() => saveDoc()} disabled={isSaving}>
                        <Save className="h-4 w-4 mr-2" />
                        Save
                    </Button>
                    <ZenMode isActive={isZen} onToggle={() => setIsZen(v => !v)} />
                </div>
            </div>

            {/* Editor Area with Sidebar */}
            <div className="flex-1 overflow-hidden flex flex-col">
                {/* Analytics Bar - hidden in zen mode */}
                {!isZen && (
                    <div className="px-8 pt-4">
                        <DocAnalytics content={content} />
                    </div>
                )}

                <div className="flex-1 overflow-hidden flex">
                    <div className="flex-1 overflow-auto p-8">
                        <Editor
                            content={content}
                            onChange={(html) => {
                                setContent(html);
                                // Debounced save could go here
                            }}
                        />
                    </div>

                    {/* Related Context Sidebar - Hidden on mobile and in zen mode */}
                    {!isZen && (
                        <div className="hidden lg:block h-full border-l">
                            <RelatedContext editorContent={content} />
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
}
