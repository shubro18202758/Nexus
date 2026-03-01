"use client";

import { useEditor, EditorContent } from "@tiptap/react";
import StarterKit from "@tiptap/starter-kit";
import Placeholder from "@tiptap/extension-placeholder";
import { Toolbar } from "./toolbar";
import { SlashMenu } from "./slash-commands";
import { useEditorAi } from "@/hooks/use-editor-ai";


interface EditorProps {
    content: string;
    onChange: (html: string) => void;
    // Removed old prop as we handle it internally now or pass a config
    // onAiAssist?: () => void; 
}

export function Editor({ content, onChange }: EditorProps) {
    const { generateText, isGenerating } = useEditorAi();

    const editor = useEditor({
        immediatelyRender: false,
        extensions: [
            StarterKit.configure({
                heading: {
                    levels: [1, 2, 3],
                },
            }),
            Placeholder.configure({
                placeholder: "Start writing or type '/' for commands...",
            }),
        ],
        content: content,
        editorProps: {
            attributes: {
                class: "prose prose-sm sm:prose-base dark:prose-invert max-w-none focus:outline-none min-h-[400px]",
            },
        },
        onUpdate: ({ editor }) => {
            onChange(editor.getHTML());
        },
    });

    const handleAiCommand = async (instruction: string) => {
        if (!editor) return;

        const { from, to, empty } = editor.state.selection;
        // If selection is empty, use surrounding paragraph or last X chars?
        // For now, if empty, we might use the whole doc or the previous paragraph.
        // Let's use the whole document context but append at cursor if 'Continue writing'.

        const context = empty ? editor.getText() : editor.state.doc.textBetween(from, to, " ");
        const selectedText = empty ? "" : context;

        let finalInstruction = instruction;
        if (empty && instruction === "Summarize this") {
            // Summarize whole doc
            finalInstruction = "Summarize the entire document.";
        }

        const result = await generateText(finalInstruction, context);

        if (result) {
            if (empty) {
                // If continue writing, append
                editor.chain().focus().insertContent(" " + result).run();
            } else {
                // If selection, replace or append?
                // Usually replace for "Fix grammar", append for others?
                // Let's replace for now as that's standard for "Fix/Rewrite".
                if (instruction.includes("Fix") || instruction.includes("Make")) {
                    editor.chain().focus().deleteSelection().insertContent(result).run();
                } else {
                    // Summarize -> Append
                    editor.chain().focus().insertContent("\n\n**Summary:** " + result).run();
                }
            }
        }
    };

    return (
        <div className="flex flex-col w-full max-w-4xl mx-auto">
            <Toolbar
                editor={editor}
                onAiCommand={handleAiCommand}
                isAiGenerating={isGenerating}
            />
            <div className="border rounded-xl p-8 min-h-[600px] bg-white dark:bg-slate-900 shadow-[0_2px_15px_-3px_rgba(0,0,0,0.07),0_10px_20px_-2px_rgba(0,0,0,0.04)] transition-all hover:shadow-[0_4px_20px_-2px_rgba(0,0,0,0.1)]">
                <EditorContent editor={editor} />
            </div>
            {editor && <SlashMenu editor={editor} />}
        </div>
    );
}
