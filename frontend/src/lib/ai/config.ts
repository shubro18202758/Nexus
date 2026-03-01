// ==============================================
// 🧠 NEURAL ENGINE CONFIGURATION
// ==============================================
// STRICT ENFORCEMENT PROTOCOL
// This configuration is locked. Do not modify without explicit user consent.

export const AI_CONFIG = {
    // The exact model alias used in Ollama (Server-Side)
    // Corresponds to DeepSeek-R1-Distill-Qwen-8B architecture
    LOCAL_MODEL_NAME: "deepseek-r1-distill-qwen-8b",

    // The corresponding WebLLM model ID (Client-Side / WebGPU)
    // Used for consistency checks, though runtimes differ
    WEB_MODEL_NAME: "DeepSeek-R1-0528-Qwen3-8B-q4f16_1-MLC",

    // Configuration settings
    TEMPERATURE: 0.1,
    BASE_URL: "http://localhost:11434/v1",
} as const;
