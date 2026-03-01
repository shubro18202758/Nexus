"use client";

import { type Editor } from "@tiptap/react";
import {
    Bold,
    Italic,
    Strikethrough,
    Code,
    Heading1,
    Heading2,
    List,
    ListOrdered,
    Quote,
    Undo,
    Redo,
    Sparkles,
    Mic,
    MicOff,
    Maximize,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
import { AiMenu } from "./ai-menu";
import { useSpeechToText } from "@/hooks/use-speech-to-text";
import { cn } from "@/lib/utils";
import { useFocusStore } from "@/hooks/use-focus-store";

interface ToolbarProps {
    editor: Editor | null;
    onAiCommand?: (instruction: string) => void;
    isAiGenerating?: boolean;
}

export function Toolbar({ editor, onAiCommand, isAiGenerating = false }: ToolbarProps) {
    const { isListening, startListening, stopListening, isSupported } = useSpeechToText({
        onResult: (text) => {
            if (editor) {
                // Determine if we need a leading space (simple heuristic)
                const shouldAddSpace = !editor.getText().endsWith(" ") && text.length > 0;
                editor.chain().focus().insertContent((shouldAddSpace ? " " : "") + text).run();
            }
        },
        continuous: true // Keep listening for dictation
    });

    if (!editor) {
        return null;
    }

    const toggleDictation = () => {
        if (isListening) {
            stopListening();
        } else {
            startListening();
        }
    };

    return (
        <div className="border border-input bg-transparent rounded-lg p-1.5 flex flex-wrap items-center gap-1 mb-4 sticky top-4 z-10 backdrop-blur-sm bg-white/80 dark:bg-slate-900/80 shadow-sm">
            <Button
                variant="ghost"
                size="icon"
                className="h-8 w-8"
                onClick={() => editor.chain().focus().toggleBold().run()}
                data-active={editor.isActive("bold")}
            >
                <Bold className="h-4 w-4" />
            </Button>
            {/* ... rest of buttons ... */}
            <Button
                variant="ghost"
                size="icon"
                className="h-8 w-8"
                onClick={() => editor.chain().focus().toggleItalic().run()}
                data-active={editor.isActive("italic")}
            >
                <Italic className="h-4 w-4" />
            </Button>
            <Button
                variant="ghost"
                size="icon"
                className="h-8 w-8"
                onClick={() => editor.chain().focus().toggleStrike().run()}
                data-active={editor.isActive("strike")}
            >
                <Strikethrough className="h-4 w-4" />
            </Button>
            <Button
                variant="ghost"
                size="icon"
                className="h-8 w-8"
                onClick={() => editor.chain().focus().toggleCode().run()}
                data-active={editor.isActive("code")}
            >
                <Code className="h-4 w-4" />
            </Button>

            <Separator orientation="vertical" className="h-6 mx-1" />

            <Button
                variant="ghost"
                size="icon"
                className="h-8 w-8"
                onClick={() => editor.chain().focus().toggleHeading({ level: 1 }).run()}
                data-active={editor.isActive("heading", { level: 1 })}
            >
                <Heading1 className="h-4 w-4" />
            </Button>
            <Button
                variant="ghost"
                size="icon"
                className="h-8 w-8"
                onClick={() => editor.chain().focus().toggleHeading({ level: 2 }).run()}
                data-active={editor.isActive("heading", { level: 2 })}
            >
                <Heading2 className="h-4 w-4" />
            </Button>

            <Separator orientation="vertical" className="h-6 mx-1" />

            <Button
                variant="ghost"
                size="icon"
                className="h-8 w-8"
                onClick={() => editor.chain().focus().toggleBulletList().run()}
                data-active={editor.isActive("bulletList")}
            >
                <List className="h-4 w-4" />
            </Button>
            <Button
                variant="ghost"
                size="icon"
                className="h-8 w-8"
                onClick={() => editor.chain().focus().toggleOrderedList().run()}
                data-active={editor.isActive("orderedList")}
            >
                <ListOrdered className="h-4 w-4" />
            </Button>
            <Button
                variant="ghost"
                size="icon"
                className="h-8 w-8"
                onClick={() => editor.chain().focus().toggleBlockquote().run()}
                data-active={editor.isActive("blockquote")}
            >
                <Quote className="h-4 w-4" />
            </Button>

            <Separator orientation="vertical" className="h-6 mx-1" />

            {/* Dictation Button */}
            {isSupported && (
                <Button
                    variant="ghost"
                    size="icon"
                    className={cn("h-8 w-8 transition-all", isListening && "text-red-500 bg-red-50 hover:bg-red-100 hover:text-red-600 animate-pulse")}
                    onClick={toggleDictation}
                    title={isListening ? "Stop Dictation" : "Start Dictation"}
                >
                    {isListening ? <MicOff className="h-4 w-4" /> : <Mic className="h-4 w-4" />}
                </Button>
            )}

            <Button
                variant="ghost"
                size="icon"
                className="h-8 w-8"
                onClick={() => editor.chain().focus().undo().run()}
                disabled={!editor.can().undo()}
            >
                <Undo className="h-4 w-4" />
            </Button>
            <Button
                variant="ghost"
                size="icon"
                className="h-8 w-8"
                onClick={() => editor.chain().focus().redo().run()}
                disabled={!editor.can().redo()}
            >
                <Redo className="h-4 w-4" />
            </Button>

            <div className="flex-1" />

            <Button
                variant="ghost"
                size="sm"
                className="h-8 px-2 text-xs text-muted-foreground hover:text-foreground mr-2"
                onClick={() => useFocusStore.getState().toggleFocusMode()}
            >
                <Maximize className="h-4 w-4 mr-1.5" />
                Focus
            </Button>

            {onAiCommand && (
                <AiMenu onSelect={onAiCommand} isGenerating={isAiGenerating} />
            )}
        </div>
    );
}
