"use client";

import { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { AuraCard } from "@/components/ui/aura-card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Loader2, Zap, ExternalLink, CheckCircle, XCircle, Play } from "lucide-react";
import { toast } from "sonner";
import { updateEventStatus } from "@/lib/agent/event-actions"; // Server Action
import { ApplyModal } from "@/components/events/apply-modal";
import { cn } from "@/lib/utils";

export function EventCard({ event, isSelected, onToggle }: { event: any, isSelected: boolean, onToggle: (checked: boolean) => void }) {
    const [status, setStatus] = useState(event.status);
    const [showApplyModal, setShowApplyModal] = useState(false);
    const [isUpdating, setIsUpdating] = useState(false);

    const handleStatusUpdate = async (newStatus: "Queued" | "Failed") => {
        setIsUpdating(true);
        // Optimistic
        const oldStatus = status;
        setStatus(newStatus === 'Queued' ? 'Queued' : 'Failed'); // Visual feedback immediately

        const result = await updateEventStatus(event.id, newStatus);

        if (result.success) {
            toast.success(newStatus === 'Queued' ? "Event Approved (Queued)" : "Event Rejected");
        } else {
            setStatus(oldStatus); // Revert
            toast.error("Failed to update status");
        }
        setIsUpdating(false);
    };

    return (
        <>
            <AuraCard
                className={cn(
                    "flex flex-col justify-between group h-full relative overflow-hidden transition-all duration-300",
                    isSelected ? 'shadow-[0_0_20px_rgba(6,182,212,0.2)] border-cyan-500/50' : 'hover:border-cyan-500/30 hover:-translate-y-1',
                )}
                transparency="glass"
            >
                {/* Status Light Strip */}
                <div className={cn("absolute top-0 left-0 w-1 h-full transition-all duration-500",
                    status === 'Detected' ? 'bg-blue-500/50 shadow-[0_0_10px_blue]' :
                        status === 'Processing' ? 'bg-cyan-500 animate-pulse shadow-[0_0_15px_cyan]' :
                            status === 'Applied' ? 'bg-emerald-500 shadow-[0_0_10px_emerald]' :
                                status === 'Queued' ? 'bg-amber-500 shadow-[0_0_10px_amber]' :
                                    status === 'Failed' ? 'bg-red-500/50 shadow-[0_0_10px_red]' : 'bg-white/10'
                )} />

                <CardHeader className="pb-2 pl-5">
                    <div className="flex justify-between items-start mb-2">
                        <div className="flex items-center gap-2">
                            <Checkbox
                                checked={isSelected}
                                onCheckedChange={(checked) => onToggle(checked as boolean)}
                                className="border-white/30 data-[state=checked]:bg-cyan-500 data-[state=checked]:border-cyan-500"
                            />
                            <Badge variant="outline" className={cn(
                                "capitalize",
                                event.source === 'WhatsApp' ? 'border-green-500/50 text-green-400 bg-green-500/10' : 'border-blue-500/50 text-blue-400 bg-blue-500/10'
                            )}>
                                {event.source}
                            </Badge>
                        </div>
                        <Badge variant="secondary" className={cn(
                            "capitalize",
                            status === 'Detected' ? 'bg-blue-500/20 text-blue-400 border-blue-500/50' :
                                status === 'Processing' ? 'bg-cyan-500/20 text-cyan-400 border-cyan-500/50 animate-pulse' :
                                    status === 'Applied' ? 'bg-green-500/20 text-green-400 border-green-500/50' :
                                        status === 'Queued' ? 'bg-yellow-500/20 text-yellow-400 border-yellow-500/50' :
                                            status === 'Failed' ? 'bg-red-500/20 text-red-400 border-red-500/50' :
                                                'bg-white/10'
                        )}>
                            {status === 'Processing' && <Loader2 className="w-3 h-3 mr-1 animate-spin" />}
                            {status}
                        </Badge>
                    </div>
                    <CardTitle className="text-sm font-medium text-white truncate flex items-center gap-1">
                        <span className="truncate" title={event.title}>{event.title || "Untitled Event"}</span>
                    </CardTitle>
                    {event.url ? (
                        <a href={event.url} target="_blank" rel="noopener noreferrer" className="text-xs text-muted-foreground hover:text-cyan-400 flex items-center gap-1 transition-colors truncate max-w-full">
                            {event.url} <ExternalLink className="h-3 w-3" />
                        </a>
                    ) : (
                        <span className="text-xs text-muted-foreground">No URL</span>
                    )}
                </CardHeader>
                <CardContent className="pl-5 pb-4 flex flex-col flex-1">
                    <p className="text-sm line-clamp-3 text-white/70 mb-4 flex-1">{event.description || event.rawContext}</p>

                    <div className="flex items-center justify-between mt-auto pt-4 border-t border-white/5">
                        <div className="flex items-center gap-2 text-[10px] text-muted-foreground">
                            <span>{new Date(event.createdAt).toLocaleDateString()}</span>
                            {event.metadata?.groupName && <span>• {event.metadata.groupName}</span>}
                        </div>

                        {/* Actions */}
                        <div className="flex items-center gap-2">
                            {/* Approve/Reject for Detected events */}
                            {status === 'Detected' && (
                                <>
                                    <Button
                                        variant="ghost"
                                        size="icon"
                                        className="h-7 w-7 text-red-400 hover:text-red-300 hover:bg-red-500/10"
                                        onClick={() => handleStatusUpdate('Failed')}
                                        disabled={isUpdating}
                                        title="Reject (Mark as Failed)"
                                    >
                                        <XCircle className="h-4 w-4" />
                                    </Button>
                                    <Button
                                        variant="ghost"
                                        size="icon"
                                        className="h-7 w-7 text-green-400 hover:text-green-300 hover:bg-green-500/10"
                                        onClick={() => handleStatusUpdate('Queued')}
                                        disabled={isUpdating}
                                        title="Approve (Mark as Queued)"
                                    >
                                        <CheckCircle className="h-4 w-4" />
                                    </Button>
                                </>
                            )}

                            {/* Apply Button for Queued/Detected (if URL exists) */}
                            {(status === 'Detected' || status === 'Queued' || status === 'Failed') && event.url && (
                                <Button
                                    variant="ghost" // outline looks too heavy with the badge, maybe ghost with border?
                                    size="sm"
                                    className="h-7 text-xs border border-cyan-500/30 text-cyan-400 hover:bg-cyan-500/10 hover:text-cyan-300"
                                    onClick={() => setShowApplyModal(true)}
                                >
                                    <Zap className="h-3 w-3 mr-1" />
                                    Apply AI
                                </Button>
                            )}
                        </div>
                    </div>
                </CardContent>
            </AuraCard>

            <ApplyModal
                isOpen={showApplyModal}
                onClose={() => setShowApplyModal(false)}
                event={event}
                onSuccess={() => setStatus("Applied")} // Or "Processing" if we want to reflect that immediately, modal handles invocation
            />
        </>
    );
}
