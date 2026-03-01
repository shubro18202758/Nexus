import { defineConfig } from "drizzle-kit";

export default defineConfig({
    schema: "./src/db/schema.ts",
    out: "./drizzle",
    dialect: "postgresql",
    dbCredentials: {
        url: "postgres://placeholder:placeholder@localhost:5432/placeholder", // PGlite doesn't use this for generation
    },
});
