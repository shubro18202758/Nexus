
"use client";

import { useState } from "react";
import {
    format,
    subMonths,
    addMonths,
    startOfMonth,
    endOfMonth,
    startOfWeek,
    endOfWeek,
    isSameMonth,
    isSameDay,
    eachDayOfInterval,
    parseISO,
} from "date-fns";
import { ChevronLeft, ChevronRight, Calendar as CalendarIcon, MapPin, Clock } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { type Event } from "@/db/schema";
import {
    Popover,
    PopoverContent,
    PopoverTrigger,
} from "@/components/ui/popover";
import { Badge } from "@/components/ui/badge";


import { useEffect } from "react";

interface CalendarViewProps {
    events: Event[];
    focusedDate?: Date;
}

export function CalendarView({ events, focusedDate }: CalendarViewProps) {
    const [currentMonth, setCurrentMonth] = useState(new Date());
    const [selectedDate, setSelectedDate] = useState<Date>(new Date());

    // Update calendar view when focusedDate changes (e.g. from date picker)
    useEffect(() => {
        if (focusedDate) {
            setCurrentMonth(focusedDate);
            setSelectedDate(focusedDate);
        }
    }, [focusedDate]);

    const onPrevMonth = () => setCurrentMonth(subMonths(currentMonth, 1));
    const onNextMonth = () => setCurrentMonth(addMonths(currentMonth, 1));
    const onToday = () => {
        const now = new Date();
        setCurrentMonth(now);
        setSelectedDate(now);
    }

    const renderHeader = () => {
        return (
            <div className="flex items-center justify-between py-4">
                <div className="flex items-center gap-4">
                    <h2 className="text-2xl font-bold text-white">
                        {format(currentMonth, "MMMM yyyy")}
                    </h2>
                    <Button variant="outline" size="sm" onClick={onToday} className="h-7 text-xs border-white/10 hover:bg-white/5">
                        Today
                    </Button>
                </div>
                <div className="flex space-x-2">
                    <Button variant="ghost" size="icon" onClick={onPrevMonth} className="hover:bg-white/10">
                        <ChevronLeft className="h-5 w-5" />
                    </Button>
                    <Button variant="ghost" size="icon" onClick={onNextMonth} className="hover:bg-white/10">
                        <ChevronRight className="h-5 w-5" />
                    </Button>
                </div>
            </div>
        );
    };

    const renderDays = () => {
        const days = [];
        const dateFormat = "eeee";
        const startDate = startOfWeek(currentMonth);

        for (let i = 0; i < 7; i++) {
            days.push(
                <div className="text-center text-sm font-medium text-muted-foreground py-2 uppercase tracking-wider" key={i}>
                    {format(startDate, dateFormat)}
                </div>
            );
            startDate.setDate(startDate.getDate() + 1);
        }

        return <div className="grid grid-cols-7 mb-2 border-b border-white/10">{days}</div>;
    };

    const renderCells = () => {
        const monthStart = startOfMonth(currentMonth);
        const monthEnd = endOfMonth(monthStart);
        const startDate = startOfWeek(monthStart);
        const endDate = endOfWeek(monthEnd);

        const dateFormat = "d";
        const rows = [];
        let days = [];
        let day = startDate;
        let formattedDate = "";

        while (day <= endDate) {
            for (let i = 0; i < 7; i++) {
                formattedDate = format(day, dateFormat);
                const cloneDay = day;

                // Find events for this day
                const dayEvents = events.filter((event) => {
                    if (!event.eventDate) return false;
                    // Handle both Date objects and string/ISO dates if they come from JSON
                    const eDate = event.eventDate instanceof Date ? event.eventDate : new Date(event.eventDate);
                    return isSameDay(eDate, cloneDay);
                });

                const isToday = isSameDay(day, new Date());
                const isCurrentMonth = isSameMonth(day, monthStart);

                days.push(
                    <CalendarCell
                        key={day.toString()}
                        day={cloneDay}
                        isCurrentMonth={isCurrentMonth}
                        isToday={isToday}
                        isSelected={isSameDay(day, selectedDate)}
                        events={dayEvents}
                        onClick={() => setSelectedDate(cloneDay)}
                    />
                );
                day = new Date(day.getFullYear(), day.getMonth(), day.getDate() + 1);
            }
            rows.push(
                <div className="grid grid-cols-7" key={day.toString()}>
                    {days}
                </div>
            );
            days = [];
        }
        return <div className="bg-black/40 rounded-xl border border-white/5 overflow-hidden backdrop-blur-sm shadow-inner shadow-black/50">{rows}</div>;
    };

    return (
        <div className="flex flex-col gap-4 animate-in fade-in duration-500">
            {renderHeader()}
            {renderDays()}
            <div className="relative">
                {renderCells()}
                {/* Cyberpunk Grid Overlay Effect */}
                <div className="absolute inset-0 pointer-events-none bg-[linear-gradient(rgba(18,18,18,0)_1px,transparent_1px),linear-gradient(90deg,rgba(18,18,18,0)_1px,transparent_1px)] bg-[size:40px_40px] [mask-image:radial-gradient(ellipse_at_center,black_70%,transparent_100%)] opacity-20"></div>
            </div>
        </div>
    );
}

// Helper for cell styling
function CalendarCell({ day, isCurrentMonth, isSelected, isToday, events, onClick }: any) {
    return (
        <div
            className={cn(
                "min-h-[120px] p-2 border border-white/5 relative group transition-all duration-200 flex flex-col gap-1 cursor-pointer",
                !isCurrentMonth && "opacity-20 bg-black/40 grayscale",
                isToday && "bg-cyan-950/20 border-cyan-500/30 shadow-[inset_0_0_20px_rgba(6,182,212,0.1)]",
                isSelected && "bg-white/5 border-white/20",
                "hover:bg-white/5 hover:border-cyan-500/30 hover:shadow-[inset_0_0_10px_rgba(6,182,212,0.05)]"
            )}
            onClick={onClick}
        >
            <div className="flex justify-between items-start">
                <span className={cn(
                    "text-sm font-mono font-bold h-6 w-6 flex items-center justify-center rounded-sm transition-colors",
                    isToday ? "bg-cyan-500 text-black shadow-[0_0_10px_cyan]" : "text-slate-500 group-hover:text-slate-300"
                )}>
                    {format(day, "d")}
                </span>
                {events.length > 0 && (
                    <span className="text-[10px] font-bold text-cyan-300 bg-cyan-500/10 px-1.5 py-0.5 rounded border border-cyan-500/20 shadow-[0_0_5px_rgba(6,182,212,0.2)]">
                        {events.length}
                    </span>
                )}
            </div>

            <div className="flex flex-col gap-1 mt-1 overflow-y-auto max-h-[80px] custom-scrollbar">
                {events.map((event: any) => (
                    <Popover key={event.id}>
                        <PopoverTrigger asChild>
                            <div className="text-[10px] truncate bg-black/60 p-1.5 rounded border border-white/5 cursor-pointer hover:border-cyan-500/50 hover:bg-cyan-500/10 hover:text-cyan-200 transition-all text-left group/event">
                                <div className="font-medium text-slate-300 truncate group-hover/event:text-cyan-100">{event.title}</div>
                                <div className="text-[9px] text-slate-500 truncate font-mono">{format(new Date(event.eventDate!), "HH:mm")}</div>
                            </div>
                        </PopoverTrigger>
                        <PopoverContent className="w-80 bg-black/90 border-cyan-500/20 p-0 shadow-[0_0_30px_-5px_rgba(6,182,212,0.15)] backdrop-blur-xl rounded-xl overflow-hidden">
                            <div className="h-1 w-full bg-gradient-to-r from-cyan-500 via-blue-500 to-purple-500" />
                            <div className="p-4 flex flex-col gap-3">
                                <div className="flex items-start justify-between">
                                    <h4 className="font-bold text-lg text-white leading-tight font-space">{event.title}</h4>
                                    <Badge variant="outline" className={cn(
                                        "capitalize text-[10px] border-white/10 bg-white/5",
                                        event.source === 'WhatsApp' ? 'text-green-400' : 'text-blue-400'
                                    )}>
                                        {event.source}
                                    </Badge>
                                </div>
                                {/* ... rest of popover content same as before but styled ... */}
                                <p className="text-sm text-slate-400 bg-white/5 p-3 rounded-lg border border-white/5 font-mono text-xs">
                                    {event.description}
                                </p>
                            </div>
                        </PopoverContent>
                    </Popover>
                ))}
            </div>
        </div>
    )
}
