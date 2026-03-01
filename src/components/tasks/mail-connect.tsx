"use client";

// ===================================================================
// MailConnect — IMAP credential setup with provider presets
// ===================================================================

import { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Mail, Lock, Server, Plug, CheckCircle, AlertCircle, Loader2, LogOut, Wifi } from "lucide-react";
import { useMailStore, type MailCredentials } from "@/hooks/use-mail-store";
import { cn } from "@/lib/utils";

const PRESETS: { label: string; icon: string; host: string; port: number }[] = [
    { label: "Gmail", icon: "📧", host: "imap.gmail.com", port: 993 },
    { label: "Outlook", icon: "📨", host: "outlook.office365.com", port: 993 },
    { label: "Yahoo", icon: "📩", host: "imap.mail.yahoo.com", port: 993 },
    { label: "iCloud", icon: "☁️", host: "imap.mail.me.com", port: 993 },
];

export function MailConnect() {
    const { credentials, isConnected, isLoading, error, connect, disconnect, setCredentials } = useMailStore();
    const [form, setForm] = useState<MailCredentials>({
        host: credentials?.host || "",
        port: credentials?.port || 993,
        email: credentials?.email || "",
        password: credentials?.password || "",
    });
    const [showPassword, setShowPassword] = useState(false);

    const handlePreset = (preset: typeof PRESETS[0]) => {
        setForm(f => ({ ...f, host: preset.host, port: preset.port }));
    };

    const handleConnect = async () => {
        setCredentials(form);
        const ok = await connect();
        if (ok) {
            // Auto-fetch mails after connecting
            useMailStore.getState().fetchMails();
        }
    };

    if (isConnected) {
        return (
            <motion.div
                initial={{ opacity: 0, scale: 0.95 }}
                animate={{ opacity: 1, scale: 1 }}
                className="p-4 bg-emerald-500/10 border border-emerald-500/20 rounded-xl backdrop-blur-md"
            >
                <div className="flex items-center justify-between">
                    <div className="flex items-center gap-3">
                        <div className="p-2 bg-emerald-500/20 rounded-lg">
                            <CheckCircle className="h-5 w-5 text-emerald-400" />
                        </div>
                        <div>
                            <div className="text-sm font-bold text-emerald-300 font-mono">CONNECTED</div>
                            <div className="text-[10px] text-emerald-400/60 font-mono">{credentials?.email}</div>
                        </div>
                    </div>
                    <div className="flex items-center gap-2">
                        <span className="relative flex h-2 w-2">
                            <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75" />
                            <span className="relative inline-flex rounded-full h-2 w-2 bg-emerald-500" />
                        </span>
                        <button
                            onClick={disconnect}
                            className="text-[9px] font-mono text-white/30 hover:text-red-400 transition-colors flex items-center gap-1 px-2 py-1 rounded-lg hover:bg-red-500/10"
                        >
                            <LogOut className="h-3 w-3" /> DISCONNECT
                        </button>
                    </div>
                </div>
            </motion.div>
        );
    }

    return (
        <motion.div
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            className="p-5 bg-black/40 border border-white/[0.08] rounded-xl backdrop-blur-md space-y-4"
        >
            {/* Header */}
            <div className="flex items-center gap-3">
                <div className="p-2.5 bg-gradient-to-br from-violet-600/20 to-cyan-600/20 rounded-xl border border-violet-500/20">
                    <Mail className="h-5 w-5 text-violet-400" />
                </div>
                <div>
                    <h3 className="text-sm font-bold text-white font-mono">Connect Your Inbox</h3>
                    <p className="text-[10px] text-white/30 font-mono">IMAP credentials · Stored locally only</p>
                </div>
            </div>

            {/* Provider Presets */}
            <div className="flex gap-1.5">
                {PRESETS.map(p => (
                    <button
                        key={p.label}
                        onClick={() => handlePreset(p)}
                        className={cn(
                            "flex-1 flex flex-col items-center gap-1 py-2 rounded-lg border transition-all text-center",
                            form.host === p.host
                                ? "bg-violet-500/15 border-violet-500/30 text-violet-300"
                                : "bg-white/[0.02] border-white/[0.06] text-white/40 hover:bg-white/[0.05] hover:text-white/60"
                        )}
                    >
                        <span className="text-lg">{p.icon}</span>
                        <span className="text-[8px] font-mono font-bold tracking-wider">{p.label.toUpperCase()}</span>
                    </button>
                ))}
            </div>

            {/* Form Fields */}
            <div className="space-y-2.5">
                <div className="grid grid-cols-3 gap-2">
                    <div className="col-span-2">
                        <label className="text-[8px] font-mono text-white/25 uppercase tracking-widest mb-1 block">IMAP Host</label>
                        <div className="relative">
                            <Server className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3 w-3 text-white/20" />
                            <input
                                type="text"
                                value={form.host}
                                onChange={e => setForm(f => ({ ...f, host: e.target.value }))}
                                placeholder="imap.gmail.com"
                                className="w-full pl-8 pr-3 py-2 bg-white/[0.03] border border-white/[0.08] rounded-lg text-xs font-mono text-white placeholder:text-white/15 focus:border-violet-500/40 focus:outline-none transition-colors"
                            />
                        </div>
                    </div>
                    <div>
                        <label className="text-[8px] font-mono text-white/25 uppercase tracking-widest mb-1 block">Port</label>
                        <input
                            type="number"
                            value={form.port}
                            onChange={e => setForm(f => ({ ...f, port: Number(e.target.value) }))}
                            className="w-full px-3 py-2 bg-white/[0.03] border border-white/[0.08] rounded-lg text-xs font-mono text-white focus:border-violet-500/40 focus:outline-none transition-colors"
                        />
                    </div>
                </div>

                <div>
                    <label className="text-[8px] font-mono text-white/25 uppercase tracking-widest mb-1 block">Email Address</label>
                    <div className="relative">
                        <Mail className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3 w-3 text-white/20" />
                        <input
                            type="email"
                            value={form.email}
                            onChange={e => setForm(f => ({ ...f, email: e.target.value }))}
                            placeholder="student@university.edu"
                            className="w-full pl-8 pr-3 py-2 bg-white/[0.03] border border-white/[0.08] rounded-lg text-xs font-mono text-white placeholder:text-white/15 focus:border-violet-500/40 focus:outline-none transition-colors"
                        />
                    </div>
                </div>

                <div>
                    <label className="text-[8px] font-mono text-white/25 uppercase tracking-widest mb-1 block">Password</label>
                    <div className="relative">
                        <Lock className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3 w-3 text-white/20" />
                        <input
                            type={showPassword ? "text" : "password"}
                            value={form.password}
                            onChange={e => setForm(f => ({ ...f, password: e.target.value }))}
                            placeholder="••••••••••••••••"
                            className="w-full pl-8 pr-16 py-2 bg-white/[0.03] border border-white/[0.08] rounded-lg text-xs font-mono text-white placeholder:text-white/15 focus:border-violet-500/40 focus:outline-none transition-colors"
                        />
                        <button
                            onClick={() => setShowPassword(!showPassword)}
                            className="absolute right-2.5 top-1/2 -translate-y-1/2 text-[8px] font-mono text-white/20 hover:text-white/50 transition-colors"
                        >
                            {showPassword ? "HIDE" : "SHOW"}
                        </button>
                    </div>
                    <p className="text-[8px] text-white/15 font-mono mt-1">
                        {form.host.includes("gmail")
                            ? "Gmail: Settings → Security → App Passwords (16-char key)"
                            : form.host.includes("iitb") || form.host.includes("edu") || form.host.includes("ac.in")
                                ? "Use your institutional webmail/LDAP password"
                                : "Use your email password or app-specific password"}
                    </p>
                </div>
            </div>

            {/* Error */}
            <AnimatePresence>
                {error && (
                    <motion.div
                        initial={{ opacity: 0, height: 0 }}
                        animate={{ opacity: 1, height: "auto" }}
                        exit={{ opacity: 0, height: 0 }}
                        className="flex items-center gap-2 p-2.5 bg-red-500/10 border border-red-500/20 rounded-lg"
                    >
                        <AlertCircle className="h-3.5 w-3.5 text-red-400 shrink-0" />
                        <span className="text-[10px] font-mono text-red-300">{error}</span>
                    </motion.div>
                )}
            </AnimatePresence>

            {/* Connect Button */}
            <button
                onClick={handleConnect}
                disabled={isLoading || !form.host || !form.email || !form.password}
                className={cn(
                    "w-full flex items-center justify-center gap-2 py-2.5 rounded-xl font-mono text-xs font-bold tracking-wider transition-all",
                    isLoading
                        ? "bg-violet-500/10 text-violet-300/50 cursor-wait"
                        : "bg-gradient-to-r from-violet-600/30 to-cyan-600/30 text-white hover:from-violet-600/40 hover:to-cyan-600/40 border border-violet-500/20 hover:border-violet-500/40 shadow-[0_0_20px_rgba(139,92,246,0.1)] hover:shadow-[0_0_30px_rgba(139,92,246,0.2)]",
                    (!form.host || !form.email || !form.password) && "opacity-30 cursor-not-allowed"
                )}
            >
                {isLoading ? (
                    <><Loader2 className="h-4 w-4 animate-spin" /> CONNECTING...</>
                ) : (
                    <><Wifi className="h-4 w-4" /> CONNECT INBOX</>
                )}
            </button>
        </motion.div>
    );
}
