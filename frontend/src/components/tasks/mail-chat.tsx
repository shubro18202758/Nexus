"use client";

// ===================================================================
// MailChat — Conversational Q&A over filtered emails
//
// Pipeline:
// 1. Student asks a NL question
// 2. Question is embedded via RAG worker
// 3. Semantic search over mail vector index → top chunks
// 4. Top chunks + question → LLM generates answer with citations
// 5. Answer displayed with clickable mail references
//
// Uses the Three-Body routing:
//   - Fast queries → Groq Alpha (8B instant)
//   - Complex/deep → Groq Beta (70B versatile)
// ===================================================================

import { useState, useRef, useEffect, useCallback } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
    MessageCircle, Send, Loader2, Mail, Brain, Sparkles,
    AlertCircle, Trash2, ChevronRight, Database, Zap
} from "lucide-react";
import { useMailStore } from "@/hooks/use-mail-store";
import {
    mailIndex, chunkMailText, type MailSearchResult
} from "@/lib/mail/mail-knowledge";
import { cn } from "@/lib/utils";

interface ChatMessage {
    id: string;
    role: "user" | "assistant" | "system";
    content: string;
    citations?: { uid: number; subject: string; from: string; snippet: string }[];
    timestamp: number;
}

export function MailChat() {
    const { mails, filteredMails, filters } = useMailStore();
    const [messages, setMessages] = useState<ChatMessage[]>([]);
    const [input, setInput] = useState("");
    const [isThinking, setIsThinking] = useState(false);
    const [isIndexing, setIsIndexing] = useState(false);
    const [indexedCount, setIndexedCount] = useState(0);
    const scrollRef = useRef<HTMLDivElement>(null);
    const workerRef = useRef<Worker | null>(null);
    const pendingEmbeddingsRef = useRef<Map<string, (emb: number[]) => void>>(new Map());

    const activeMails = filters.nlPrompt ? filteredMails : mails;

    // Initialize RAG worker
    useEffect(() => {
        if (typeof window === "undefined") return;
        const worker = new Worker(new URL("@/workers/rag.worker.ts", import.meta.url), { type: "module" });

        worker.onmessage = (event) => {
            const { type, payload } = event.data;

            if (type === "INDEX_GENERATED") {
                const { id, embedding } = payload;
                const resolver = pendingEmbeddingsRef.current.get(id);
                if (resolver) {
                    resolver(embedding);
                    pendingEmbeddingsRef.current.delete(id);
                }
            } else if (type === "SEARCH_GENERATED") {
                const { searchId, embedding } = payload;
                const resolver = pendingEmbeddingsRef.current.get(searchId);
                if (resolver) {
                    resolver(embedding);
                    pendingEmbeddingsRef.current.delete(searchId);
                }
            }
        };

        workerRef.current = worker;
        return () => worker.terminate();
    }, []);

    // Embed a single text and return the embedding
    const embedText = useCallback((id: string, text: string): Promise<number[]> => {
        return new Promise((resolve) => {
            pendingEmbeddingsRef.current.set(id, resolve);
            workerRef.current?.postMessage({ type: "INDEX", payload: { id, text } });
        });
    }, []);

    const embedQuery = useCallback((query: string): Promise<number[]> => {
        const searchId = `search-${Date.now()}`;
        return new Promise((resolve) => {
            pendingEmbeddingsRef.current.set(searchId, resolve);
            workerRef.current?.postMessage({ type: "SEARCH", payload: { query, searchId } });
        });
    }, []);

    // Build/rebuild index when mails change
    const buildIndex = useCallback(async () => {
        if (!workerRef.current || activeMails.length === 0) return;

        const alreadyIndexed = mailIndex.indexedMailUids;
        const toIndex = activeMails.filter(m => !alreadyIndexed.has(m.uid));

        if (toIndex.length === 0) {
            setIndexedCount(mailIndex.size);
            return;
        }

        setIsIndexing(true);
        setIndexedCount(0);

        // Chunk all mails
        const allChunks = toIndex.flatMap(m =>
            chunkMailText(
                m.uid,
                m.subject,
                `${m.from.name} <${m.from.address}>`,
                m.date,
                m.body
            )
        );

        // Embed chunks sequentially (worker is single-threaded)
        let done = 0;
        for (const chunk of allChunks) {
            const embedding = await embedText(chunk.id, chunk.text);
            chunk.embedding = embedding;
            done++;
            if (done % 5 === 0) setIndexedCount(done);
        }

        mailIndex.addChunks(allChunks);
        setIndexedCount(mailIndex.size);
        setIsIndexing(false);
    }, [activeMails, embedText]);

    // Auto-build on mail change
    useEffect(() => {
        buildIndex();
    }, [activeMails.length]);

    // Auto-scroll
    useEffect(() => {
        scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: "smooth" });
    }, [messages]);

    // Ask a question
    const askQuestion = async () => {
        if (!input.trim() || isThinking) return;

        const question = input.trim();
        setInput("");

        const userMsg: ChatMessage = {
            id: `user-${Date.now()}`,
            role: "user",
            content: question,
            timestamp: Date.now(),
        };
        setMessages(prev => [...prev, userMsg]);
        setIsThinking(true);

        try {
            // 1. Embed the query
            const queryEmbedding = await embedQuery(question);

            // 2. Search the mail index
            const results = mailIndex.search(queryEmbedding, 6);

            // 3. Build context from top results
            const context = results
                .filter(r => r.similarity > 0.25)
                .map((r, i) => (
                    `[Source ${i + 1}] From: ${r.chunk.from} | Subject: ${r.chunk.subject} | Date: ${r.chunk.date}\n${r.chunk.text}`
                ))
                .join("\n\n---\n\n");

            // 4. Generate answer via LLM
            const systemPrompt = `You are an intelligent mail assistant for a university student. Answer questions based ONLY on the email content provided below. Be specific, cite which email you're referencing, and be helpful.

If the answer isn't in the provided emails, say so honestly. Never fabricate information.

EMAILS CONTEXT:
${context || "(No relevant emails found in the index)"}`;

            const res = await fetch("/api/llm/chat", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    provider: results.length > 3 ? "groq_beta" : "groq_alpha",
                    temperature: 0.3,
                    max_tokens: 1500,
                    messages: [
                        { role: "system", content: systemPrompt },
                        ...messages.slice(-6).map(m => ({ role: m.role, content: m.content })),
                        { role: "user", content: question },
                    ],
                }),
            });

            const data = await res.json();
            const answer = data.content || "I couldn't generate an answer. Please try rephrasing your question.";

            // Build citations from search results
            const citations = results
                .filter(r => r.similarity > 0.25)
                .map(r => ({
                    uid: r.chunk.uid,
                    subject: r.chunk.subject,
                    from: r.chunk.from,
                    snippet: r.chunk.text.substring(0, 80),
                }))
                // Deduplicate by uid
                .filter((c, i, arr) => arr.findIndex(x => x.uid === c.uid) === i);

            const assistantMsg: ChatMessage = {
                id: `asst-${Date.now()}`,
                role: "assistant",
                content: answer,
                citations,
                timestamp: Date.now(),
            };

            setMessages(prev => [...prev, assistantMsg]);
        } catch (err) {
            console.error("[MAIL CHAT]", err);
            setMessages(prev => [...prev, {
                id: `err-${Date.now()}`,
                role: "assistant",
                content: "Sorry, I encountered an error processing your question. Please try again.",
                timestamp: Date.now(),
            }]);
        } finally {
            setIsThinking(false);
        }
    };

    return (
        <div className="flex flex-col h-full">
            {/* Header */}
            <div className="flex items-center justify-between p-3 border-b border-white/[0.06]">
                <div className="flex items-center gap-2">
                    <div className="p-1.5 rounded-lg bg-gradient-to-br from-cyan-500/20 to-violet-500/20 border border-cyan-500/20">
                        <MessageCircle className="h-4 w-4 text-cyan-400" />
                    </div>
                    <div>
                        <h3 className="text-xs font-bold font-mono text-white/80">Mail Intelligence Chat</h3>
                        <div className="flex items-center gap-2">
                            <span className="text-[8px] font-mono text-white/25">
                                {isIndexing ? (
                                    <span className="text-amber-400/60 flex items-center gap-1">
                                        <Loader2 className="h-2 w-2 animate-spin" /> Indexing... {indexedCount} chunks
                                    </span>
                                ) : (
                                    <span className="text-emerald-400/50 flex items-center gap-1">
                                        <Database className="h-2 w-2" /> {indexedCount} chunks indexed · {activeMails.length} emails
                                    </span>
                                )}
                            </span>
                        </div>
                    </div>
                </div>

                <div className="flex items-center gap-1">
                    {!isIndexing && mailIndex.size === 0 && activeMails.length > 0 && (
                        <button
                            onClick={buildIndex}
                            className="flex items-center gap-1 px-2 py-1 rounded-lg text-[8px] font-mono font-bold bg-cyan-500/10 border border-cyan-500/20 text-cyan-300 hover:bg-cyan-500/20 transition-all"
                        >
                            <Zap className="h-2.5 w-2.5" /> BUILD INDEX
                        </button>
                    )}
                    {messages.length > 0 && (
                        <button
                            onClick={() => setMessages([])}
                            className="p-1.5 rounded-lg text-white/20 hover:text-red-400 hover:bg-red-500/10 transition-all"
                        >
                            <Trash2 className="h-3.5 w-3.5" />
                        </button>
                    )}
                </div>
            </div>

            {/* Messages */}
            <div ref={scrollRef} className="flex-1 overflow-y-auto p-3 space-y-3 custom-scrollbar">
                {messages.length === 0 && (
                    <div className="flex flex-col items-center justify-center h-full text-center py-12">
                        <div className="p-4 rounded-2xl bg-gradient-to-br from-cyan-500/10 to-violet-500/10 border border-cyan-500/15 mb-4">
                            <Brain className="h-8 w-8 text-cyan-400/60" />
                        </div>
                        <h4 className="text-sm font-bold font-mono text-white/40 mb-1">Ask About Your Emails</h4>
                        <p className="text-[10px] font-mono text-white/20 max-w-[280px]">
                            Your {activeMails.length} emails are indexed as a knowledge base.
                            Ask any question about their content.
                        </p>
                        <div className="flex flex-col gap-1.5 mt-4">
                            {[
                                "What deadlines are coming up?",
                                "Who emailed me about the project?",
                                "Summarise important action items",
                            ].map(q => (
                                <button
                                    key={q}
                                    onClick={() => { setInput(q); }}
                                    className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-white/[0.03] border border-white/[0.06] text-[9px] font-mono text-white/30 hover:text-white/60 hover:bg-white/[0.06] transition-all text-left"
                                >
                                    <ChevronRight className="h-2.5 w-2.5 text-cyan-400/50" />
                                    {q}
                                </button>
                            ))}
                        </div>
                    </div>
                )}

                {messages.map(msg => (
                    <motion.div
                        key={msg.id}
                        initial={{ opacity: 0, y: 6 }}
                        animate={{ opacity: 1, y: 0 }}
                        className={cn(
                            "flex",
                            msg.role === "user" ? "justify-end" : "justify-start"
                        )}
                    >
                        <div className={cn(
                            "max-w-[85%] rounded-xl p-3",
                            msg.role === "user"
                                ? "bg-violet-500/20 border border-violet-500/25 text-white/85"
                                : "bg-black/40 border border-white/[0.06] text-white/70"
                        )}>
                            {msg.role === "assistant" && (
                                <div className="flex items-center gap-1 mb-1.5">
                                    <Sparkles className="h-2.5 w-2.5 text-cyan-400" />
                                    <span className="text-[7px] font-mono text-cyan-400/50 uppercase tracking-widest font-bold">Nanobot</span>
                                </div>
                            )}

                            <p className="text-[11px] font-mono leading-relaxed whitespace-pre-wrap">
                                {msg.content}
                            </p>

                            {/* Citations */}
                            {msg.citations && msg.citations.length > 0 && (
                                <div className="mt-2 pt-2 border-t border-white/[0.06] space-y-1">
                                    <span className="text-[7px] font-mono text-white/20 uppercase tracking-widest">Sources</span>
                                    {msg.citations.map((c, i) => (
                                        <div key={c.uid} className="flex items-start gap-1.5 p-1.5 rounded-lg bg-white/[0.03] border border-white/[0.04]">
                                            <Mail className="h-2.5 w-2.5 text-violet-400/50 shrink-0 mt-0.5" />
                                            <div className="min-w-0">
                                                <span className="text-[9px] font-mono text-white/50 font-bold block truncate">{c.subject}</span>
                                                <span className="text-[8px] font-mono text-white/20">{c.from}</span>
                                            </div>
                                        </div>
                                    ))}
                                </div>
                            )}
                        </div>
                    </motion.div>
                ))}

                {/* Thinking indicator */}
                {isThinking && (
                    <motion.div
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 1 }}
                        className="flex items-center gap-2 p-3"
                    >
                        <div className="flex items-center gap-1.5 px-3 py-2 rounded-xl bg-black/40 border border-cyan-500/15">
                            <Loader2 className="h-3 w-3 text-cyan-400 animate-spin" />
                            <span className="text-[9px] font-mono text-cyan-300/50">Searching mails & generating answer...</span>
                        </div>
                    </motion.div>
                )}
            </div>

            {/* Input */}
            <div className="p-3 border-t border-white/[0.06]">
                <div className="flex gap-2">
                    <input
                        type="text"
                        value={input}
                        onChange={e => setInput(e.target.value)}
                        onKeyDown={e => {
                            if (e.key === "Enter" && !e.shiftKey) {
                                e.preventDefault();
                                askQuestion();
                            }
                        }}
                        placeholder="Ask about your emails..."
                        className="flex-1 px-3 py-2.5 bg-black/40 border border-white/[0.08] rounded-xl text-[11px] font-mono text-white placeholder:text-white/15 focus:border-cyan-500/30 focus:outline-none transition-colors"
                        disabled={isThinking}
                    />
                    <button
                        onClick={askQuestion}
                        disabled={isThinking || !input.trim()}
                        className={cn(
                            "px-3 py-2.5 rounded-xl text-xs font-mono font-bold transition-all border",
                            input.trim()
                                ? "bg-gradient-to-r from-cyan-500/20 to-violet-500/20 border-cyan-500/25 text-cyan-300 hover:from-cyan-500/30 hover:to-violet-500/30"
                                : "bg-white/[0.02] border-white/[0.06] text-white/15"
                        )}
                    >
                        <Send className="h-4 w-4" />
                    </button>
                </div>
            </div>
        </div>
    );
}
