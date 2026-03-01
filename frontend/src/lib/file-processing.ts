// import * as pdfjsLib from 'pdfjs-dist';

export interface ProcessedDocument {
    title: string;
    content: string;
    type: 'pdf' | 'text' | 'markdown';
}

export async function processFile(file: File): Promise<ProcessedDocument> {
    if (file.type === 'application/pdf') {
        return processPdf(file);
    } else if (file.type === 'text/plain' || file.name.endsWith('.md')) {
        return processText(file);
    }
    throw new Error('Unsupported file type');
}

async function processText(file: File): Promise<ProcessedDocument> {
    const text = await file.text();
    return {
        title: file.name,
        content: text,
        type: file.name.endsWith('.md') ? 'markdown' : 'text',
    };
}

async function processPdf(file: File): Promise<ProcessedDocument> {
    // PDF processing is currently disabled to prevent build issues with pdfjs-dist in SSR/Node environment.
    // To enable, we need to fix the canvas dependency or move this to a separate worker file.

    return {
        title: file.name,
        content: "PDF content extraction is currently disabled during build debugging. Please upload .txt or .md files.",
        type: 'pdf',
    };
}

export function chunkText(text: string, chunkSize: number = 500, overlap: number = 50): string[] {
    const words = text.split(' ');
    const chunks: string[] = [];
    let currentChunk: string[] = [];

    for (const word of words) {
        currentChunk.push(word);
        if (currentChunk.length >= chunkSize) {
            chunks.push(currentChunk.join(' '));
            // Overlap
            currentChunk = currentChunk.slice(chunkSize - overlap);
        }
    }

    if (currentChunk.length > 0) {
        chunks.push(currentChunk.join(' '));
    }

    return chunks;
}
