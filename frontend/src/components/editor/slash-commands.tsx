"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import { createPortal } from "react-dom";
import {
    Sparkles, FileText, Expand, SpellCheck,
    Languages, HelpCircle, Loader2, Wand2
} from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";

interface SlashCommand {
    name: string;
    label: string;
    description: string;
    icon: React.ElementType;
    prompt: (text: string) => string;
}

const COMMANDS: SlashCommand[] = [
    {
        name: "summarize",
        label: "/summarize",
        description: "Summarize the selected text",
        icon: FileText,
        prompt: (text) => `Summarize the following text concisely:\n\n${text}`,
    },
    {
        name: "expand",
        label: "/expand",
        description: "Expand and elaborate on the text",
        icon: Expand,
        prompt: (text) => `Expand and elaborate on the following text with more detail:\n\n${text}`,
    },
    {
        name: "fix",
        label: "/fix",
        description: "Fix grammar and spelling",
        icon: SpellCheck,
        prompt: (text) => `Fix all grammar and spelling errors in the following text. Return only the corrected text:\n\n${text}`,
    },
    {
        name: "translate",
        label: "/translate",
        description: "Translate to English",
        icon: Languages,
        prompt: (text) => `Translate the following text to English. Return only the translation:\n\n${text}`,
    },
    {
        name: "explain",
        label: "/explain",
        description: "Explain like I'm 5",
        icon: HelpCircle,
        prompt: (text) => `Explain the following text in simple terms, as if explaining to a 5-year-old:\n\n${text}`,
    },
];

interface SlashMenuProps {
    editor: any; // Tiptap editor instance
}

export function SlashMenu({ editor }: SlashMenuProps) {
    const [isOpen, setIsOpen] = useState(false);
    const [query, setQuery] = useState("");
    const [position, setPosition] = useState({ top: 0, left: 0 });
    const [isProcessing, setIsProcessing] = useState(false);
    const [activeCommand, setActiveCommand] = useState<string | null>(null);
    const [selectedIndex, setSelectedIndex] = useState(0);
    const menuRef = useRef<HTMLDivElement>(null);

    const filteredCommands = COMMANDS.filter((cmd) =>
        cmd.label.includes(query.toLowerCase()) || cmd.name.includes(query.toLowerCase())
    );

    // Listen for "/" keystroke in the editor
    useEffect(() => {
        if (!editor) return;

        const handleKeyDown = (event: KeyboardEvent) => {
            if (event.key === "/" && !isOpen && !isProcessing) {
                const { state } = editor;
                const { from } = state.selection;
                const textBefore = state.doc.textBetween(Math.max(0, from - 1), from);

                // Only trigger at the start of a line or after whitespace
                if (from === 1 || textBefore === "\n" || textBefore === " " || textBefore === "") {
                    // Get cursor position for the menu
                    const coords = editor.view.coordsAtPos(from);
                    setPosition({ top: coords.bottom + 5, left: coords.left });
                    setIsOpen(true);
                    setQuery("/");
                    setSelectedIndex(0);
                }
            } else if (isOpen) {
                if (event.key === "Escape") {
                    setIsOpen(false);
                    setQuery("");
                } else if (event.key === "ArrowDown") {
                    event.preventDefault();
                    setSelectedIndex((i) => Math.min(i + 1, filteredCommands.length - 1));
                } else if (event.key === "ArrowUp") {
                    event.preventDefault();
                    setSelectedIndex((i) => Math.max(i - 1, 0));
                } else if (event.key === "Enter" && filteredCommands[selectedIndex]) {
                    event.preventDefault();
                    executeCommand(filteredCommands[selectedIndex]);
                } else if (event.key === "Backspace") {
                    if (query.length <= 1) {
                        setIsOpen(false);
                        setQuery("");
                    } else {
                        setQuery((q) => q.slice(0, -1));
                    }
                } else if (event.key.length === 1) {
                    setQuery((q) => q + event.key);
                    setSelectedIndex(0);
                }
            }
        };

        const editorDom = editor.view.dom;
        editorDom.addEventListener("keydown", handleKeyDown);
        return () => editorDom.removeEventListener("keydown", handleKeyDown);
    }, [editor, isOpen, query, selectedIndex, filteredCommands, isProcessing]);

    // Close menu on click outside
    useEffect(() => {
        if (!isOpen) return;
        const handleClickOutside = (e: MouseEvent) => {
            if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
                setIsOpen(false);
                setQuery("");
            }
        };
        document.addEventListener("mousedown", handleClickOutside);
        return () => document.removeEventListener("mousedown", handleClickOutside);
    }, [isOpen]);

    const executeCommand = async (cmd: SlashCommand) => {
        setIsOpen(false);
        setQuery("");
        setIsProcessing(true);
        setActiveCommand(cmd.name);

        try {
            // Delete the slash command text from the editor
            const { state } = editor;
            const { from } = state.selection;
            // Find and delete the "/" and command prefix
            const lineStart = state.doc.resolve(from).start();
            editor.chain().focus().deleteRange({ from: lineStart, to: from }).run();

            // Get selected text or current paragraph
            const { selection } = editor.state;
            let selectedText = "";

            if (!selection.empty) {
                selectedText = editor.state.doc.textBetween(selection.from, selection.to);
            } else {
                // Get current paragraph text
                const node = selection.$head.parent;
                selectedText = node.textContent;
            }

            if (!selectedText.trim()) {
                selectedText = "Hello, please provide a helpful response.";
            }

            // Call LLM
            const { LLMEngine } = await import("@/lib/ai/llm-engine");
            const engine = LLMEngine.getInstance();

            const result = await engine.chat([
                { role: "system", content: "You are a helpful writing assistant. Be concise and direct. Return only the requested output, no preamble." },
                { role: "user", content: cmd.prompt(selectedText) },
            ]);

            // Insert the result at cursor position
            if (result) {
                editor.chain().focus().insertContent(`<p>${result}</p>`).run();
            }
        } catch (e) {
            console.error("Slash command error:", e);
            editor.chain().focus().insertContent(`<p><em>⚠️ AI command failed. Is the model loaded?</em></p>`).run();
        } finally {
            setIsProcessing(false);
            setActiveCommand(null);
        }
    };

    return (
        <>
            {/* Processing Indicator */}
            <AnimatePresence>
                {isProcessing && (
                    <motion.div
                        initial={{ opacity: 0, y: 5 }}
                        animate={{ opacity: 1, y: 0 }}
                        exit={{ opacity: 0, y: -5 }}
                        className="fixed bottom-6 right-6 z-50 flex items-center gap-2 px-4 py-2.5 rounded-xl bg-purple-500/10 border border-purple-500/20 backdrop-blur-xl shadow-lg shadow-purple-500/10"
                    >
                        <Loader2 className="h-4 w-4 animate-spin text-purple-400" />
                        <span className="text-sm text-purple-300">
                            Running <strong>/{activeCommand}</strong>...
                        </span>
                    </motion.div>
                )}
            </AnimatePresence>

            {/* Slash Menu Popup */}
            <AnimatePresence>
                {isOpen && (
                    <motion.div
                        ref={menuRef}
                        initial={{ opacity: 0, y: -5, scale: 0.95 }}
                        animate={{ opacity: 1, y: 0, scale: 1 }}
                        exit={{ opacity: 0, y: -5, scale: 0.95 }}
                        transition={{ duration: 0.15 }}
                        className="fixed z-50 min-w-[240px] rounded-xl border border-white/10 bg-slate-900/95 backdrop-blur-xl shadow-2xl shadow-black/30 overflow-hidden"
                        style={{ top: position.top, left: position.left }}
                    >
                        <div className="px-3 py-2 border-b border-white/5 flex items-center gap-2">
                            <Wand2 className="h-3.5 w-3.5 text-purple-400" />
                            <span className="text-xs font-medium text-purple-300">AI Commands</span>
                            <span className="text-[10px] text-muted-foreground ml-auto font-mono">{query}</span>
                        </div>

                        <div className="p-1">
                            {filteredCommands.length === 0 ? (
                                <p className="text-xs text-muted-foreground text-center py-3">No matching commands</p>
                            ) : (
                                filteredCommands.map((cmd, i) => (
                                    <button
                                        key={cmd.name}
                                        className={`w-full flex items-center gap-3 px-3 py-2 rounded-lg text-left transition-colors ${i === selectedIndex
                                                ? "bg-purple-500/15 text-purple-200"
                                                : "hover:bg-white/5 text-foreground/80"
                                            }`}
                                        onClick={() => executeCommand(cmd)}
                                        onMouseEnter={() => setSelectedIndex(i)}
                                    >
                                        <cmd.icon className={`h-4 w-4 shrink-0 ${i === selectedIndex ? "text-purple-400" : "text-muted-foreground"}`} />
                                        <div>
                                            <p className="text-sm font-medium">{cmd.label}</p>
                                            <p className="text-[10px] text-muted-foreground">{cmd.description}</p>
                                        </div>
                                    </button>
                                ))
                            )}
                        </div>
                    </motion.div>
                )}
            </AnimatePresence>
        </>
    );
}
