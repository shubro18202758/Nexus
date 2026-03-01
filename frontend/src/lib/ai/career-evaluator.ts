import { LLMEngine, extractJson } from "@/lib/ai/llm-engine";

export interface CareerReadiness {
    competition_readiness_score: number;
    internship_readiness_score: number;
    weakest_interview_areas: string[];
    project_portfolio_gap: string[];
    recommended_next_milestone: string;
    estimated_weeks_to_ready: string;
}

export interface CareerBreakdown {
    ml_competitions: number;
    research_internships: number;
    backend_internships: number;
    llm_engineering: number;
    data_science: number;
}

export interface FullCareerEvaluation {
    overall: CareerReadiness;
    breakdown: CareerBreakdown;
}

export async function evaluateCareerReadiness(
    profile: any,
    goalType: string,
    knowledgeState?: any,
    challengeResults?: any
): Promise<FullCareerEvaluation> {
    const engine = LLMEngine.getInstance();

    if (!engine.isReady()) {
        await engine.initialize();
    }

    const systemPrompt = `
You are a Career Readiness Evaluator.
Given a learner's profile and performance data, evaluate their readiness for specific career paths.

Evaluate readiness for:
- ML competitions (Kaggle, etc.)
- Research internships (academic labs)
- Backend internships (SWE roles)
- LLM engineering roles (prompt eng, fine-tuning)
- Data science internships (analytics, modeling)

Score each 0-100. Be brutally honest — inflated scores help nobody.

Return strictly JSON:
{
  "overall": {
    "competition_readiness_score": 0-100,
    "internship_readiness_score": 0-100,
    "weakest_interview_areas": ["area1", "area2", "area3"],
    "project_portfolio_gap": ["missing project type 1", "missing project type 2"],
    "recommended_next_milestone": "Specific actionable milestone",
    "estimated_weeks_to_ready": "X-Y weeks"
  },
  "breakdown": {
    "ml_competitions": 0-100,
    "research_internships": 0-100,
    "backend_internships": 0-100,
    "llm_engineering": 0-100,
    "data_science": 0-100
  }
}
`;

    const userMessage = `
Target Career Path: ${goalType}
Learner Profile: ${JSON.stringify(profile)}
Knowledge Graph State: ${JSON.stringify(knowledgeState || "Not available — infer from profile")}
Challenge Performance: ${JSON.stringify(challengeResults || "No challenges completed yet")}
Learning Velocity: Infer from profile level and domains.
`;

    try {
        const response = await engine.chat(
            [
                { role: "system", content: systemPrompt },
                { role: "user", content: userMessage }
            ],
            { temperature: 0.15, max_tokens: 4096, json_mode: true }
        );

        return extractJson<FullCareerEvaluation>(response);
    } catch (error) {
        console.error("[Knowledge] Career Evaluation Failed:", error);
        throw new Error("Failed to evaluate career readiness.");
    }
}
