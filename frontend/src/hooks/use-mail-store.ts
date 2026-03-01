"use client";

// ===================================================================
// useMailStore — Zustand store for Mail Intelligence
// Manages credentials, mail fetching, NL+structural filtering,
// LLM summarisation, and prepares for Phase 3 Q&A.
// Credentials persisted to localStorage (base64 encoded).
// ===================================================================

import { create } from "zustand";
import {
    classifyMailsWithNL,
    type FilterIntent,
    type FilterResult,
    type StudentLifeCategory,
} from "@/lib/mail/mail-filter-engine";
import { summariseMails, type MailSummary } from "@/lib/mail/mail-summariser";

// ── Types ──
export interface MailCredentials {
    host: string;
    port: number;
    email: string;
    password: string;
}

export interface MailItem {
    uid: number;
    messageId: string;
    from: { name: string; address: string };
    to: { name: string; address: string }[];
    subject: string;
    date: string;
    snippet: string;
    body: string;
    htmlBody?: string;
    images?: string[];
    folder: string;
    flags: string[];
    hasAttachments: boolean;
    // Phase 2 — LLM enrichment
    summary?: MailSummary;
    nlRelevant?: boolean;
    nlReason?: string;
    // Phase 2.5 — Three-Body Nanobot enrichment
    nlCategory?: StudentLifeCategory;
    nlExtractedDate?: string | null;
    nlUrgencyScore?: number;
}

export interface MailFolder {
    path: string;
    name: string;
    specialUse: string | null;
}

export type DateRange = "1d" | "3d" | "1w" | "2w" | "1m";

export interface MailFilters {
    nlPrompt: string;         // Natural language filter prompt
    senders: string[];        // Whitelist senders
    keywords: string[];       // Keyword filters
    unreadOnly: boolean;
    hasAttachments: boolean;
}

interface MailStore {
    // Connection
    credentials: MailCredentials | null;
    isConnected: boolean;
    folders: MailFolder[];

    // Mail data
    mails: MailItem[];
    filteredMails: MailItem[];
    // Selected for actions (UIDs)
    selectedMails: number[];
    isLoading: boolean;
    error: string | null;

    // Filters
    dateRange: DateRange;
    activeFolder: string;
    filters: MailFilters;

    // Phase 2 — LLM state
    isSummarising: boolean;
    isClassifying: boolean;
    summariseProgress: { done: number; total: number };
    filterIntent: FilterIntent | null;
    isParsingIntent: boolean;
    /** Internal: cancellation signal for in-flight summariser */
    _summariseCancelSignal: { cancelled: boolean } | null;

    // Actions
    setCredentials: (creds: MailCredentials) => void;
    connect: () => Promise<boolean>;
    disconnect: () => void;
    fetchMails: () => Promise<void>;
    setDateRange: (range: DateRange) => void;
    setActiveFolder: (folder: string) => void;
    setFilters: (filters: Partial<MailFilters>) => void;
    applyFilters: () => void;
    // Selection
    toggleMailSelection: (uid: number) => void;
    selectAllMails: () => void;
    clearMailSelection: () => void;
    // Phase 2 actions
    applyNLFilter: (prompt: string) => Promise<void>;
    summariseAll: () => Promise<void>;
    summariseSelected: () => Promise<void>;
}

// ── Helpers ──
const STORAGE_KEY = "nexus-mail-creds";

function saveCreds(creds: MailCredentials) {
    if (typeof window !== "undefined") {
        localStorage.setItem(STORAGE_KEY, btoa(JSON.stringify(creds)));
    }
}

function loadCreds(): MailCredentials | null {
    if (typeof window === "undefined") return null;
    try {
        const raw = localStorage.getItem(STORAGE_KEY);
        if (!raw) return null;
        return JSON.parse(atob(raw));
    } catch { return null; }
}

function dateRangeToSince(range: DateRange): string {
    const now = new Date();
    const ms: Record<DateRange, number> = {
        "1d": 86400000,
        "3d": 259200000,
        "1w": 604800000,
        "2w": 1209600000,
        "1m": 2592000000,
    };
    return new Date(now.getTime() - ms[range]).toISOString();
}

function applyLocalFilters(mails: MailItem[], filters: MailFilters): MailItem[] {
    let result = [...mails];

    // NL filter (applied by LLM — uses nlRelevant flag)
    if (filters.nlPrompt.trim()) {
        result = result.filter(m => m.nlRelevant !== false);
    }

    if (filters.unreadOnly) {
        result = result.filter(m => !m.flags.includes("\\Seen"));
    }

    if (filters.hasAttachments) {
        result = result.filter(m => m.hasAttachments);
    }

    if (filters.senders.length > 0) {
        const lower = filters.senders.map(s => s.toLowerCase());
        result = result.filter(m =>
            lower.some(s =>
                m.from.address.toLowerCase().includes(s) ||
                m.from.name.toLowerCase().includes(s)
            )
        );
    }

    if (filters.keywords.length > 0) {
        const lower = filters.keywords.map(k => k.toLowerCase());
        result = result.filter(m =>
            lower.some(k =>
                m.subject.toLowerCase().includes(k) ||
                m.snippet.toLowerCase().includes(k)
            )
        );
    }

    return result;
}

// ── Store ──
export const useMailStore = create<MailStore>((set, get) => ({
    credentials: loadCreds(),
    isConnected: false,
    folders: [],
    mails: [],
    filteredMails: [],
    selectedMails: [],
    isLoading: false,
    error: null,
    dateRange: "1w",
    activeFolder: "INBOX",
    filters: {
        nlPrompt: "",
        senders: [],
        keywords: [],
        unreadOnly: false,
        hasAttachments: false,
    },
    isSummarising: false,
    isClassifying: false,
    summariseProgress: { done: 0, total: 0 },
    filterIntent: null,
    isParsingIntent: false,
    _summariseCancelSignal: null,

    setCredentials: (creds) => {
        saveCreds(creds);
        set({ credentials: creds, isConnected: false, error: null });
    },

    connect: async () => {
        const { credentials } = get();
        if (!credentials) {
            set({ error: "No credentials configured" });
            return false;
        }

        set({ isLoading: true, error: null });

        try {
            const res = await fetch("/api/mail/connect", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify(credentials),
            });

            const data = await res.json();

            if (!res.ok || !data.success) {
                set({ error: data.error || "Connection failed", isLoading: false });
                return false;
            }

            set({
                isConnected: true,
                folders: data.folders,
                isLoading: false,
                error: null,
            });
            return true;
        } catch (err: any) {
            set({ error: err.message || "Connection failed", isLoading: false });
            return false;
        }
    },

    disconnect: () => {
        if (typeof window !== "undefined") {
            localStorage.removeItem(STORAGE_KEY);
        }
        set({
            credentials: null,
            isConnected: false,
            folders: [],
            mails: [],
            filteredMails: [],
            selectedMails: [],
            error: null,
        });
    },

    fetchMails: async () => {
        const { credentials, activeFolder, dateRange } = get();
        if (!credentials) {
            set({ error: "Not connected" });
            return;
        }

        set({ isLoading: true, error: null });

        try {
            const res = await fetch("/api/mail/fetch", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    ...credentials,
                    folder: activeFolder,
                    since: dateRangeToSince(dateRange),
                    limit: 100,
                }),
                signal: AbortSignal.timeout(60000),
            });

            const data = await res.json();

            if (!res.ok) {
                set({ error: data.error || "Fetch failed", isLoading: false });
                return;
            }

            const mails = data.mails as MailItem[];
            set({ mails, isLoading: false });

            // Apply filters immediately
            get().applyFilters();
        } catch (err: any) {
            set({ error: err.message || "Fetch failed", isLoading: false });
        }
    },

    setDateRange: (range) => {
        set({ dateRange: range });
        get().fetchMails();
    },

    setActiveFolder: (folder) => {
        set({ activeFolder: folder });
        get().fetchMails();
    },

    setFilters: (partial) => {
        set(state => ({
            filters: { ...state.filters, ...partial },
        }));
        get().applyFilters();
    },

    applyFilters: () => {
        const { mails, filters } = get();
        const filtered = applyLocalFilters(mails, filters);
        set({ filteredMails: filtered, selectedMails: [] }); // Clear selection on filter change
    },

    // ── Selection ──
    toggleMailSelection: (uid: number) => {
        const { selectedMails } = get();
        if (selectedMails.includes(uid)) {
            set({ selectedMails: selectedMails.filter(id => id !== uid) });
        } else {
            set({ selectedMails: [...selectedMails, uid] });
        }
    },

    selectAllMails: () => {
        const { filteredMails, mails } = get();
        const target = filteredMails.length > 0 ? filteredMails : mails;
        set({ selectedMails: target.map(m => m.uid) });
    },

    clearMailSelection: () => {
        set({ selectedMails: [] });
    },

    // ── Phase 2: NL Filter (Two-Pass Architecture) ──
    applyNLFilter: async (prompt: string) => {
        const { mails, _summariseCancelSignal } = get();

        // Cancel any in-flight summariser to free up Ollama for filter
        if (_summariseCancelSignal) {
            console.log("[NL FILTER] Cancelling in-flight summariser to prioritise filter");
            _summariseCancelSignal.cancelled = true;
        }

        set(state => ({
            filters: { ...state.filters, nlPrompt: prompt },
            isClassifying: true,
            isParsingIntent: true,
            filterIntent: null,
        }));

        if (!prompt.trim()) {
            // Clear NL filter — reset all NL enrichment flags
            const reset = mails.map(m => ({
                ...m,
                nlRelevant: undefined,
                nlReason: undefined,
                nlCategory: undefined,
                nlExtractedDate: undefined,
                nlUrgencyScore: undefined,
            }));
            set({ mails: reset, isClassifying: false, isParsingIntent: false, filterIntent: null });
            get().applyFilters();
            return;
        }

        try {
            const input = mails.map(m => ({
                uid: m.uid,
                from: `${m.from.name} <${m.from.address}>`,
                subject: m.subject,
                snippet: m.snippet,
            }));

            // Three-pass: intent extraction → classification → enrichment
            const { results, intent } = await classifyMailsWithNL(
                input,
                prompt,
                // Progress callback — streams batch results to UI
                (done, total, partialResults) => {
                    if (partialResults) {
                        const currentMails = get().mails;
                        const updated = currentMails.map(m => {
                            const r = partialResults.find(pr => pr.uid === m.uid);
                            return r ? {
                                ...m,
                                nlRelevant: r.relevant,
                                nlReason: r.reason,
                                nlCategory: r.category,
                                nlExtractedDate: r.extractedDate,
                                nlUrgencyScore: r.urgencyScore,
                            } : m;
                        });
                        set({ mails: updated });
                        get().applyFilters();
                    }
                },
                // Intent parsed callback — fires after Pass 1 completes
                (parsedIntent) => {
                    set({ filterIntent: parsedIntent, isParsingIntent: false });
                },
            );

            // Final merge — ensure all results are applied
            const currentMails = get().mails;
            const finalMails = currentMails.map(m => {
                const r = results.find(pr => pr.uid === m.uid);
                return r ? {
                    ...m,
                    nlRelevant: r.relevant,
                    nlReason: r.reason,
                    nlCategory: r.category,
                    nlExtractedDate: r.extractedDate,
                    nlUrgencyScore: r.urgencyScore,
                } : m;
            });
            set({ mails: finalMails, isClassifying: false, filterIntent: intent });
            get().applyFilters();
        } catch (err) {
            console.error("[NL FILTER]", err);
            set({ isClassifying: false, isParsingIntent: false });
        }
    },

    // ── Phase 2: Batch Summarise ──
    summariseAll: async () => {
        const { filteredMails, mails } = get();
        const target = filteredMails.length > 0 ? filteredMails : mails;
        const unsummarised = target.filter(m => !m.summary);

        if (unsummarised.length === 0) return;

        set({ isSummarising: true, summariseProgress: { done: 0, total: unsummarised.length } });

        // Create cancellation signal — NL filter can cancel us between batches
        const cancelSignal = { cancelled: false };
        set({ _summariseCancelSignal: cancelSignal });

        try {
            const input = unsummarised.map(m => ({
                uid: m.uid,
                from: `${m.from.name} <${m.from.address}>`,
                subject: m.subject,
                body: m.body,
                date: m.date,
            }));

            const summaries = await summariseMails(input, (done, total, partialResults) => {
                set({ summariseProgress: { done, total } });
                // Progressive merge — apply batch results immediately for live UI updates
                if (partialResults && partialResults.length > 0) {
                    const currentMails = get().mails;
                    const updated = currentMails.map(m => {
                        const s = partialResults.find(s => s.uid === m.uid);
                        return s ? { ...m, summary: s } : m;
                    });
                    set({ mails: updated });
                    get().applyFilters();
                }
            }, cancelSignal);

            // Final merge — ensure all summaries are applied
            const currentMails = get().mails;
            const updated = currentMails.map(m => {
                const s = summaries.find(s => s.uid === m.uid);
                return s ? { ...m, summary: s } : m;
            });

            set({ mails: updated, isSummarising: false, _summariseCancelSignal: null });
            get().applyFilters();
        } catch (err) {
            console.error("[SUMMARISE]", err);
            set({ isSummarising: false, _summariseCancelSignal: null });
        }
    },

    summariseSelected: async () => {
        const { mails, selectedMails } = get();
        if (selectedMails.length === 0) return;

        const toSummarise = mails.filter(m => selectedMails.includes(m.uid) && !m.summary);
        if (toSummarise.length === 0) {
            // All selected are already summarised
            set({ selectedMails: [] });
            return;
        }

        set({ isSummarising: true, summariseProgress: { done: 0, total: toSummarise.length } });

        // Create cancellation signal — NL filter can cancel us between batches
        const cancelSignal = { cancelled: false };
        set({ _summariseCancelSignal: cancelSignal });

        try {
            const input = toSummarise.map(m => ({
                uid: m.uid,
                from: `${m.from.name} <${m.from.address}>`,
                subject: m.subject,
                body: m.body,
                date: m.date,
            }));

            const summaries = await summariseMails(input, (done, total, partialResults) => {
                set({ summariseProgress: { done, total } });
                // Progressive merge — apply batch results immediately for live UI updates
                if (partialResults && partialResults.length > 0) {
                    const currentMails = get().mails;
                    const updated = currentMails.map(m => {
                        const s = partialResults.find(s => s.uid === m.uid);
                        return s ? { ...m, summary: s } : m;
                    });
                    set({ mails: updated });
                    get().applyFilters();
                }
            }, cancelSignal);

            // Final merge — ensure all summaries are applied
            const currentMails = get().mails;
            const updated = currentMails.map(m => {
                const s = summaries.find(s => s.uid === m.uid);
                return s ? { ...m, summary: s } : m;
            });

            set({ mails: updated, isSummarising: false, selectedMails: [], _summariseCancelSignal: null });
            get().applyFilters();
        } catch (err) {
            console.error("[SUMMARISE SELECTED]", err);
            set({ isSummarising: false, _summariseCancelSignal: null });
        }
    },
}));
