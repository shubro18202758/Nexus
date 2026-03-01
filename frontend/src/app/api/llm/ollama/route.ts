import { NextRequest, NextResponse } from "next/server";

// ===================================================================
// Ollama Proxy — Server-side relay for local Ollama calls
//
// Keeps Ollama requests entirely server-side, eliminating browser CORS
// issues caused by Cross-Origin-Embedder-Policy headers in next.config.ts.
// The LLMEngine calls this route instead of fetching localhost:11434 directly.
// ===================================================================

const OLLAMA_BASE = process.env.OLLAMA_BASE_URL || "http://localhost:11434";

/** Strip <think>...</think> reasoning tokens from DeepSeek R1 output. */
function stripThinkingTokens(text: string): string {
    return text.replace(/<think>[\s\S]*?<\/think>/g, "").trim();
}

export async function POST(req: NextRequest) {
    try {
        const body = await req.json();
        const {
            model,
            messages,
            temperature = 0.6,
            max_tokens = 4096,
            stream = false,
            options = {},
        } = body;

        if (!model) {
            return NextResponse.json(
                { error: "model is required" },
                { status: 400 }
            );
        }

        if (!Array.isArray(messages) || messages.length === 0) {
            return NextResponse.json(
                { error: "messages array is required" },
                { status: 400 }
            );
        }

        const response = await fetch(`${OLLAMA_BASE}/v1/chat/completions`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
                model,
                messages,
                temperature,
                max_tokens,
                stream,
                options,
            }),
            // 5 min timeout for heavy R1 reasoning
            signal: AbortSignal.timeout(5 * 60 * 1000),
        });

        if (!response.ok) {
            const errText = await response.text();
            console.error(
                `[Ollama Proxy] Error ${response.status}:`,
                errText
            );
            return NextResponse.json(
                { error: `Ollama error: ${response.status}`, details: errText },
                { status: response.status }
            );
        }

        const data = await response.json();

        const rawContent = data.choices?.[0]?.message?.content || "";
        const content = stripThinkingTokens(rawContent);

        return NextResponse.json({
            content,
            model: data.model,
            usage: data.usage,
            // Pass through fully — client may need raw choices too
            choices: data.choices,
        });
    } catch (error: any) {
        if (error?.name === "TimeoutError" || error?.message?.includes("timed out")) {
            console.error("[Ollama Proxy] Request timed out (5 min)");
            return NextResponse.json(
                { error: "Ollama request timed out after 5 minutes" },
                { status: 504 }
            );
        }
        if (error?.cause?.code === "ECONNREFUSED") {
            console.error("[Ollama Proxy] Ollama not running at", OLLAMA_BASE);
            return NextResponse.json(
                { error: `Ollama not reachable at ${OLLAMA_BASE}. Start with: ollama serve` },
                { status: 503 }
            );
        }
        console.error("[Ollama Proxy] Error:", error);
        return NextResponse.json(
            { error: "Internal server error" },
            { status: 500 }
        );
    }
}

/** Health check — verifies Ollama is reachable */
export async function GET() {
    try {
        const res = await fetch(`${OLLAMA_BASE}/api/tags`, {
            signal: AbortSignal.timeout(5000),
        });
        if (!res.ok) {
            return NextResponse.json({ status: "error", message: `Ollama returned ${res.status}` }, { status: 502 });
        }
        const data = await res.json();
        return NextResponse.json({
            status: "ok",
            models: data.models?.map((m: any) => m.name) || [],
        });
    } catch {
        return NextResponse.json(
            { status: "error", message: `Ollama not reachable at ${OLLAMA_BASE}` },
            { status: 503 }
        );
    }
}
