import { LLMEngine, extractJson } from "@/lib/ai/llm-engine";

/**
 * Resource Recommender — Level-Appropriate Article & Implementation Suggestions
 * 
 * Uses the local LLM to generate personalized resource recommendations based on:
 * 1. Current knowledge level (Beginner/Intermediate/Advanced)
 * 2. Learning style (visual, hands-on, theoretical)
 * 3. Specific skill gaps
 * 4. Goal type (job, research, competitive programming, etc.)
 */

export interface ResourceRecommendation {
    title: string;
    url: string;
    type: "article" | "video" | "tutorial" | "documentation" | "project" | "course" | "github";
    difficulty: "beginner" | "intermediate" | "advanced";
    estimated_time: string;
    why_recommended: string;
    implementation_focus: boolean;
    tags: string[];
}

export interface LevelBasedRecommendations {
    for_your_level: ResourceRecommendation[];
    stretch_goals: ResourceRecommendation[];
    foundational_gaps: ResourceRecommendation[];
    implementation_projects: ResourceRecommendation[];
    curated_sequence: string;
    learning_strategy: string;
}

export interface RecommendationRequest {
    topic: string;
    currentLevel: "Beginner" | "Intermediate" | "Advanced";
    learningStyle?: string;
    goalType?: string;
    weakConcepts?: string[];
    strongConcepts?: string[];
    availableTime?: string; // e.g., "2 hours/day"
}

/**
 * Generate level-appropriate resource recommendations using AI.
 * The LLM will suggest real, verifiable resources from known high-quality sources.
 */
export async function generateResourceRecommendations(
    request: RecommendationRequest
): Promise<LevelBasedRecommendations> {
    const engine = LLMEngine.getInstance();

    if (!engine.isReady()) {
        throw new Error("AI Engine not initialized");
    }

    const systemPrompt = `
You are an Expert Learning Resource Curator.
Your job is to recommend HIGH-QUALITY, REAL resources for learning ${request.topic}.

CRITICAL RULES:
1. Only recommend REAL resources from verified high-quality sources:
   - Documentation: MDN, official docs, DevDocs
   - Articles: dev.to, Medium (specific authors like @dan_abramov), FreeCodeCamp, CSS-Tricks, Smashing Magazine
   - Videos: YouTube channels (Fireship, Traversy Media, Web Dev Simplified, The Coding Train, 3Blue1Brown, Tech With Tim)
   - Courses: FreeCodeCamp, The Odin Project, Full Stack Open, CS50, fast.ai
   - GitHub: Awesome lists, popular repos with >1k stars
   - Interactive: Exercism, LeetCode, HackerRank, Codewars

2. Match resources to the user's EXACT level:
   - Beginner: Fundamentals, syntax, basic concepts, guided tutorials
   - Intermediate: Design patterns, best practices, mini-projects, deeper dives
   - Advanced: System design, performance optimization, research papers, OSS contributions

3. Prioritize IMPLEMENTATION over theory:
   - Prefer tutorials with code examples
   - Include project-based learning
   - Suggest hands-on exercises

4. Consider their learning style:
   - Visual learners → videos, diagrams
   - Hands-on → interactive coding, projects
   - Theoretical → documentation, articles

Return STRICTLY JSON (no markdown, no backticks):
{
  "for_your_level": [
    {
      "title": "Exact resource title",
      "url": "https://real-url.com/path",
      "type": "article|video|tutorial|documentation|project|course|github",
      "difficulty": "beginner|intermediate|advanced",
      "estimated_time": "30 mins",
      "why_recommended": "Specific reason tied to their level/gaps",
      "implementation_focus": true,
      "tags": ["tag1", "tag2"]
    }
  ],
  "stretch_goals": [...],
  "foundational_gaps": [...],
  "implementation_projects": [...],
  "curated_sequence": "Start with X, then Y, finally Z because...",
  "learning_strategy": "Specific advice for this learner's profile"
}

Provide 3-4 resources per category. Be specific with URLs — use real paths.
`;

    const userMessage = `
Topic to Learn: ${request.topic}
Current Level: ${request.currentLevel}
Learning Style: ${request.learningStyle || "Mixed (visual + hands-on)"}
Goal: ${request.goalType || "General mastery"}
Weak Areas: ${request.weakConcepts?.join(", ") || "Not specified"}
Strong Areas: ${request.strongConcepts?.join(", ") || "Not specified"}
Available Time: ${request.availableTime || "Flexible"}

Generate personalized, level-appropriate resource recommendations.
Focus on resources that will help with IMPLEMENTATION and practical application.
`;

    try {
        const response = await engine.chat(
            [
                { role: "system", content: systemPrompt },
                { role: "user", content: userMessage }
            ],
            { temperature: 0.3, max_tokens: 4096, json_mode: true }
        );

        return extractJson<LevelBasedRecommendations>(response);
    } catch (error) {
        console.error("[Resource Recommender] Failed:", error);
        throw new Error("Failed to generate recommendations: " + (error as any).message);
    }
}

/**
 * Quick recommendation for a single topic at a specific level.
 * Returns fewer resources but faster.
 */
export async function quickRecommend(
    topic: string,
    level: "Beginner" | "Intermediate" | "Advanced"
): Promise<ResourceRecommendation[]> {
    const engine = LLMEngine.getInstance();

    if (!engine.isReady()) {
        throw new Error("AI Engine not initialized");
    }

    const systemPrompt = `
You are a Learning Resource Expert. Given a topic and skill level, recommend 5 high-quality resources.

Rules:
1. Only recommend REAL resources with valid URLs
2. Match difficulty to the user's level exactly
3. Prioritize implementation/hands-on resources
4. Include mix: 2 articles/docs, 2 videos, 1 project

Return JSON array only:
[
  {
    "title": "Resource name",
    "url": "https://real-url.com",
    "type": "article|video|tutorial|documentation|project",
    "difficulty": "${level.toLowerCase()}",
    "estimated_time": "X mins",
    "why_recommended": "Brief reason",
    "implementation_focus": true/false,
    "tags": ["tag"]
  }
]
`;

    try {
        const response = await engine.chat(
            [
                { role: "system", content: systemPrompt },
                { role: "user", content: `Topic: ${topic}\nLevel: ${level}` }
            ],
            { temperature: 0.3, max_tokens: 2048, json_mode: true }
        );

        return extractJson<ResourceRecommendation[]>(response);
    } catch (error) {
        console.error("[Quick Recommend] Failed:", error);
        return [];
    }
}

/**
 * Generate implementation-focused project suggestions for a topic.
 */
export async function suggestProjects(
    topic: string,
    level: "Beginner" | "Intermediate" | "Advanced",
    existingSkills: string[] = []
): Promise<Array<{
    project_name: string;
    description: string;
    skills_practiced: string[];
    difficulty: string;
    estimated_hours: number;
    starter_repo?: string;
    tutorial_url?: string;
}>> {
    const engine = LLMEngine.getInstance();

    if (!engine.isReady()) {
        throw new Error("AI Engine not initialized");
    }

    const prompt = `
Generate 4 project ideas for learning ${topic} at ${level} level.
User already knows: ${existingSkills.join(", ") || "basics"}

For each project include:
- project_name: Catchy name
- description: 2-3 sentences
- skills_practiced: Array of skills
- difficulty: "${level}"
- estimated_hours: Number
- starter_repo: GitHub template URL if applicable
- tutorial_url: Related tutorial if exists

Scale complexity:
- Beginner: Todo apps, calculators, simple CRUD
- Intermediate: Full-stack apps, API integrations, auth systems
- Advanced: Distributed systems, ML pipelines, performance optimization

Return JSON array only.
`;

    try {
        const response = await engine.chat(
            [{ role: "user", content: prompt }],
            { temperature: 0.4, max_tokens: 2048, json_mode: true }
        );

        return extractJson(response);
    } catch (error) {
        console.error("[Project Suggestions] Failed:", error);
        return [];
    }
}
