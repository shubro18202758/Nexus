"use client";

import { useState, useRef, useEffect } from "react";
import { Send, Bot, User, Loader2, Sparkles, AlertCircle, Mic, Volume2, VolumeX, MicOff, Zap, Cpu, Wifi, WifiOff } from "lucide-react";
import { cn } from "@/lib/utils";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { useAgent } from "@/hooks/use-agent";
import { useSpeechToText } from "@/hooks/use-speech-to-text";
import { useTextToSpeech } from "@/hooks/use-text-to-speech";

export function ChatInterface() {
    const { messages, isThinking, currentThought, sendMessage, activeEngine, nanobotAvailable, engineStatus } = useAgent();
    const [input, setInput] = useState("");
    const [isVoiceEnabled, setIsVoiceEnabled] = useState(false);
    const scrollRef = useRef<HTMLDivElement>(null);

    // Voice Hooks
    const { isListening, startListening, stopListening, isSupported: isSpeechSupported } = useSpeechToText({
        onResult: (transcript) => {
            setInput(transcript); // Set or append? Setting for now as per typical voice assistant
        }
    });

    const { speak, stop: stopSpeaking, isSpeaking } = useTextToSpeech();

    // Auto-scroll
    useEffect(() => {
        if (scrollRef.current) {
            scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
        }
    }, [messages, isThinking, currentThought]);

    // Constructive Voice Output
    useEffect(() => {
        if (!isVoiceEnabled || messages.length === 0) return;

        const lastMsg = messages[messages.length - 1];
        if (lastMsg.role === "assistant" && !isListening) {
            // Strip markdown symbols for cleaner speech (basic regex)
            const cleanText = lastMsg.content.replace(/[*_#`]/g, "");
            speak(cleanText);
        }
    }, [messages, isVoiceEnabled, speak, isListening]);

    const handleSend = async () => {
        if (!input.trim() || isThinking) return;
        const text = input;
        setInput("");
        stopSpeaking(); // Stop any ongoing speech when user sends
        await sendMessage(text);
    };

    const toggleListening = () => {
        if (isListening) {
            stopListening();
        } else {
            stopSpeaking(); // Don't speak while listening
            startListening();
        }
    };

    return (
        <div className="flex flex-col h-full bg-slate-50/50 dark:bg-slate-950/30 rounded-xl border border-white/10 shadow-sm overflow-hidden backdrop-blur-sm">
            {/* Header */}
            <div className="px-4 py-3 bg-white/50 dark:bg-white/5 border-b border-white/10 flex items-center justify-between gap-2">
                <div className="flex items-center gap-3">
                    <div className="p-1.5 bg-white dark:bg-slate-800 rounded-lg shadow-sm">
                        {nanobotAvailable ? (
                            <Zap className="w-4 h-4 text-amber-500" />
                        ) : (
                            <Sparkles className="w-4 h-4 text-purple-600 dark:text-purple-400" />
                        )}
                    </div>
                    <div>
                        <div className="font-semibold text-sm text-slate-700 dark:text-slate-200 flex items-center gap-2">
                            {nanobotAvailable ? "Nanobot" : "Nexus Agent"}
                            {nanobotAvailable ? (
                                <span className="px-1.5 py-0.5 rounded-full bg-amber-100 dark:bg-amber-900/30 text-amber-700 dark:text-amber-400 text-[10px] font-bold border border-amber-200 dark:border-amber-800 flex items-center gap-1">
                                    <span className="w-1.5 h-1.5 rounded-full bg-amber-500 animate-pulse" />
                                    Neural Engine
                                </span>
                            ) : (
                                <span className="px-1.5 py-0.5 rounded-full bg-emerald-100 dark:bg-emerald-900/30 text-emerald-700 dark:text-emerald-400 text-[10px] font-bold border border-emerald-200 dark:border-emerald-800 flex items-center gap-1">
                                    <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" />
                                    DeepSeek R1
                                </span>
                            )}
                            {engineStatus?.mode === "three-body" && (
                                <span className="px-1.5 py-0.5 rounded-full bg-violet-100 dark:bg-violet-900/30 text-violet-700 dark:text-violet-400 text-[10px] font-bold border border-violet-200 dark:border-violet-800">
                                    THREE-BODY
                                </span>
                            )}
                            {activeEngine === "nanobot" && (
                                <span className="px-1.5 py-0.5 rounded-full bg-cyan-100 dark:bg-cyan-900/30 text-cyan-700 dark:text-cyan-400 text-[10px] font-bold border border-cyan-200 dark:border-cyan-800">
                                    LIVE
                                </span>
                            )}
                        </div>
                        <div className="text-[10px] text-slate-500 dark:text-slate-400 font-medium flex items-center gap-1.5">
                            {nanobotAvailable ? (
                                <>
                                    <Wifi className="w-2.5 h-2.5 text-emerald-500" />
                                    {engineStatus?.mode === "three-body" ? (
                                        <>
                                            CEO: {engineStatus.local_model} + Alpha + Beta • {engineStatus.active_skills?.length ?? 7} Skills
                                        </>
                                    ) : engineStatus?.mode === "ceo-only" ? (
                                        <>
                                            CEO: {engineStatus.local_model} (local only) • {engineStatus.active_skills?.length ?? 7} Skills
                                        </>
                                    ) : (
                                        <>Neural Engine • {engineStatus?.active_skills?.length ?? 7} Skills</>
                                    )}
                                </>
                            ) : (
                                <>
                                    <Cpu className="w-2.5 h-2.5" />
                                    R1-Distill-Qwen3-8B • Local RAG
                                </>
                            )}
                        </div>
                    </div>
                </div>

                <div className="flex items-center gap-1">
                    <button
                        onClick={() => setIsVoiceEnabled(!isVoiceEnabled)}
                        className={cn(
                            "p-1.5 rounded-md transition-colors",
                            isVoiceEnabled ? "text-purple-600 dark:text-purple-400 bg-white dark:bg-purple-900/20 shadow-sm" : "text-slate-400 dark:text-slate-500 hover:text-slate-600 dark:hover:text-slate-300"
                        )}
                        title={isVoiceEnabled ? "Mute Voice" : "Enable Voice Response"}
                    >
                        {isVoiceEnabled ? <Volume2 className="w-4 h-4" /> : <VolumeX className="w-4 h-4" />}
                    </button>
                    {isSpeaking && (
                        <div className="flex gap-0.5 items-center px-2">
                            <span className="w-0.5 h-2 bg-purple-500 animate-[pulse_1s_ease-in-out_infinite]" />
                            <span className="w-0.5 h-3 bg-purple-500 animate-[pulse_1.2s_ease-in-out_infinite]" />
                            <span className="w-0.5 h-2 bg-purple-500 animate-[pulse_0.8s_ease-in-out_infinite]" />
                        </div>
                    )}
                </div>
            </div>

            {/* Messages Area */}
            <div
                ref={scrollRef}
                className="flex-1 overflow-y-auto p-4 space-y-4"
            >
                {messages.length === 0 && (
                    <div className="flex flex-col items-center justify-center h-full text-slate-400 dark:text-slate-500 space-y-2">
                        {nanobotAvailable ? (
                            <Zap className="w-8 h-8 opacity-50 text-amber-500" />
                        ) : (
                            <Bot className="w-8 h-8 opacity-50" />
                        )}
                        <p className="text-sm">
                            {nanobotAvailable
                                ? "Nanobot online — WhatsApp, Calendar, Email, Forms, Research ready."
                                : "Ready to help using RAG & Tools."}
                        </p>
                        {isSpeechSupported && (
                            <p className="text-xs text-slate-300 dark:text-slate-600">Voice Input Supported</p>
                        )}
                    </div>
                )}

                {messages.map((msg, idx) => (
                    <div
                        key={idx}
                        className={cn(
                            "flex w-full gap-3",
                            msg.role === "user" ? "flex-row-reverse" : "flex-row"
                        )}
                    >
                        <div
                            className={cn(
                                "flex items-center justify-center w-8 h-8 rounded-full shrink-0 border",
                                msg.role === "user" ? "bg-blue-600 border-blue-600" : "bg-purple-50 dark:bg-purple-900/20 border-purple-200 dark:border-purple-800"
                            )}
                        >
                            {msg.role === "user" ? (
                                <User className="w-5 h-5 text-white" />
                            ) : (
                                <Bot className="w-5 h-5 text-purple-700 dark:text-purple-300" />
                            )}
                        </div>

                        <div
                            className={cn(
                                "max-w-[80%] rounded-2xl px-4 py-2.5 text-sm shadow-sm",
                                msg.role === "user"
                                    ? "bg-blue-600 text-white rounded-br-none"
                                    : "bg-white dark:bg-slate-800 border dark:border-slate-700/50 rounded-bl-none text-slate-800 dark:text-slate-200"
                            )}
                        >
                            {msg.role === "tool" ? (
                                <div className="font-mono text-xs text-slate-500 dark:text-slate-400 italic border-l-2 border-slate-300 dark:border-slate-600 pl-2">
                                    {msg.content}
                                </div>
                            ) : (
                                <>
                                    <div className="prose prose-sm dark:prose-invert max-w-none break-words">
                                        <ReactMarkdown
                                            remarkPlugins={[remarkGfm] as any}
                                            components={{
                                                p: ({ node, ...props }) => <p className="mb-1 last:mb-0" {...props} />,
                                                code: ({ node, ...props }) => (
                                                    <code className="bg-black/10 dark:bg-white/10 rounded px-1 py-0.5 text-xs font-mono" {...props} />
                                                ),
                                                pre: ({ node, ...props }) => (
                                                    <pre className="bg-slate-900 dark:bg-slate-950 text-slate-50 p-3 rounded-lg overflow-x-auto my-2 border border-white/10" {...props} />
                                                )
                                            }}
                                        >
                                            {msg.content}
                                        </ReactMarkdown>
                                    </div>
                                    {/* Engine badge for assistant messages */}
                                    {msg.role === "assistant" && msg.engine && (
                                        <div className="flex items-center gap-1.5 mt-1.5 pt-1.5 border-t border-slate-100 dark:border-slate-700/30">
                                            <span className={cn(
                                                "px-1.5 py-0.5 rounded text-[9px] font-bold uppercase tracking-wider",
                                                msg.engine.includes("alpha")
                                                    ? "bg-cyan-100 dark:bg-cyan-900/30 text-cyan-600 dark:text-cyan-400"
                                                    : msg.engine.includes("beta")
                                                        ? "bg-blue-100 dark:bg-blue-900/30 text-blue-600 dark:text-blue-400"
                                                        : "bg-emerald-100 dark:bg-emerald-900/30 text-emerald-600 dark:text-emerald-400"
                                            )}>
                                                {msg.engine === "ceo" ? "CEO (Local 8B)"
                                                    : msg.engine === "alpha" ? "Alpha (8B)"
                                                    : msg.engine === "beta" ? "Beta (70B)"
                                                    : msg.engine}
                                            </span>
                                            {msg.duration_ms && (
                                                <span className="text-[9px] text-slate-400 dark:text-slate-500">
                                                    {(msg.duration_ms / 1000).toFixed(1)}s
                                                </span>
                                            )}
                                        </div>
                                    )}
                                </>
                            )}
                        </div>
                    </div>
                ))}

                {/* Thinking Indicator */}
                {isThinking && (
                    <div className="flex w-full gap-3">
                        <div className="flex items-center justify-center w-8 h-8 rounded-full bg-purple-50 dark:bg-purple-900/20 border border-purple-100 dark:border-purple-800 shrink-0">
                            <Loader2 className="w-4 h-4 text-purple-400 animate-spin" />
                        </div>
                        <div className="bg-white dark:bg-slate-800 border dark:border-slate-700/50 text-slate-500 dark:text-slate-400 rounded-2xl rounded-bl-none px-4 py-2.5 text-xs italic shadow-sm flex items-center gap-2">
                            <span>{currentThought || "Thinking..."}</span>
                        </div>
                    </div>
                )}
            </div>

            {/* Input Area */}
            <div className="p-4 bg-white/50 dark:bg-white/5 border-t border-white/10 space-y-2 backdrop-blur-sm">
                {isListening && (
                    <div className="flex items-center gap-2 text-xs text-red-500 font-medium animate-pulse">
                        <Mic className="w-3 h-3" />
                        Listening...
                    </div>
                )}
                <div className="relative flex items-center gap-2">
                    <div className="relative flex-1">
                        <input
                            type="text"
                            value={input}
                            onChange={(e) => setInput(e.target.value)}
                            onKeyDown={(e) => e.key === "Enter" && handleSend()}
                            placeholder={isListening ? "Listening..." : nanobotAvailable ? "Ask Nanobot — send WhatsApp, check calendar, fill forms..." : "Ask to create a task or search docs..."}
                            className={cn(
                                "w-full pl-4 pr-12 py-3 bg-slate-50 dark:bg-slate-900/50 border-slate-200 dark:border-slate-700/50 rounded-xl focus:outline-none focus:ring-2 focus:ring-purple-500/20 focus:border-purple-500 transition-all text-sm dark:text-slate-200 dark:placeholder:text-slate-500",
                                isListening && "border-red-400 ring-2 ring-red-500/10 placeholder:text-red-400"
                            )}
                        />
                        {isSpeechSupported && (
                            <button
                                onClick={toggleListening}
                                className={cn(
                                    "absolute right-2 top-1/2 -translate-y-1/2 p-1.5 rounded-lg transition-colors",
                                    isListening ? "text-red-500 hover:bg-red-50 dark:hover:bg-red-900/20" : "text-slate-400 hover:text-slate-600 dark:hover:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800"
                                )}
                            >
                                {isListening ? <MicOff className="w-4 h-4" /> : <Mic className="w-4 h-4" />}
                            </button>
                        )}
                    </div>

                    <button
                        onClick={handleSend}
                        disabled={!input.trim() || isThinking}
                        className="p-3 bg-purple-600 hover:bg-purple-700 text-white rounded-xl disabled:opacity-50 disabled:cursor-not-allowed transition-colors shadow-sm"
                    >
                        <Send className="w-4 h-4" />
                    </button>
                </div>
            </div>
        </div>
    );
}
