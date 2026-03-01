"use client";

import { useState, useEffect } from "react";
import {
    DndContext,
    closestCorners,
    KeyboardSensor,
    PointerSensor,
    useSensor,
    useSensors,
    DragOverlay,
    defaultDropAnimationSideEffects,
    DragStartEvent,
    DragOverEvent,
    DragEndEvent,
} from "@dnd-kit/core";
import {
    SortableContext,
    arrayMove,
    sortableKeyboardCoordinates,
    verticalListSortingStrategy,
    useSortable,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { useDb } from "@/components/providers/db-provider";
import { tasks, type Task } from "@/db/schema";
import { eq } from "drizzle-orm";
import { format } from "date-fns";
import { Calendar, CheckCircle2, Circle, Clock, Zap } from "lucide-react";
import { cn } from "@/lib/utils";
import { AuraCard } from "@/components/ui/aura-card";

// --- Types ---
type Status = "todo" | "in-progress" | "done";

// --- Components ---

function TaskCard({ task, isOverlay }: { task: Task; isOverlay?: boolean }) {
    const {
        setNodeRef,
        attributes,
        listeners,
        transform,
        transition,
        isDragging,
    } = useSortable({
        id: task.id,
        data: {
            type: "Task",
            task,
        },
    });

    const style = {
        transition,
        transform: CSS.Translate.toString(transform),
    };

    const priorityColors = {
        low: "bg-blue-500/10 text-blue-400 border-blue-500/20",
        medium: "bg-yellow-500/10 text-yellow-400 border-yellow-500/20",
        high: "bg-red-500/10 text-red-400 border-red-500/20",
    };

    if (isDragging) {
        return (
            <div
                ref={setNodeRef}
                style={style}
                className="opacity-30 p-4 border border-dashed border-cyan-500/50 rounded-xl bg-black/40 h-[120px]"
            />
        );
    }

    const priority = (task.priority as keyof typeof priorityColors) || "medium";

    const content = (
        <div className="space-y-3">
            <div className="flex justify-between items-start">
                <h3 className="font-medium text-slate-100 leading-tight group-hover:text-cyan-200 transition-colors">{task.title}</h3>
                {/* Priority Badge */}
                <div className={cn("text-[10px] uppercase font-bold px-2 py-0.5 rounded-full border tracking-wider", priorityColors[priority])}>
                    {priority}
                </div>
            </div>

            {task.description && (
                <p className="text-xs text-slate-400 line-clamp-2">{task.description}</p>
            )}

            <div className="flex items-center justify-between text-xs text-slate-500">
                <div className="flex items-center gap-1.5">
                    {task.dueDate ? (
                        <>
                            <Calendar className="h-3 w-3 text-cyan-500/70" />
                            <span className="font-mono text-cyan-500/70">{format(new Date(task.dueDate), "MMM d")}</span>
                        </>
                    ) : (
                        <span className="opacity-30 font-mono">NO DATE</span>
                    )}
                </div>
                {/* Status Indicator (Subtle) */}
                <div className={cn(
                    "h-1.5 w-1.5 rounded-full shadow-[0_0_5px_currentColor]",
                    task.status === "done" ? "bg-emerald-500 text-emerald-500" :
                        task.status === "in-progress" ? "bg-violet-500 text-violet-500" : "bg-slate-500 text-slate-500"
                )} />
            </div>
        </div>
    );

    return (
        <div
            ref={setNodeRef}
            style={style}
            {...attributes}
            {...listeners}
            className={cn("touch-none", isOverlay && "cursor-grabbing")}
        >
            <AuraCard
                className={cn(
                    "bg-black/40 backdrop-blur-md border-white/5 hover:border-cyan-500/30 transition-all duration-300",
                    isOverlay ? "shadow-[0_0_30px_rgba(6,182,212,0.3)] rotate-2 border-cyan-500/50 z-50 scale-105" : ""
                )}
                transparency="glass"
            >
                {content}
            </AuraCard>
        </div>
    );
}

function Column({ id, title, tasks }: { id: Status; title: string; tasks: Task[] }) {
    const { setNodeRef } = useSortable({
        id: id,
        data: {
            type: "Column",
            columnId: id,
        },
    });

    const iconMap = {
        "todo": Circle,
        "in-progress": Zap,
        "done": CheckCircle2
    };

    const Icon = iconMap[id];

    return (
        <div className="flex flex-col h-full bg-white/5 backdrop-blur-sm rounded-2xl border border-white/5 p-4 w-[350px] min-w-[350px] shadow-inner shadow-black/20">
            <div className="flex items-center gap-3 mb-4 p-2">
                <div className={cn(
                    "p-2 rounded-lg border shadow-[0_0_15px_-5px_currentColor]",
                    id === "todo" ? "bg-slate-500/10 text-slate-400 border-slate-500/20" :
                        id === "in-progress" ? "bg-violet-500/10 text-violet-400 border-violet-500/20" :
                            "bg-emerald-500/10 text-emerald-400 border-emerald-500/20"
                )}>
                    <Icon className="h-4 w-4" />
                </div>
                <h2 className="font-semibold text-slate-200 tracking-wide font-mono text-sm uppercase">{title}</h2>
                <span className="ml-auto text-[10px] font-bold font-mono bg-black/40 px-2 py-1 rounded-full border border-white/5 text-slate-400">
                    {tasks.length}
                </span>
            </div>

            <SortableContext items={tasks.map((t) => t.id)} strategy={verticalListSortingStrategy}>
                <div ref={setNodeRef} className="flex-1 space-y-3 overflow-y-auto pr-2 min-h-[100px] custom-scrollbar">
                    {tasks.map((task) => (
                        <TaskCard key={task.id} task={task} />
                    ))}
                    {tasks.length === 0 && (
                        <div className="h-full flex flex-col items-center justify-center border-2 border-dashed border-white/5 rounded-xl text-slate-500/50 text-xs font-mono p-8">
                            <span className="opacity-50">AWAITING INPUT...</span>
                        </div>
                    )}
                </div>
            </SortableContext>
        </div>
    );
}

export function TaskBoard({ tasks: initialTasks, onUpdate }: { tasks: Task[]; onUpdate?: () => void }) {
    const { db } = useDb();
    const [localTasks, setLocalTasks] = useState(initialTasks);
    const [activeTask, setActiveTask] = useState<Task | null>(null);

    useEffect(() => {
        setLocalTasks(initialTasks);
    }, [initialTasks]);

    const sensors = useSensors(
        useSensor(PointerSensor, { activationConstraint: { distance: 5 } }),
        useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates })
    );

    const handleDragStart = (event: DragStartEvent) => {
        if (event.active.data.current?.type === "Task") {
            setActiveTask(event.active.data.current.task);
        }
    };

    const handleDragEnd = async (event: DragEndEvent) => {
        const { active, over } = event;
        setActiveTask(null);

        if (!over) return;

        const activeId = active.id as string;
        const activeTask = localTasks.find((t) => t.id === activeId);
        if (!activeTask) return;

        const overData = over.data.current;
        let newStatus: Status | null = null;

        if (overData?.type === "Column") {
            newStatus = overData.columnId as Status;
        } else if (overData?.type === "Task") {
            newStatus = overData.task.status as Status;
        }

        if (newStatus && newStatus !== activeTask.status) {
            setLocalTasks((prev) =>
                prev.map((t) => (t.id === activeId ? { ...t, status: newStatus! } : t))
            );

            if (db) {
                await db
                    .update(tasks)
                    .set({ status: newStatus })
                    .where(eq(tasks.id, activeId));

                if (onUpdate) onUpdate();
            }
        }
    };

    return (
        <div className="h-full overflow-x-auto pb-4">
            <DndContext
                sensors={sensors}
                collisionDetection={closestCorners}
                onDragStart={handleDragStart}
                onDragEnd={handleDragEnd}
            >
                <div className="flex h-full gap-6 min-w-max">
                    <Column id="todo" title="Intake" tasks={localTasks.filter((t) => t.status === "todo")} />
                    <Column id="in-progress" title="Processing" tasks={localTasks.filter((t) => t.status === "in-progress")} />
                    <Column id="done" title="Complete" tasks={localTasks.filter((t) => t.status === "done")} />
                </div>

                <DragOverlay dropAnimation={{
                    sideEffects: defaultDropAnimationSideEffects({
                        styles: {
                            active: { opacity: '0.4' },
                        },
                    }),
                }}>
                    {activeTask ? <TaskCard task={activeTask} isOverlay /> : null}
                </DragOverlay>
            </DndContext>
        </div>
    );
}
