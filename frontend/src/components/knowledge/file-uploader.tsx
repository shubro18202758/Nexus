"use client";

import { useState, useCallback } from "react";
import { Upload, FileText, File as FileIcon, X, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress"; // Need to ensure this exists or use native
import { processFile } from "@/lib/file-processing";
import { useRag } from "@/hooks/use-rag";
import { useDb } from "@/components/providers/db-provider";
import { knowledgeItems } from "@/db/schema";
import { cn } from "@/lib/utils";

export function FileUploader() {
    const [isDragging, setIsDragging] = useState(false);
    const [isProcessing, setIsProcessing] = useState(false);
    const [uploadProgress, setUploadProgress] = useState(0);
    const { addDocument } = useRag();
    const { db } = useDb();

    const handleDragOver = useCallback((e: React.DragEvent) => {
        e.preventDefault();
        setIsDragging(true);
    }, []);

    const handleDragLeave = useCallback((e: React.DragEvent) => {
        e.preventDefault();
        setIsDragging(false);
    }, []);

    const handleDrop = useCallback(async (e: React.DragEvent) => {
        e.preventDefault();
        setIsDragging(false);
        const files = Array.from(e.dataTransfer.files);
        await handleFiles(files);
    }, []);

    const handleFileInput = useCallback(async (e: React.ChangeEvent<HTMLInputElement>) => {
        if (e.target.files) {
            const files = Array.from(e.target.files);
            await handleFiles(files);
        }
    }, []);

    const handleFiles = async (files: File[]) => {
        if (!db) return;
        setIsProcessing(true);
        setUploadProgress(0);

        // Use the known default workspace ID from the DB provider context
        const { DEFAULT_WORKSPACE_ID } = await import("@/components/providers/db-provider");
        const workspaceId = DEFAULT_WORKSPACE_ID;

        for (let i = 0; i < files.length; i++) {
            const file = files[i];
            try {
                // 1. Process File (Extract Text)
                const processed = await processFile(file);

                // 2. Index content (RAG) - Handles DB insert internally now
                await addDocument(processed.title, processed.content, workspaceId, file.name);

            } catch (error) {
                console.error("Error processing file:", file.name, error);
            }
            setUploadProgress(((i + 1) / files.length) * 100);
        }

        setIsProcessing(false);
        setUploadProgress(0);
    };

    return (
        <div
            className={cn(
                "border-2 border-dashed rounded-lg p-8 text-center transition-colors",
                isDragging
                    ? "border-primary bg-primary/10"
                    : "border-muted-foreground/25 hover:border-primary/50"
            )}
            onDragOver={handleDragOver}
            onDragLeave={handleDragLeave}
            onDrop={handleDrop}
        >
            <div className="flex flex-col items-center gap-2">
                <div className="bg-muted p-4 rounded-full">
                    {isProcessing ? (
                        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
                    ) : (
                        <Upload className="h-6 w-6 text-muted-foreground" />
                    )}
                </div>
                <h3 className="text-lg font-semibold">
                    {isProcessing ? "Processing files..." : "Upload Knowledge"}
                </h3>
                <p className="text-sm text-muted-foreground max-w-xs mx-auto">
                    Drag & drop PDFs, Text, or Markdown files here to add them to your
                    Knowledge Base.
                </p>

                {isProcessing && (
                    <div className="w-full max-w-xs mt-2">
                        <Progress value={uploadProgress} className="h-2" />
                    </div>
                )}

                {!isProcessing && (
                    <Button variant="outline" className="mt-4 relative overflow-hidden" disabled={isProcessing}>
                        <input
                            type="file"
                            multiple
                            accept=".pdf,.txt,.md"
                            className="absolute inset-0 opacity-0 cursor-pointer"
                            onChange={handleFileInput}
                        />
                        Select Files
                    </Button>
                )}
            </div>
        </div>
    );
}
