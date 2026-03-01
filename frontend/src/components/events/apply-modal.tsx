
"use client";

import { useState } from "react";
import {
    Dialog,
    DialogContent,
    DialogDescription,
    DialogFooter,
    DialogHeader,
    DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Loader2, Zap } from "lucide-react";
import { toast } from "sonner";
import { registerForEvent } from "@/lib/agent/event-actions";

interface ApplyModalProps {
    isOpen: boolean;
    onClose: () => void;
    event: any; // Using any for now to avoid circular deps or complex imports, can define proper type if needed
    onSuccess: () => void;
}

export function ApplyModal({ isOpen, onClose, event, onSuccess }: ApplyModalProps) {
    const [instructions, setInstructions] = useState(
        "Use my student profile. If asked for a team, say 'Looking for team'. Select the free ticket."
    );
    const [isProcessing, setIsProcessing] = useState(false);
    const [reviewImage, setReviewImage] = useState<string | null>(null);
    const [step, setStep] = useState<'input' | 'review'>('input');

    const handlePreview = async () => {
        setIsProcessing(true);
        toast.info("🤖 Generating Preview...");

        // Call in Review Mode
        const result = await registerForEvent(event.id, instructions, 'review');

        setIsProcessing(false);

        if (result.success && result.screenshot) {
            setReviewImage(result.screenshot);
            setStep('review');
            toast.success("Preview Generated. Please review.");
        } else {
            toast.error(`Preview Failed: ${result.message}`);
        }
    };

    const handleSubmit = async () => {
        setIsProcessing(true);
        toast.info("🚀 Confirmed. Submitting...");

        // Call in Submit Mode
        const result = await registerForEvent(event.id, instructions, 'submit');

        setIsProcessing(false);

        if (result.success) {
            toast.success(result.message);
            onSuccess();
            onClose();
        } else {
            toast.error(result.message);
        }
    };

    return (
        <Dialog open={isOpen} onOpenChange={onClose}>
            <DialogContent className="sm:max-w-xl bg-zinc-950 border-white/10 text-white">
                <DialogHeader>
                    <DialogTitle>Apply with AI Agent</DialogTitle>
                    <DialogDescription className="text-muted-foreground">
                        {step === 'input'
                            ? "The agent will navigate to the event URL and attempt to register you."
                            : "Review the agent's actions before confirming."}
                    </DialogDescription>
                </DialogHeader>

                <div className="flex flex-col gap-4 py-4 max-h-[60vh] overflow-y-auto">
                    <div className="p-3 bg-white/5 rounded-md border border-white/5">
                        <h4 className="font-semibold text-sm mb-1">{event.title}</h4>
                        <p className="text-xs text-muted-foreground truncate">{event.url}</p>
                    </div>

                    {step === 'input' ? (
                        <div className="flex flex-col gap-2">
                            <label className="text-sm font-medium text-cyan-400">Agent Instructions</label>
                            <Textarea
                                value={instructions}
                                onChange={(e) => setInstructions(e.target.value)}
                                className="bg-black/50 border-white/10 min-h-[100px] text-sm focus-visible:ring-cyan-500/50"
                                placeholder="Tell the agent what to do..."
                            />
                        </div>
                    ) : (
                        <div className="flex flex-col gap-4">
                            <div className="bg-black border border-white/10 rounded overflow-hidden aspect-video relative flex items-center justify-center">
                                {reviewImage ? (
                                    <img
                                        src={`data:image/png;base64,${reviewImage}`}
                                        alt="Agent Preview"
                                        className="w-full h-full object-contain"
                                    />
                                ) : (
                                    <div className="text-muted-foreground">No Preview Available</div>
                                )}
                            </div>
                        </div>
                    )}
                </div>

                <DialogFooter className="sm:justify-between">
                    <Button variant="ghost" onClick={onClose} disabled={isProcessing}>
                        Cancel
                    </Button>

                    <div className="flex gap-2">
                        {step === 'input' ? (
                            <>
                                <Button
                                    onClick={handleSubmit}
                                    disabled={isProcessing}
                                    variant="ghost"
                                    className="text-white hover:bg-white/10"
                                >
                                    Skip Review
                                </Button>
                                <Button
                                    onClick={handlePreview}
                                    disabled={isProcessing}
                                    className="bg-cyan-600 hover:bg-cyan-700 text-white"
                                >
                                    {isProcessing ? (
                                        <>
                                            <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                                            Generating...
                                        </>
                                    ) : (
                                        <>
                                            <Zap className="mr-2 h-4 w-4" />
                                            Generate Preview
                                        </>
                                    )}
                                </Button>
                            </>
                        ) : (
                            <>
                                <Button
                                    onClick={() => setStep('input')}
                                    disabled={isProcessing}
                                    variant="ghost"
                                >
                                    Back
                                </Button>
                                <Button
                                    onClick={handleSubmit}
                                    disabled={isProcessing}
                                    className="bg-green-600 hover:bg-green-700 text-white"
                                >
                                    {isProcessing ? (
                                        <>
                                            <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                                            Submitting...
                                        </>
                                    ) : (
                                        "Confirm & Submit"
                                    )}
                                </Button>
                            </>
                        )}
                    </div>
                </DialogFooter>
            </DialogContent>
        </Dialog>
    );
}
