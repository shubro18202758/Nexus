/**
 * Opportunity Finder - Groq-Powered Department Webpage Scraper
 * 
 * Searches institution department webpages for research opportunities,
 * internships, and projects relevant to the student's profile.
 * 
 * Architecture: Extensible backend supporting multiple institutions/departments.
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
  location: string;
  departments: Department[];
  logo?: string;
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
  progress: number; // 0-100
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

// ─── Institution Registry (Extensible) ────────────────────────────────────────

export const INSTITUTION_REGISTRY: Institution[] = [
  {
    id: "iit-bombay",
    name: "Indian Institute of Technology Bombay",
    shortName: "IIT Bombay",
    location: "Mumbai, Maharashtra",
    departments: [
      {
        id: "cse",
        name: "Computer Science and Engineering",
        shortName: "CSE",
        baseUrls: [
          "https://www.cse.iitb.ac.in/",
          "https://www.cse.iitb.ac.in/page/research-areas",
          "https://www.cse.iitb.ac.in/page/internships",
        ],
        keywords: ["machine learning", "AI", "algorithms", "systems", "networks", "security", "data science"],
      },
      {
        id: "physics",
        name: "Department of Physics",
        shortName: "Physics",
        baseUrls: [
          "https://www.phy.iitb.ac.in/",
          "https://www.phy.iitb.ac.in/research",
          "https://www.phy.iitb.ac.in/opportunities",
        ],
        keywords: ["quantum", "condensed matter", "astrophysics", "particle physics", "optics", "materials"],
      },
    ],
  },
];

// ─── Demo/Mock Data for Presentation ──────────────────────────────────────────

const DEMO_OPPORTUNITIES: FoundOpportunity[] = [
  {
    id: "opp-1",
    title: "Summer Research Fellowship in Machine Learning",
    description: "Work with Prof. Ganesh Ramakrishnan's group on large language models and retrieval-augmented generation. The project involves developing novel architectures for efficient knowledge retrieval in LLMs. Ideal for students with strong programming skills and interest in NLP.",
    type: "research",
    department: "Computer Science and Engineering",
    institution: "IIT Bombay",
    deadline: "March 15, 2026",
    eligibility: "Pre-final/Final year B.Tech/M.Tech students with CGPA > 8.0",
    applicationUrl: "https://www.cse.iitb.ac.in/apply/summer-research",
    sourceUrl: "https://www.cse.iitb.ac.in/page/internships",
    relevanceScore: 95,
    tags: ["ML", "NLP", "LLM", "Research"],
    extractedAt: new Date().toISOString(),
  },
  {
    id: "opp-2",
    title: "Quantum Computing Research Internship",
    description: "Join the Quantum Information and Computing lab for a 3-month internship on quantum error correction codes. Work on implementing surface codes using IBM Qiskit framework. Prior knowledge of quantum mechanics and linear algebra required.",
    type: "internship",
    department: "Department of Physics",
    institution: "IIT Bombay",
    deadline: "April 1, 2026",
    eligibility: "M.Sc. Physics or B.Tech with Physics minor",
    applicationUrl: "https://www.phy.iitb.ac.in/qic-apply",
    sourceUrl: "https://www.phy.iitb.ac.in/opportunities",
    relevanceScore: 88,
    tags: ["Quantum", "Computing", "Research"],
    extractedAt: new Date().toISOString(),
  },
  {
    id: "opp-3",
    title: "AI for Healthcare Project Assistantship",
    description: "Assist in developing deep learning models for medical image analysis. The project focuses on early detection of diabetic retinopathy using fundus images. Involves data preprocessing, model training, and clinical validation.",
    type: "project",
    department: "Computer Science and Engineering",
    institution: "IIT Bombay",
    deadline: "March 30, 2026",
    eligibility: "Knowledge of PyTorch/TensorFlow, Computer Vision fundamentals",
    applicationUrl: "https://www.cse.iitb.ac.in/ai-health",
    sourceUrl: "https://www.cse.iitb.ac.in/page/research-areas",
    relevanceScore: 92,
    tags: ["AI", "Healthcare", "Deep Learning", "CV"],
    extractedAt: new Date().toISOString(),
  },
  {
    id: "opp-4",
    title: "Condensed Matter Theory Research Position",
    description: "Open position for theoretical research in topological phases of matter. The project involves analytical and numerical study of quantum spin liquids. DMRG and tensor network experience is a plus.",
    type: "research",
    department: "Department of Physics",
    institution: "IIT Bombay",
    deadline: "Rolling",
    eligibility: "Strong background in quantum mechanics and statistical mechanics",
    sourceUrl: "https://www.phy.iitb.ac.in/research",
    relevanceScore: 75,
    tags: ["Theory", "Condensed Matter", "Quantum"],
    extractedAt: new Date().toISOString(),
  },
  {
    id: "opp-5",
    title: "Systems Security Workshop - CTF Training",
    description: "Intensive 2-week workshop on offensive security techniques. Learn binary exploitation, web security, cryptographic attacks, and reverse engineering. Preparation for Inter-IIT CTF competition.",
    type: "workshop",
    department: "Computer Science and Engineering",
    institution: "IIT Bombay",
    deadline: "March 10, 2026",
    eligibility: "Open to all undergraduate students",
    applicationUrl: "https://www.cse.iitb.ac.in/ctf-workshop",
    sourceUrl: "https://www.cse.iitb.ac.in/",
    relevanceScore: 85,
    tags: ["Security", "CTF", "Workshop"],
    extractedAt: new Date().toISOString(),
  },
  {
    id: "opp-6",
    title: "INSPIRE Fellowship - Physics Research",
    description: "DST INSPIRE fellowship opportunity for Physics research projects. Stipend of ₹80,000/month for selected candidates. Projects available in High Energy Physics, Astrophysics, and Condensed Matter.",
    type: "fellowship",
    department: "Department of Physics",
    institution: "IIT Bombay",
    deadline: "April 15, 2026",
    eligibility: "Top 1% in qualifying examination",
    applicationUrl: "https://www.phy.iitb.ac.in/inspire",
    sourceUrl: "https://www.phy.iitb.ac.in/opportunities",
    relevanceScore: 80,
    tags: ["Fellowship", "Stipend", "DST"],
    extractedAt: new Date().toISOString(),
  },
];

// ─── Groq Client ──────────────────────────────────────────────────────────────

let groqClient: Groq | null = null;

function getGroqClient(apiKey?: string): Groq {
  if (groqClient) return groqClient;
  
  const key = apiKey || process.env.GROQ_API_KEY;
  if (!key) throw new Error("GROQ_API_KEY not set");
  
  groqClient = new Groq({ apiKey: key });
  return groqClient;
}

// ─── Web Fetching ─────────────────────────────────────────────────────────────

async function fetchWebpage(url: string): Promise<string | null> {
  try {
    const response = await fetch(url, {
      headers: {
        "User-Agent": "Mozilla/5.0 (compatible; SlingshotBot/1.0; +https://slingshot.edu)",
      },
      signal: AbortSignal.timeout(10000),
    });
    
    if (!response.ok) return null;
    
    const html = await response.text();
    // Strip HTML tags for text content
    return html.replace(/<[^>]*>/g, " ").replace(/\s+/g, " ").trim().slice(0, 15000);
  } catch {
    return null;
  }
}

// ─── Groq Analysis ────────────────────────────────────────────────────────────

async function analyzePageForOpportunities(
  content: string,
  department: Department,
  institution: Institution,
  apiKey?: string
): Promise<FoundOpportunity[]> {
  const groq = getGroqClient(apiKey);
  
  const prompt = `You are an expert at extracting academic opportunities from institutional webpages.

Analyze the following webpage content from ${institution.name}, ${department.name} department.

Extract ALL opportunities such as:
- Research positions
- Internships
- Project assistantships
- Workshops
- Fellowships
- Scholarships

For each opportunity found, extract:
1. Title
2. Description (detailed)
3. Type (research/internship/project/workshop/fellowship/other)
4. Deadline (if mentioned)
5. Eligibility criteria
6. Application URL (if any)
7. Relevant tags/keywords

Webpage Content:
${content.slice(0, 12000)}

Return a JSON array of opportunities. If no opportunities found, return empty array [].
Format: [{"title": "...", "description": "...", "type": "...", "deadline": "...", "eligibility": "...", "applicationUrl": "...", "tags": [...]}]

Only return the JSON array, no other text.`;

  try {
    const response = await groq.chat.completions.create({
      model: "llama-3.3-70b-versatile",
      messages: [{ role: "user", content: prompt }],
      temperature: 0.3,
      max_tokens: 4000,
    });
    
    const text = response.choices[0]?.message?.content?.trim() || "[]";
    
    // Extract JSON from response
    const jsonMatch = text.match(/\[[\s\S]*\]/);
    if (!jsonMatch) return [];
    
    const parsed = JSON.parse(jsonMatch[0]) as Array<{
      title: string;
      description: string;
      type: string;
      deadline?: string;
      eligibility?: string;
      applicationUrl?: string;
      tags?: string[];
    }>;
    
    return parsed.map((item, idx) => ({
      id: `opp-${Date.now()}-${idx}`,
      title: item.title || "Untitled Opportunity",
      description: item.description || "",
      type: (item.type || "other") as FoundOpportunity["type"],
      department: department.name,
      institution: institution.name,
      deadline: item.deadline,
      eligibility: item.eligibility,
      applicationUrl: item.applicationUrl,
      sourceUrl: department.baseUrls[0],
      relevanceScore: Math.floor(Math.random() * 30) + 70, // Will be refined based on student profile
      tags: item.tags || [],
      extractedAt: new Date().toISOString(),
    }));
  } catch (error) {
    console.error("Groq analysis failed:", error);
    return [];
  }
}

// ─── Summarize Opportunity ────────────────────────────────────────────────────

export async function summarizeOpportunity(
  opportunity: FoundOpportunity,
  apiKey?: string
): Promise<string> {
  const groq = getGroqClient(apiKey);
  
  try {
    const response = await groq.chat.completions.create({
      model: "llama-3.3-70b-versatile",
      messages: [{
        role: "user",
        content: `Summarize this academic opportunity in 2-3 sentences for a student:

Title: ${opportunity.title}
Department: ${opportunity.department} at ${opportunity.institution}
Description: ${opportunity.description}
Deadline: ${opportunity.deadline || "Not specified"}

Highlight key requirements and what makes it valuable.`
      }],
      temperature: 0.5,
      max_tokens: 200,
    });
    
    return response.choices[0]?.message?.content?.trim() || opportunity.description.slice(0, 200);
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
  }
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
  
  // Demo mode for presentation
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
      await new Promise(r => setTimeout(r, 800));
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
  
  // Production mode - actual scraping
  onProgress?.({
    stage: "initializing",
    progress: 5,
    message: "Initializing opportunity search...",
    foundCount: 0,
  });
  
  const institutions = INSTITUTION_REGISTRY.filter(i => institutionIds.includes(i.id));
  const totalDepts = institutions.reduce((acc, inst) => 
    acc + inst.departments.filter(d => departmentIds.includes(d.id)).length, 0);
  
  let processedDepts = 0;
  
  for (const institution of institutions) {
    result.searchedInstitutions.push(institution.name);
    
    const depts = institution.departments.filter(d => departmentIds.includes(d.id));
    
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
              options?.apiKey
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
  
  // Filter and score based on student profile
  if (options?.studentProfile) {
    onProgress?.({
      stage: "filtering",
      progress: 85,
      message: "Matching with your profile...",
      foundCount: result.opportunities.length,
    });
    
    result.opportunities = result.opportunities.map(opp => {
      const { interests, skills } = options.studentProfile!;
      const oppText = `${opp.title} ${opp.description} ${opp.tags.join(" ")}`.toLowerCase();
      
      const interestMatches = interests.filter(i => oppText.includes(i.toLowerCase())).length;
      const skillMatches = skills.filter(s => oppText.includes(s.toLowerCase())).length;
      
      const score = Math.min(100, 50 + (interestMatches * 15) + (skillMatches * 10));
      
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

export function getDepartmentsForInstitution(institutionId: string): Department[] {
  const inst = INSTITUTION_REGISTRY.find(i => i.id === institutionId);
  return inst?.departments || [];
}

// ─── Add New Institution (Extensibility) ──────────────────────────────────────

export function registerInstitution(institution: Institution): void {
  const existing = INSTITUTION_REGISTRY.findIndex(i => i.id === institution.id);
  if (existing >= 0) {
    INSTITUTION_REGISTRY[existing] = institution;
  } else {
    INSTITUTION_REGISTRY.push(institution);
  }
}

export function addDepartmentToInstitution(institutionId: string, department: Department): void {
  const inst = INSTITUTION_REGISTRY.find(i => i.id === institutionId);
  if (inst) {
    const existing = inst.departments.findIndex(d => d.id === department.id);
    if (existing >= 0) {
      inst.departments[existing] = department;
    } else {
      inst.departments.push(department);
    }
  }
}
