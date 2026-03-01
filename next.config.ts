import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  reactCompiler: true,
  // PGlite uses import.meta.url to locate its WASM binary; Turbopack's
  // module transforms break that by producing URL objects where strings
  // are expected.  Marking it external lets it run through native Node.js
  // module resolution, avoiding the "path" TypeError.
  serverExternalPackages: ["@electric-sql/pglite"],
  turbopack: {},
  webpack: (config) => {
    config.resolve.alias.canvas = false;
    config.resolve.alias.encoding = false;
    return config;
  },

  // ===================================================================
  // GPU Acceleration Headers
  // Required for WebGPU + SharedArrayBuffer in Web Workers
  // This enables cross-origin isolation needed by:
  //   - @mlc-ai/web-llm (DeepSeek-R1-Distill-Qwen3-8B via WebGPU)
  //   - @huggingface/transformers (Embeddings + Re-ranking via WebGPU)
  //   - ONNX Runtime Web (WebGPU backend)
  // ===================================================================
  async headers() {
    return [
      {
        source: "/(.*)",
        headers: [
          {
            key: "Cross-Origin-Embedder-Policy",
            value: "credentialless",
          },
          {
            key: "Cross-Origin-Opener-Policy",
            value: "same-origin",
          },
        ],
      },
    ];
  },
};

export default nextConfig;

// Force Restart: 1770881529901