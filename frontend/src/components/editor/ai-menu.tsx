"use client";

import { Sparkles, AlignLeft, Wand2, Type } from "lucide-react";
import {
    Command,
    CommandGroup,
    CommandItem,
    CommandList,
    CommandInput,
} from "@/components/ui/command";
import {
    Popover,
    PopoverContent,
    PopoverTrigger,
} from "@/components/ui/popover";
import { Button } from "@/components/ui/button";

interface AiMenuProps {
    onSelect: (instruction: string) => void;
    isGenerating: boolean;
}

export function AiMenu({ onSelect, isGenerating }: AiMenuProps) {
    return (
        <Popover>
            <PopoverTrigger asChild>
                <Button
                    size="sm"
                    className="bg-purple-600 hover:bg-purple-700 text-white gap-2 h-8"
                    disabled={isGenerating}
                >
                    <Sparkles className="h-3.5 w-3.5" />
                    <span className="hidden sm:inline">
                        {isGenerating ? "Generating..." : "AI Assist"}
                    </span>
                </Button>
            </PopoverTrigger>
            <PopoverContent className="p-0 w-[250px]" align="start">
                <Command>
                    <CommandInput placeholder="Ask AI to..." />
                    <CommandList>
                        <CommandGroup heading="Edit & Refine">
                            <CommandItem onSelect={() => onSelect("Fix grammar and spelling")}>
                                <Type className="mr-2 h-4 w-4" />
                                Fix Grammar
                            </CommandItem>
                            <CommandItem onSelect={() => onSelect("Make it more formal")}>
                                <Wand2 className="mr-2 h-4 w-4" />
                                Make Formal
                            </CommandItem>
                            <CommandItem onSelect={() => onSelect("Summarize this")}>
                                <AlignLeft className="mr-2 h-4 w-4" />
                                Summarize
                            </CommandItem>
                        </CommandGroup>
                        <CommandGroup heading="Drafting">
                            <CommandItem onSelect={() => onSelect("Continue writing")}>
                                <Sparkles className="mr-2 h-4 w-4" />
                                Continue Writing
                            </CommandItem>
                        </CommandGroup>
                    </CommandList>
                </Command>
            </PopoverContent>
        </Popover>
    );
}
