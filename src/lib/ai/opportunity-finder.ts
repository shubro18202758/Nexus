/**
 * Opportunity Finder — Groq-Powered Department Webpage Scraper
 *
 * Searches institution department webpages for research opportunities,
 * internships, and projects relevant to the student's profile.
 *
 * Integrated with the Nexus HYPERPOOL (6-key rotation) for 429-resilient
 * Groq calls. Falls back to GROQ_API_KEY when pool keys aren't set.
 *
 * OPPU POOL: 3 dedicated keys for opportunity search + NL filtering.
 */

import Groq from "groq-sdk";

// ─── Types ────────────────────────────────────────────────────────────────────

export interface Department {
  id: string;
  name: string;
  shortName: string;
  baseUrls: string[];
  keywords: string[];
}

export interface Institution {
  id: string;
  name: string;
  shortName: string;
  departments: Department[];
  website: string;
}

export interface FoundOpportunity {
  id: string;
  title: string;
  description: string;
  type: "research" | "internship" | "project" | "workshop" | "fellowship" | "other";
  department: string;
  institution: string;
  deadline?: string;
  eligibility?: string;
  applicationUrl?: string;
  sourceUrl: string;
  relevanceScore: number;
  tags: string[];
  extractedAt: string;
}

export interface SearchProgress {
  stage: "initializing" | "fetching" | "analyzing" | "filtering" | "complete" | "error";
  currentDepartment?: string;
  currentInstitution?: string;
  progress: number;
  message: string;
  foundCount: number;
}

export interface SearchResult {
  opportunities: FoundOpportunity[];
  searchedDepartments: string[];
  searchedInstitutions: string[];
  totalPagesScanned: number;
  duration: number;
  errors: string[];
}

// ─── Institution Registry ─────────────────────────────────────────────────────

const INSTITUTION_REGISTRY: Institution[] = [
  {
    id: "iitb",
    name: "Indian Institute of Technology Bombay",
    shortName: "IIT Bombay",
    website: "https://www.iitb.ac.in",
    departments: [
      {
        id: "cse",
        name: "Computer Science and Engineering",
        shortName: "CSE",
        baseUrls: [
          "https://www.cse.iitb.ac.in/",
          "https://www.cse.iitb.ac.in/academics/research-areas",
          "https://www.cse.iitb.ac.in/people/faculty",
        ],
        keywords: [
          "research", "internship", "project", "opportunity",
          "fellowship", "position", "opening",
        ],
      },
      {
        id: "physics",
        name: "Department of Physics",
        shortName: "Physics",
        baseUrls: [
          "https://www.phy.iitb.ac.in/",
          "https://www.phy.iitb.ac.in/research-areas",
          "https://www.phy.iitb.ac.in/people",
        ],
        keywords: [
          "research", "internship", "project",
          "fellowship", "position", "quantum",
        ],
      },
    ],
  },
];

// ─── Demo Data ────────────────────────────────────────────────────────────────

const DEMO_OPPORTUNITIES: FoundOpportunity[] = [
  {
    id: "demo-1",
    title: "Machine Learning Research Internship — Prof. Sunita Sarawagi",
    description:
      "Join the ML lab at CSE, IIT Bombay for a 6-month research internship focused on large language models and structured prediction. The position involves working on cutting-edge NLP research with publication opportunities.",
    type: "research",
    department: "Computer Science and Engineering",
    institution: "IIT Bombay",
    deadline: "2025-02-28",
    eligibility: "B.Tech/M.Tech students with strong ML fundamentals",
    applicationUrl: "https://www.cse.iitb.ac.in/~sunita/openings",
    sourceUrl: "https://www.cse.iitb.ac.in/",
    relevanceScore: 95,
    tags: ["machine-learning", "nlp", "research", "internship"],
    extractedAt: new Date().toISOString(),
  },
  {
    id: "demo-2",
    title: "Quantum Computing Research Position — Prof. Sai Vinjanampathy",
    description:
      "Open position for research in quantum information processing and quantum thermodynamics. Looking for motivated students interested in theoretical and computational quantum physics.",
    type: "internship",
    department: "Department of Physics",
    institution: "IIT Bombay",
    deadline: "2025-03-15",
    eligibility: "M.Sc/PhD students with quantum mechanics background",
    applicationUrl: "https://www.phy.iitb.ac.in/~saiv/group",
    sourceUrl: "https://www.phy.iitb.ac.in/",
    relevanceScore: 88,
    tags: ["quantum-computing", "physics", "research"],
    extractedAt: new Date().toISOString(),
  },
  {
    id: "demo-3",
    title: "AI for Healthcare Project — Prof. Amit Sethi",
    description:
      "Collaborative project applying deep learning to medical image analysis. Working with hospitals on real clinical data for cancer detection and diagnosis support systems.",
    type: "project",
    department: "Computer Science and Engineering",
    institution: "IIT Bombay",
    eligibility: "Students with DL experience and interest in healthcare AI",
    applicationUrl: "https://www.cse.iitb.ac.in/~asethi/",
    sourceUrl: "https://www.cse.iitb.ac.in/",
    relevanceScore: 82,
    tags: ["deep-learning", "healthcare", "computer-vision", "project"],
    extractedAt: new Date().toISOString(),
  },
  {
    id: "demo-4",
    title: "Condensed Matter Theory Research — Prof. Vikram Tripathi",
    description:
      "Research opportunities in strongly correlated electron systems and topological materials. Computational and analytical approaches to understanding quantum many-body systems.",
    type: "research",
    department: "Department of Physics",
    institution: "IIT Bombay",
    eligibility: "Physics majors with strong mathematical background",
    sourceUrl: "https://www.phy.iitb.ac.in/",
    relevanceScore: 75,
    tags: ["condensed-matter", "quantum", "theory", "research"],
    extractedAt: new Date().toISOString(),
  },
  {
    id: "demo-5",
    title: "Cybersecurity Workshop Series — CSE Department",
    description:
      "Annual workshop series covering network security, cryptography, and ethical hacking. Includes hands-on labs with industry mentors from leading security firms.",
    type: "workshop",
    department: "Computer Science and Engineering",
    institution: "IIT Bombay",
    deadline: "2025-01-31",
    eligibility: "Open to all CS students",
    applicationUrl: "https://www.cse.iitb.ac.in/events",
    sourceUrl: "https://www.cse.iitb.ac.in/",
    relevanceScore: 70,
    tags: ["cybersecurity", "workshop", "networking"],
    extractedAt: new Date().toISOString(),
  },
  {
    id: "demo-6",
    title: "INSPIRE Fellowship — Department of Science & Technology",
    description:
      "Government fellowship for research in basic and applied sciences. Provides Rs. 80,000/month with additional research grant. IIT Bombay Physics department is a recognized host institution.",
    type: "fellowship",
    department: "Department of Physics",
    institution: "IIT Bombay",
    deadline: "2025-04-30",
    eligibility: "Indian citizens with qualifying exam scores",
    applicationUrl: "https://online-inspire.gov.in/",
    sourceUrl: "https://www.phy.iitb.ac.in/",
    relevanceScore: 90,
    tags: ["fellowship", "government", "funding", "physics"],
    extractedAt: new Date().toISOString(),
  },
];

// ─── Groq Client (HYPERPOOL) ──────────────────────────────────────────────────

const HYPERPOOL_KEYS = [
  process.env.GROQ_INTELHUB_KEY_1,
  process.env.GROQ_INTELHUB_KEY_2,
  process.env.GROQ_INTELHUB_KEY_3,
  process.env.GROQ_CLUBS_KEY_1,
  process.env.GROQ_CLUBS_KEY_2,
  process.env.GROQ_CLUBS_KEY_3,
].filter(Boolean) as string[];

// ─── OPPU Key Pool (Dedicated Opportunity Keys) ──────────────────────────────

const OPPU_KEYS = [
  process.env.OPPU1,
  process.env.OPPU2,
  process.env.OPPU3,
].filter(Boolean) as string[];

let _keyIndex = 0;
let _oppuIndex = 0;

function getGroqClient(apiKey?: string): Groq {
  if (apiKey) return new Groq({ apiKey });

  // Prefer OPPU keys for opportunity-specific calls
  if (OPPU_KEYS.length > 0) {
    const key = OPPU_KEYS[_oppuIndex % OPPU_KEYS.length];
    _oppuIndex++;
    return new Groq({ apiKey: key });
  }

  if (HYPERPOOL_KEYS.length > 0) {
    const key = HYPERPOOL_KEYS[_keyIndex % HYPERPOOL_KEYS.length];
    _keyIndex++;
    return new Groq({ apiKey: key });
  }

  const key = process.env.GROQ_API_KEY;
  if (!key) throw new Error("No Groq API keys — set OPPU1/2/3 or GROQ_INTELHUB_KEY_1/2/3 + GROQ_CLUBS_KEY_1/2/3 or GROQ_API_KEY");
  return new Groq({ apiKey: key });
}

// ─── Webpage Fetcher ──────────────────────────────────────────────────────────

async function fetchWebpage(url: string): Promise<string | null> {
  try {
    const response = await fetch(url, {
      signal: AbortSignal.timeout(10000),
      headers: {
        "User-Agent":
          "Mozilla/5.0 (compatible; NexusOpportunityBot/1.0; +https://nexus-hub.dev)",
      },
    });

    if (!response.ok) return null;

    const html = await response.text();
    // Strip HTML tags, scripts, styles — keep text content
    const text = html
      .replace(/<script[^>]*>[\s\S]*?<\/script>/gi, "")
      .replace(/<style[^>]*>[\s\S]*?<\/style>/gi, "")
      .replace(/<[^>]+>/g, " ")
      .replace(/\s+/g, " ")
      .trim();

    return text.slice(0, 15000); // Limit to 15k chars for Groq context
  } catch (error) {
    console.error(`[opportunity-finder] Failed to fetch ${url}:`, error);
    return null;
  }
}

// ─── AI Analysis ──────────────────────────────────────────────────────────────

async function analyzePageForOpportunities(
  pageContent: string,
  department: Department,
  institution: Institution,
  apiKey?: string,
): Promise<FoundOpportunity[]> {
  const groq = getGroqClient(apiKey);

  try {
    const response = await groq.chat.completions.create({
      model: "llama-3.3-70b-versatile",
      messages: [
        {
          role: "system",
          content: `You are an academic opportunity extraction agent. Analyze webpage content and extract structured data about research opportunities, internships, projects, workshops, and fellowships.

Return a JSON array of opportunities found. Each object must have:
- id: unique string
- title: descriptive title
- description: 2-3 sentence description
- type: one of "research", "internship", "project", "workshop", "fellowship", "other"
- deadline: date string if found, null otherwise
- eligibility: eligibility requirements if found
- applicationUrl: direct application link if found
- tags: array of relevant keyword tags

Only return opportunities that are currently active or upcoming. If no opportunities are found, return an empty array [].
Return ONLY valid JSON, no markdown or explanation.`,
        },
        {
          role: "user",
          content: `Analyze this ${department.name} department page from ${institution.name} for academic opportunities:\n\n${pageContent.slice(0, 8000)}`,
        },
      ],
      temperature: 0.3,
      max_tokens: 2000,
    });

    const raw = response.choices[0]?.message?.content?.trim() || "[]";
    // Attempt to parse JSON (may be wrapped in markdown code fences)
    const jsonStr = raw.replace(/^```\w*\s*/i, "").replace(/```\s*$/, "").trim();
    const parsed = JSON.parse(jsonStr);
    const items = Array.isArray(parsed) ? parsed : [];

    return items.map((item: Record<string, unknown>, idx: number) => ({
      id: `${institution.id}-${department.id}-${idx}-${Date.now()}`,
      title: (item.title as string) || "Untitled Opportunity",
      description: (item.description as string) || "",
      type: (item.type as FoundOpportunity["type"]) || "other",
      department: department.name,
      institution: institution.name,
      deadline: item.deadline as string | undefined,
      eligibility: item.eligibility as string | undefined,
      applicationUrl: item.applicationUrl as string | undefined,
      sourceUrl: department.baseUrls[0],
      relevanceScore: Math.floor(Math.random() * 30) + 70,
      tags: (item.tags as string[]) || [],
      extractedAt: new Date().toISOString(),
    }));
  } catch (error) {
    console.error("[opportunity-finder] Groq analysis failed:", error);
    return [];
  }
}

// ─── Summarize Opportunity ────────────────────────────────────────────────────

export async function summarizeOpportunity(
  opportunity: FoundOpportunity,
  apiKey?: string,
): Promise<string> {
  const groq = getGroqClient(apiKey);

  try {
    const response = await groq.chat.completions.create({
      model: "llama-3.3-70b-versatile",
      messages: [
        {
          role: "user",
          content: `Summarize this academic opportunity in 2-3 sentences for a student:

Title: ${opportunity.title}
Department: ${opportunity.department} at ${opportunity.institution}
Description: ${opportunity.description}
Deadline: ${opportunity.deadline || "Not specified"}

Highlight key requirements and what makes it valuable.`,
        },
      ],
      temperature: 0.5,
      max_tokens: 200,
    });

    return (
      response.choices[0]?.message?.content?.trim() ||
      opportunity.description.slice(0, 200)
    );
  } catch {
    return opportunity.description.slice(0, 200);
  }
}

// ─── Main Search Function ─────────────────────────────────────────────────────

export async function searchOpportunities(
  institutionIds: string[],
  departmentIds: string[],
  onProgress?: (progress: SearchProgress) => void,
  options?: {
    apiKey?: string;
    useDemoData?: boolean;
    studentProfile?: {
      interests: string[];
      skills: string[];
      level: string;
    };
  },
): Promise<SearchResult> {
  const startTime = Date.now();
  const result: SearchResult = {
    opportunities: [],
    searchedDepartments: [],
    searchedInstitutions: [],
    totalPagesScanned: 0,
    duration: 0,
    errors: [],
  };

  // ── Demo mode (presentation / offline) ──
  if (options?.useDemoData) {
    const stages = [
      { stage: "initializing", progress: 10, message: "Initializing search agent..." },
      { stage: "fetching", progress: 30, message: "Fetching CSE department pages...", dept: "Computer Science and Engineering" },
      { stage: "fetching", progress: 50, message: "Fetching Physics department pages...", dept: "Department of Physics" },
      { stage: "analyzing", progress: 70, message: "AI analyzing opportunities..." },
      { stage: "filtering", progress: 90, message: "Filtering by relevance..." },
    ];

    for (const stage of stages) {
      onProgress?.({
        stage: stage.stage as SearchProgress["stage"],
        currentDepartment: stage.dept,
        currentInstitution: "IIT Bombay",
        progress: stage.progress,
        message: stage.message,
        foundCount: stage.progress > 70 ? DEMO_OPPORTUNITIES.length : 0,
      });
      await new Promise((r) => setTimeout(r, 800));
    }

    result.opportunities = DEMO_OPPORTUNITIES;
    result.searchedDepartments = ["Computer Science and Engineering", "Department of Physics"];
    result.searchedInstitutions = ["IIT Bombay"];
    result.totalPagesScanned = 6;
    result.duration = Date.now() - startTime;

    onProgress?.({
      stage: "complete",
      progress: 100,
      message: `Found ${DEMO_OPPORTUNITIES.length} opportunities!`,
      foundCount: DEMO_OPPORTUNITIES.length,
    });

    return result;
  }

  // ── Production mode — actual scraping ──
  onProgress?.({
    stage: "initializing",
    progress: 5,
    message: "Initializing opportunity search...",
    foundCount: 0,
  });

  const institutions = INSTITUTION_REGISTRY.filter((i) =>
    institutionIds.includes(i.id),
  );
  const totalDepts = institutions.reduce(
    (acc, inst) =>
      acc + inst.departments.filter((d) => departmentIds.includes(d.id)).length,
    0,
  );

  let processedDepts = 0;

  for (const institution of institutions) {
    result.searchedInstitutions.push(institution.name);

    const depts = institution.departments.filter((d) =>
      departmentIds.includes(d.id),
    );

    for (const dept of depts) {
      result.searchedDepartments.push(dept.name);

      onProgress?.({
        stage: "fetching",
        currentDepartment: dept.name,
        currentInstitution: institution.shortName,
        progress: Math.floor((processedDepts / totalDepts) * 60) + 10,
        message: `Scanning ${dept.shortName} @ ${institution.shortName}...`,
        foundCount: result.opportunities.length,
      });

      for (const url of dept.baseUrls) {
        const content = await fetchWebpage(url);
        result.totalPagesScanned++;

        if (content) {
          onProgress?.({
            stage: "analyzing",
            currentDepartment: dept.name,
            currentInstitution: institution.shortName,
            progress: Math.floor((processedDepts / totalDepts) * 60) + 40,
            message: `AI analyzing ${dept.shortName} content...`,
            foundCount: result.opportunities.length,
          });

          try {
            const opportunities = await analyzePageForOpportunities(
              content,
              dept,
              institution,
              options?.apiKey,
            );
            result.opportunities.push(...opportunities);
          } catch (error) {
            result.errors.push(`Failed to analyze ${url}: ${error}`);
          }
        }
      }

      processedDepts++;
    }
  }

  // ── Filter & score based on student profile ──
  if (options?.studentProfile) {
    onProgress?.({
      stage: "filtering",
      progress: 85,
      message: "Matching with your profile...",
      foundCount: result.opportunities.length,
    });

    result.opportunities = result.opportunities.map((opp) => {
      const { interests, skills } = options.studentProfile!;
      const oppText =
        `${opp.title} ${opp.description} ${opp.tags.join(" ")}`.toLowerCase();

      const interestMatches = interests.filter((i) =>
        oppText.includes(i.toLowerCase()),
      ).length;
      const skillMatches = skills.filter((s) =>
        oppText.includes(s.toLowerCase()),
      ).length;

      const score = Math.min(100, 50 + interestMatches * 15 + skillMatches * 10);

      return { ...opp, relevanceScore: score };
    });

    // Sort by relevance
    result.opportunities.sort((a, b) => b.relevanceScore - a.relevanceScore);
  }

  result.duration = Date.now() - startTime;

  onProgress?.({
    stage: "complete",
    progress: 100,
    message: `Found ${result.opportunities.length} opportunities!`,
    foundCount: result.opportunities.length,
  });

  return result;
}

// ─── Get Available Institutions & Departments ─────────────────────────────────

export function getAvailableInstitutions(): Institution[] {
  return INSTITUTION_REGISTRY;
}

export function getDepartmentsForInstitution(
  institutionId: string,
): Department[] {
  const inst = INSTITUTION_REGISTRY.find((i) => i.id === institutionId);
  return inst?.departments || [];
}

// ─── Add New Institution (Extensibility) ──────────────────────────────────────

export function registerInstitution(institution: Institution): void {
  const existing = INSTITUTION_REGISTRY.findIndex((i) => i.id === institution.id);
  if (existing >= 0) {
    INSTITUTION_REGISTRY[existing] = institution;
  } else {
    INSTITUTION_REGISTRY.push(institution);
  }
}

export function addDepartmentToInstitution(
  institutionId: string,
  department: Department,
): void {
  const inst = INSTITUTION_REGISTRY.find((i) => i.id === institutionId);
  if (inst) {
    const existing = inst.departments.findIndex((d) => d.id === department.id);
    if (existing >= 0) {
      inst.departments[existing] = department;
    } else {
      inst.departments.push(department);
    }
  }
}

// ─── AI Natural Language Filter ───────────────────────────────────────────────

export interface NLFilterResult {
  filtered: FoundOpportunity[];
  interpretation: string;
  appliedFilters: {
    types?: string[];
    departments?: string[];
    minScore?: number;
    keywords?: string[];
    hasDeadline?: boolean;
  };
}

/**
 * Uses Groq to interpret a natural-language query and filter opportunities.
 * Example queries:
 *   "show me ML internships with high relevance"
 *   "quantum physics research positions"
 *   "anything with a deadline soon"
 *   "projects I can apply to as a B.Tech student"
 */
export async function filterOpportunitiesNL(
  query: string,
  opportunities: FoundOpportunity[],
  apiKey?: string,
): Promise<NLFilterResult> {
  if (!query.trim() || opportunities.length === 0) {
    return {
      filtered: opportunities,
      interpretation: "Showing all opportunities",
      appliedFilters: {},
    };
  }

  const groq = getGroqClient(apiKey);

  const oppSummaries = opportunities.map((o, i) => ({
    idx: i,
    title: o.title,
    type: o.type,
    department: o.department,
    institution: o.institution,
    relevanceScore: o.relevanceScore,
    tags: o.tags,
    deadline: o.deadline || null,
    eligibility: o.eligibility || null,
  }));

  try {
    const response = await groq.chat.completions.create({
      model: "llama-3.3-70b-versatile",
      messages: [
        {
          role: "system",
          content: `You are a smart filter agent for academic opportunities. Given a user's natural language query and a list of opportunities, determine which opportunities match the user's intent.

Return JSON with:
{
  "matchingIndices": [0, 2, 5],        // indices of matching opportunities from the list
  "interpretation": "string",           // 1-sentence explanation of what you understood
  "appliedFilters": {                   // structured breakdown of filters applied
    "types": ["research"],              // opportunity types matched (optional)
    "departments": ["CSE"],             // departments matched (optional)
    "minScore": 80,                     // minimum relevance score if implied (optional)
    "keywords": ["ML", "deep learning"],// key terms extracted (optional)
    "hasDeadline": true                 // whether deadline was important (optional)
  },
  "sortBy": "relevance" | "deadline" | "default"
}

Be generous with matching — if the user says "ML" match anything related to machine learning, AI, deep learning, NLP etc.
If a query is vague like "show me everything", return all indices.
Return ONLY valid JSON.`,
        },
        {
          role: "user",
          content: `Query: "${query}"\n\nOpportunities:\n${JSON.stringify(oppSummaries, null, 2)}`,
        },
      ],
      temperature: 0.2,
      max_tokens: 600,
    });

    const raw = response.choices[0]?.message?.content?.trim() || "{}";
    const jsonStr = raw.replace(/^```\w*\s*/i, "").replace(/```\s*$/, "").trim();
    const parsed = JSON.parse(jsonStr);

    const indices: number[] = Array.isArray(parsed.matchingIndices)
      ? parsed.matchingIndices.filter(
          (i: number) => typeof i === "number" && i >= 0 && i < opportunities.length,
        )
      : opportunities.map((_, i) => i);

    let filtered = indices.map((i) => opportunities[i]);

    // Apply sorting
    if (parsed.sortBy === "relevance") {
      filtered.sort((a, b) => b.relevanceScore - a.relevanceScore);
    } else if (parsed.sortBy === "deadline") {
      filtered.sort((a, b) => {
        if (!a.deadline) return 1;
        if (!b.deadline) return -1;
        return new Date(a.deadline).getTime() - new Date(b.deadline).getTime();
      });
    }

    return {
      filtered,
      interpretation: parsed.interpretation || `Showing ${filtered.length} results for "${query}"`,
      appliedFilters: parsed.appliedFilters || {},
    };
  } catch (error) {
    console.error("[opportunity-finder] NL filter failed:", error);

    // Fallback: simple keyword matching
    const queryLower = query.toLowerCase();
    const keywords = queryLower.split(/\s+/).filter((w) => w.length > 2);

    const filtered = opportunities.filter((opp) => {
      const text =
        `${opp.title} ${opp.description} ${opp.type} ${opp.department} ${opp.tags.join(" ")}`.toLowerCase();
      return keywords.some((kw) => text.includes(kw));
    });

    return {
      filtered: filtered.length > 0 ? filtered : opportunities,
      interpretation: `Keyword search for "${query}" (AI unavailable)`,
      appliedFilters: { keywords },
    };
  }
}

// ─── AI Opportunity Preview / Deep Summary ────────────────────────────────────

export interface OpportunityPreview {
  summary: string;
  highlights: string[];
  matchReason: string;
  suggestedActions: string[];
  skillsRequired: string[];
  estimatedCompetition: "low" | "medium" | "high";
}

/**
 * Generates a rich AI preview for a single opportunity, providing deeper
 * analysis, skill requirements, and personalized advice.
 */
export async function generateOpportunityPreview(
  opportunity: FoundOpportunity,
  studentContext?: string,
  apiKey?: string,
): Promise<OpportunityPreview> {
  const groq = getGroqClient(apiKey);

  try {
    const response = await groq.chat.completions.create({
      model: "llama-3.3-70b-versatile",
      messages: [
        {
          role: "system",
          content: `You are an academic career advisor AI. Generate a detailed preview of an opportunity for a student.

Return JSON with:
{
  "summary": "2-3 sentence rich summary",
  "highlights": ["key highlight 1", "key highlight 2", "key highlight 3"],
  "matchReason": "why this is a good fit",
  "suggestedActions": ["step 1 to apply", "step 2"],
  "skillsRequired": ["skill1", "skill2"],
  "estimatedCompetition": "low" | "medium" | "high"
}
Return ONLY valid JSON.`,
        },
        {
          role: "user",
          content: `Opportunity:
Title: ${opportunity.title}
Type: ${opportunity.type}
Department: ${opportunity.department} at ${opportunity.institution}
Description: ${opportunity.description}
Deadline: ${opportunity.deadline || "Not specified"}
Eligibility: ${opportunity.eligibility || "Not specified"}
Tags: ${opportunity.tags.join(", ")}

${studentContext ? `Student Context: ${studentContext}` : ""}`,
        },
      ],
      temperature: 0.4,
      max_tokens: 500,
    });

    const raw = response.choices[0]?.message?.content?.trim() || "{}";
    const jsonStr = raw.replace(/^```\w*\s*/i, "").replace(/```\s*$/, "").trim();
    const parsed = JSON.parse(jsonStr);

    return {
      summary: parsed.summary || opportunity.description,
      highlights: parsed.highlights || [],
      matchReason: parsed.matchReason || "Relevant to your profile",
      suggestedActions: parsed.suggestedActions || ["Visit the application page"],
      skillsRequired: parsed.skillsRequired || [],
      estimatedCompetition: parsed.estimatedCompetition || "medium",
    };
  } catch (error) {
    console.error("[opportunity-finder] Preview generation failed:", error);
    return {
      summary: opportunity.description,
      highlights: [opportunity.type, opportunity.department, opportunity.institution],
      matchReason: "Matches your search criteria",
      suggestedActions: ["Review the opportunity details", "Visit the application page"],
      skillsRequired: opportunity.tags.slice(0, 3),
      estimatedCompetition: "medium",
    };
  }
}
