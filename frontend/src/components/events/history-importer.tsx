
"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Calendar } from "@/components/ui/calendar";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { cn } from "@/lib/utils";
import { format } from "date-fns";
import { CalendarIcon, Loader2, DownloadCloud } from "lucide-react";
import { toast } from "sonner";
import { ingestHistory } from "@/app/actions/ingest-history";

import { DateRange } from "react-day-picker";

interface HistoryImporterProps {
    date: DateRange | undefined;
    setDate: (date: DateRange | undefined) => void;
}

export function HistoryImporter({ date, setDate }: HistoryImporterProps) {
    const [isLoading, setIsLoading] = useState(false);

    const handleImport = async () => {
        if (!date?.from || !date?.to) {
            toast.error("Please select a date range.");
            return;
        }

        setIsLoading(true);
        toast.info("⏳ Starting WhatsApp Import. Check terminal for QR Code if needed.");

        try {
            const result = await ingestHistory(date.from, date.to);
            if (result.success) {
                toast.success("✅ Import Process Started/Completed. Check console.");
            } else {
                toast.error(`❌ Import Failed: ${result.error}`);
            }
        } catch (error) {
            toast.error("❌ Failed to trigger import.");
        } finally {
            setIsLoading(false);
        }
    };

    return (
        <div className="flex items-center gap-2">
            <Popover>
                <PopoverTrigger asChild>
                    <Button
                        id="date"
                        variant={"outline"}
                        className={cn(
                            "w-[260px] justify-start text-left font-normal bg-black/20 border-white/10 text-white hover:bg-white/5",
                            !date && "text-muted-foreground"
                        )}
                    >
                        <CalendarIcon className="mr-2 h-4 w-4" />
                        {date?.from ? (
                            date.to ? (
                                <>
                                    {format(date.from, "LLL dd, y")} -{" "}
                                    {format(date.to, "LLL dd, y")}
                                </>
                            ) : (
                                format(date.from, "LLL dd, y")
                            )
                        ) : (
                            <span>Pick a date range</span>
                        )}
                    </Button>
                </PopoverTrigger>
                <PopoverContent className="w-auto p-0 bg-zinc-950 border-white/10" align="start">
                    <Calendar
                        initialFocus
                        mode="range"
                        defaultMonth={date?.from}
                        selected={date}
                        onSelect={setDate}
                        numberOfMonths={2}
                        className="bg-zinc-950 text-white"
                    />
                </PopoverContent>
            </Popover>

            <Button
                onClick={handleImport}
                disabled={isLoading}
                className="bg-green-600/20 text-green-400 hover:bg-green-600/30 border border-green-500/30"
            >
                {isLoading ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <DownloadCloud className="mr-2 h-4 w-4" />}
                Fetch History
            </Button>
        </div>
    );
}
