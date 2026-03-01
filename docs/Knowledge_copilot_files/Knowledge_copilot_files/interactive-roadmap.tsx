"use client";

import { useState, useCallback, useMemo, memo } from 'react';
import {
    ReactFlow,
    Controls,
    Background,
    MiniMap,
    useNodesState,
    useEdgesState,
    type Node,
    type Edge,
    Handle,
    Position,
    MarkerType,
    type NodeProps,
} from '@xyflow/react';
import '@xyflow/react/dist/style.css';
import { motion, AnimatePresence } from 'framer-motion';
import {
    Loader2,
    Zap,
    LayoutDashboard,
    X,
    BookOpen,
    Youtube,
    FileText,
    Code,
    ExternalLink,
    Clock,
    Target,
    Sparkles,
    CheckCircle2,
    Lock,
    Play,
    ChevronRight,
    Lightbulb,
    Layers,
    TrendingUp,
    Rocket,
    GraduationCap,
    Search,
    Brain,
    Link2,
    Plus,
    GitBranch,
    AlertTriangle,
    Timer
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Progress } from '@/components/ui/progress';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetDescription } from '@/components/ui/sheet';
import { toast } from 'sonner';
import { type RoadmapGraph, type RoadmapNode } from '@/lib/ai/roadmap-architect';
import { saveRoadmap } from '@/app/actions/roadmap-actions';
import { getLearningProfile } from '@/app/actions/profile-actions';
import { searchForLearningResources } from '@/app/actions/analysis-actions';
import {
    generateResourceRecommendations,
    suggestProjects,
    type LevelBasedRecommendations,
    type RecommendationRequest
} from '@/lib/ai/resource-recommender';
import { cn } from '@/lib/utils';

// Type definitions for node data
interface RoadmapNodeData extends Record<string, unknown> {
    label: string;
    description: string;
    status: 'completed' | 'in-progress' | 'next' | 'locked';
    nodeType: 'concept' | 'project' | 'milestone';
    onClick: () => void;
}

// Checkpoint node data (for external resources like Medium articles, YouTube videos)
interface CheckpointNodeData extends Record<string, unknown> {
    label: string;
    description: string;
    sourceUrl: string;
    sourceType: 'article' | 'video' | 'blog' | 'tutorial';
    aiComment: string;
    prerequisites: string[];
    parentNodeId: string;
    onClick: () => void;
}

// Custom Node Component - roadmap.sh style
const RoadmapNodeComponent = memo(({ data, selected }: NodeProps) => {
    const nodeData = data as RoadmapNodeData;
    const { label, description, status, nodeType, onClick } = nodeData;

    const statusConfig = {
        completed: {
            bg: 'bg-emerald-900/80',
            border: 'border-emerald-500',
            icon: CheckCircle2,
            iconColor: 'text-emerald-400',
            glow: 'shadow-emerald-500/20',
        },
        'in-progress': {
            bg: 'bg-blue-900/80',
            border: 'border-blue-500',
            icon: Play,
            iconColor: 'text-blue-400',
            glow: 'shadow-blue-500/30',
        },
        next: {
            bg: 'bg-amber-900/80',
            border: 'border-amber-500',
            icon: Target,
            iconColor: 'text-amber-400',
            glow: 'shadow-amber-500/30',
        },
        locked: {
            bg: 'bg-zinc-800/80',
            border: 'border-zinc-600',
            icon: Lock,
            iconColor: 'text-zinc-500',
            glow: '',
        },
    };

    const typeIcons = {
        concept: Brain,
        project: Rocket,
        milestone: GraduationCap,
    };

    const config = statusConfig[status];
    const TypeIcon = typeIcons[nodeType] || Brain;
    const StatusIcon = config.icon;

    return (
        <div
            className={cn(
                "relative px-4 py-3 rounded-xl border-2 backdrop-blur-md cursor-pointer transition-all duration-200",
                "hover:scale-105 hover:shadow-lg min-w-[180px] max-w-[220px]",
                config.bg,
                config.border,
                config.glow && `shadow-lg ${config.glow}`,
                selected && "ring-2 ring-purple-400 ring-offset-2 ring-offset-black"
            )}
            onClick={onClick}
        >
            <Handle type="target" position={Position.Top} className="!bg-purple-500 !w-3 !h-3 !border-2 !border-black" />

            <div className="flex items-start gap-2">
                <div className={cn("p-1.5 rounded-lg bg-black/40", config.iconColor)}>
                    <TypeIcon className="h-4 w-4" />
                </div>
                <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-1.5 mb-1">
                        <StatusIcon className={cn("h-3 w-3", config.iconColor)} />
                        <h3 className="text-sm font-semibold text-white truncate">{label}</h3>
                    </div>
                    {description && (
                        <p className="text-[10px] text-white/60 line-clamp-2">{description}</p>
                    )}
                </div>
            </div>

            <Handle type="source" position={Position.Bottom} className="!bg-purple-500 !w-3 !h-3 !border-2 !border-black" />
        </div>
    );
});
RoadmapNodeComponent.displayName = 'RoadmapNodeComponent';

// Checkpoint Node Component - for external resources (Medium, YouTube, etc.)
const CheckpointNodeComponent = memo(({ data, selected }: NodeProps) => {
    const checkpointData = data as CheckpointNodeData;
    const { label, description, sourceType, aiComment, sourceUrl, onClick } = checkpointData;

    const sourceConfig = {
        article: { icon: FileText, color: 'text-orange-400', bg: 'bg-orange-500/20', border: 'border-orange-500/50' },
        video: { icon: Youtube, color: 'text-red-400', bg: 'bg-red-500/20', border: 'border-red-500/50' },
        blog: { icon: FileText, color: 'text-pink-400', bg: 'bg-pink-500/20', border: 'border-pink-500/50' },
        tutorial: { icon: Code, color: 'text-cyan-400', bg: 'bg-cyan-500/20', border: 'border-cyan-500/50' },
    };

    const config = sourceConfig[sourceType] || sourceConfig.article;
    const SourceIcon = config.icon;

    return (
        <div
            className={cn(
                "relative px-4 py-3 rounded-xl border-2 border-dashed backdrop-blur-md cursor-pointer transition-all duration-200",
                "hover:scale-105 hover:shadow-lg min-w-[200px] max-w-[240px]",
                config.bg,
                config.border,
                "shadow-lg shadow-orange-500/10",
                selected && "ring-2 ring-orange-400 ring-offset-2 ring-offset-black"
            )}
            onClick={onClick}
        >
            <Handle type="target" position={Position.Left} className="!bg-orange-500 !w-3 !h-3 !border-2 !border-black" />

            {/* Branch indicator */}
            <div className="absolute -top-2 -right-2 p-1 rounded-full bg-orange-500 border-2 border-black">
                <GitBranch className="h-3 w-3 text-black" />
            </div>

            <div className="flex items-start gap-2">
                <div className={cn("p-1.5 rounded-lg bg-black/40", config.color)}>
                    <SourceIcon className="h-4 w-4" />
                </div>
                <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-1.5 mb-1">
                        <Link2 className={cn("h-3 w-3", config.color)} />
                        <h3 className="text-sm font-semibold text-white truncate">{label}</h3>
                    </div>
                    {description && (
                        <p className="text-[10px] text-white/70 line-clamp-2 mb-2">{description}</p>
                    )}
                    {/* AI Comment */}
                    <div className="flex items-start gap-1.5 p-2 rounded-md bg-black/40 border border-white/10">
                        <Lightbulb className="h-3 w-3 text-amber-400 shrink-0 mt-0.5" />
                        <p className="text-[10px] text-amber-300/90 italic leading-relaxed">{aiComment}</p>
                    </div>
                </div>
            </div>

            <Handle type="source" position={Position.Bottom} className="!bg-orange-500 !w-3 !h-3 !border-2 !border-black" />
        </div>
    );
});
CheckpointNodeComponent.displayName = 'CheckpointNodeComponent';

const nodeTypes = { 
    roadmapNode: RoadmapNodeComponent,
    checkpointNode: CheckpointNodeComponent 
};

// Resource type icons
const TYPE_ICONS: Record<string, any> = {
    article: FileText,
    video: Youtube,
    tutorial: Code,
    documentation: BookOpen,
    project: Rocket,
    course: GraduationCap,
    github: Code,
};

const DIFFICULTY_COLORS: Record<string, string> = {
    beginner: "bg-emerald-500/20 text-emerald-400 border-emerald-500/30",
    intermediate: "bg-amber-500/20 text-amber-400 border-amber-500/30",
    advanced: "bg-red-500/20 text-red-400 border-red-500/30",
};

// ============================================
// TEST DATA: LLM Roadmap (roadmap.sh style)
// ============================================
const LLM_ROADMAP: RoadmapGraph = {
    nodes: [
        // Foundation Layer
        { id: "python", label: "Python Fundamentals", description: "Core Python programming: data structures, OOP, file handling", status: "completed", type: "concept" },
        { id: "math", label: "Math for ML", description: "Linear algebra, calculus, probability & statistics", status: "completed", type: "concept" },
        
        // ML Basics Layer
        { id: "ml-basics", label: "Machine Learning Basics", description: "Supervised/unsupervised learning, regression, classification", status: "completed", type: "concept" },
        { id: "numpy-pandas", label: "NumPy & Pandas", description: "Data manipulation, array operations, dataframes", status: "completed", type: "concept" },
        
        // Deep Learning Layer
        { id: "neural-nets", label: "Neural Networks", description: "Perceptrons, backpropagation, activation functions", status: "in-progress", type: "concept" },
        { id: "pytorch", label: "PyTorch", description: "Tensors, autograd, building neural networks", status: "in-progress", type: "concept" },
        
        // NLP Foundation Layer
        { id: "nlp-basics", label: "NLP Fundamentals", description: "Tokenization, embeddings, word2vec, TF-IDF", status: "next", type: "concept" },
        { id: "rnn-lstm", label: "RNN & LSTM", description: "Sequential models, vanishing gradients, gating", status: "next", type: "concept" },
        
        // Transformer Layer
        { id: "attention", label: "Attention Mechanism", description: "Self-attention, multi-head attention, positional encoding", status: "next", type: "concept" },
        { id: "transformers", label: "Transformer Architecture", description: "Encoder-decoder, BERT, GPT architecture deep dive", status: "locked", type: "milestone" },
        
        // LLM Core Layer
        { id: "llm-training", label: "LLM Pre-training", description: "Next token prediction, masked language modeling, scaling laws", status: "locked", type: "concept" },
        { id: "fine-tuning", label: "Fine-tuning Techniques", description: "Full fine-tuning, LoRA, QLoRA, PEFT methods", status: "locked", type: "concept" },
        
        // Alignment Layer
        { id: "rlhf", label: "RLHF", description: "Reward models, PPO, Constitutional AI, DPO", status: "locked", type: "concept" },
        { id: "prompting", label: "Prompt Engineering", description: "Zero-shot, few-shot, chain-of-thought, system prompts", status: "locked", type: "concept" },
        
        // Advanced Layer
        { id: "rag", label: "RAG Systems", description: "Retrieval augmented generation, vector DBs, chunking strategies", status: "locked", type: "concept" },
        { id: "agents", label: "LLM Agents", description: "Tool use, function calling, ReAct, planning", status: "locked", type: "concept" },
        
        // Deployment Layer
        { id: "inference", label: "Inference Optimization", description: "Quantization, KV caching, speculative decoding, vLLM", status: "locked", type: "concept" },
        { id: "deployment", label: "LLM Deployment", description: "Serving, APIs, cost optimization, monitoring", status: "locked", type: "concept" },
        
        // Projects
        { id: "project-chatbot", label: "Build a Chatbot", description: "Create a conversational AI using open-source LLMs", status: "locked", type: "project" },
        { id: "project-rag", label: "RAG Application", description: "Build a document Q&A system with embeddings", status: "locked", type: "project" },
        { id: "project-finetune", label: "Fine-tune LLM", description: "Fine-tune a model on custom dataset with LoRA", status: "locked", type: "project" },
    ],
    edges: [
        // Foundation connections
        { id: "e1", source: "python", target: "numpy-pandas" },
        { id: "e2", source: "math", target: "ml-basics" },
        { id: "e3", source: "numpy-pandas", target: "ml-basics" },
        
        // ML to DL connections
        { id: "e4", source: "ml-basics", target: "neural-nets" },
        { id: "e5", source: "numpy-pandas", target: "pytorch" },
        { id: "e6", source: "neural-nets", target: "pytorch" },
        
        // DL to NLP connections
        { id: "e7", source: "pytorch", target: "nlp-basics" },
        { id: "e8", source: "neural-nets", target: "rnn-lstm" },
        { id: "e9", source: "nlp-basics", target: "rnn-lstm" },
        
        // NLP to Transformers
        { id: "e10", source: "rnn-lstm", target: "attention" },
        { id: "e11", source: "attention", target: "transformers" },
        { id: "e12", source: "nlp-basics", target: "attention" },
        
        // Transformers to LLM Core
        { id: "e13", source: "transformers", target: "llm-training" },
        { id: "e14", source: "transformers", target: "fine-tuning" },
        
        // LLM Core to Alignment
        { id: "e15", source: "llm-training", target: "rlhf" },
        { id: "e16", source: "fine-tuning", target: "rlhf" },
        { id: "e17", source: "llm-training", target: "prompting" },
        
        // Alignment to Advanced
        { id: "e18", source: "prompting", target: "rag" },
        { id: "e19", source: "rlhf", target: "agents" },
        { id: "e20", source: "prompting", target: "agents" },
        
        // Advanced to Deployment
        { id: "e21", source: "rag", target: "inference" },
        { id: "e22", source: "agents", target: "inference" },
        { id: "e23", source: "inference", target: "deployment" },
        
        // Project connections
        { id: "e24", source: "prompting", target: "project-chatbot" },
        { id: "e25", source: "rag", target: "project-rag" },
        { id: "e26", source: "fine-tuning", target: "project-finetune" },
    ],
    summary: "A comprehensive roadmap to mastering Large Language Models - from Python fundamentals through transformer architecture, fine-tuning, RLHF, and production deployment. Focus on hands-on projects at each stage.",
    estimated_duration: "6-9 months"
};

export function InteractiveRoadmap() {
    const [nodes, setNodes, onNodesChange] = useNodesState<Node>([]);
    const [edges, setEdges, onEdgesChange] = useEdgesState<Edge>([]);
    const [domain, setDomain] = useState("");
    const [isGenerating, setIsGenerating] = useState(false);
    const [summary, setSummary] = useState("");

    // Panel state
    const [selectedNode, setSelectedNode] = useState<RoadmapNode | null>(null);
    const [isPanelOpen, setIsPanelOpen] = useState(false);
    const [isLoadingResources, setIsLoadingResources] = useState(false);
    const [recommendations, setRecommendations] = useState<LevelBasedRecommendations | null>(null);
    const [projects, setProjects] = useState<any[]>([]);
    const [curatedPath, setCuratedPath] = useState<any>(null);

    // Checkpoint state (external resources branching)
    const [linkInput, setLinkInput] = useState("");
    const [isAnalyzingLink, setIsAnalyzingLink] = useState(false);
    const [checkpoints, setCheckpoints] = useState<Array<{
        id: string;
        label: string;
        description: string;
        sourceUrl: string;
        sourceType: 'article' | 'video' | 'blog' | 'tutorial';
        aiComment: string;
        prerequisites: string[];
        parentNodeId: string;
    }>>([]);
    const [selectedCheckpoint, setSelectedCheckpoint] = useState<typeof checkpoints[0] | null>(null);

    const handleNodeClick = useCallback(async (node: RoadmapNode) => {
        setSelectedNode(node);
        setSelectedCheckpoint(null); // Clear checkpoint selection
        setIsPanelOpen(true);
        setRecommendations(null);
        setProjects([]);
        setCuratedPath(null);

        // Auto-fetch recommendations
        setIsLoadingResources(true);
        try {
            const profile = await getLearningProfile();
            const request: RecommendationRequest = {
                topic: node.label,
                currentLevel: (profile?.level as any) || "Intermediate",
                learningStyle: profile?.learningStyle || undefined,
                goalType: profile?.goalType || undefined,
                weakConcepts: Array.isArray(profile?.weakConcepts) ? profile.weakConcepts as string[] : undefined,
                strongConcepts: Array.isArray(profile?.strongConcepts) ? profile.strongConcepts as string[] : undefined,
            };

            const [recs, projs] = await Promise.all([
                generateResourceRecommendations(request),
                suggestProjects(node.label, request.currentLevel, request.strongConcepts || [])
            ]);

            setRecommendations(recs);
            setProjects(projs);
        } catch (error) {
            console.error("Failed to load resources:", error);
        } finally {
            setIsLoadingResources(false);
        }
    }, []);

    const handleCuratePath = async () => {
        if (!selectedNode) return;
        setIsLoadingResources(true);
        try {
            toast.info(`Curating deep learning path for: ${selectedNode.label}...`);
            const res = await searchForLearningResources(selectedNode.label, 10);
            if (!res.success || !res.resources) {
                toast.error("No resources found");
                return;
            }

            const profile = await getLearningProfile();
            const curator = await import("@/lib/ai/content-curator");
            const curated = await curator.curateResources(profile || {}, [selectedNode.description], res.resources);
            setCuratedPath(curated);
            toast.success("Learning path curated!");
        } catch (error) {
            console.error(error);
            toast.error("Curation failed");
        } finally {
            setIsLoadingResources(false);
        }
    };

    // Handle ingesting external link (Medium article, YouTube video, etc.)
    const handleIngestLink = useCallback(async () => {
        if (!linkInput.trim() || nodes.length === 0) {
            toast.error("Please enter a link and ensure a roadmap is loaded");
            return;
        }

        setIsAnalyzingLink(true);
        try {
            toast.info("🔍 Analyzing external resource...");

            // Detect source type from URL
            const url = linkInput.trim();
            let sourceType: 'article' | 'video' | 'blog' | 'tutorial' = 'article';
            if (url.includes('youtube.com') || url.includes('youtu.be')) {
                sourceType = 'video';
            } else if (url.includes('medium.com') || url.includes('dev.to') || url.includes('hashnode')) {
                sourceType = 'blog';
            } else if (url.includes('github.com') || url.includes('codesandbox') || url.includes('repl.it')) {
                sourceType = 'tutorial';
            }

            // Get all current node labels for AI to match against
            const roadmapTopics = nodes.map(n => ({
                id: n.id,
                label: (n.data as RoadmapNodeData).label,
                description: (n.data as RoadmapNodeData).description,
            }));

            // Use LLM to analyze the link and find the best parent node
            const llm = await import("@/lib/ai/llm-engine");
            const prompt = `You are analyzing an external learning resource to add as a checkpoint branch on a learning roadmap.

URL: ${url}
Source Type: ${sourceType}

Current Roadmap Topics:
${roadmapTopics.map(t => `- ID: "${t.id}" | Label: "${t.label}" | Description: "${t.description}"`).join('\n')}

Based on the URL and source type, analyze what this resource is likely about and determine:
1. A short title for this checkpoint (max 5 words)
2. A brief description of what the resource covers (1 sentence)
3. The MOST RELEVANT parent node ID from the roadmap above that this resource branches from
4. A one-line AI comment advising the user (e.g., "Complete ${roadmapTopics[0]?.label || 'basics'} first, then try this in 2 weeks")
5. List of 1-3 prerequisite concepts from the roadmap

Return JSON:
{
    "title": "Resource Title",
    "description": "Brief description",
    "parentNodeId": "id_from_roadmap",
    "aiComment": "Your advice about timing and prerequisites",
    "prerequisites": ["concept1", "concept2"]
}`;

            // Use LLMEngine properly
            const { LLMEngine, extractJson } = await import("@/lib/ai/llm-engine");
            const engine = LLMEngine.getInstance();
            const response = await engine.chat([{ role: "user", content: prompt }], { 
                temperature: 0.3, 
                json_mode: true 
            });
            const analysis = extractJson(response);

            if (!analysis || !analysis.parentNodeId) {
                throw new Error("Failed to analyze resource");
            }

            // Find parent node position
            const parentNode = nodes.find(n => n.id === analysis.parentNodeId);
            if (!parentNode) {
                toast.error("Could not find matching topic in roadmap");
                return;
            }

            // Create checkpoint
            const checkpointId = `checkpoint-${Date.now()}`;
            const checkpoint = {
                id: checkpointId,
                label: analysis.title || "External Resource",
                description: analysis.description || "An external learning resource",
                sourceUrl: url,
                sourceType,
                aiComment: analysis.aiComment || "Consider this after completing prerequisites",
                prerequisites: analysis.prerequisites || [],
                parentNodeId: analysis.parentNodeId,
            };

            // Add to checkpoints state
            setCheckpoints(prev => [...prev, checkpoint]);

            // Create checkpoint node positioned to the right of parent (branch off)
            const checkpointNode: Node = {
                id: checkpointId,
                type: 'checkpointNode',
                data: {
                    ...checkpoint,
                    onClick: () => {
                        setSelectedCheckpoint(checkpoint);
                        setSelectedNode(null);
                        setIsPanelOpen(true);
                    },
                } as CheckpointNodeData,
                position: {
                    x: parentNode.position.x + 280, // Branch to the right
                    y: parentNode.position.y + 30,  // Slightly below
                },
            };

            // Create edge from parent to checkpoint (curved, different style)
            const checkpointEdge: Edge = {
                id: `edge-${checkpointId}`,
                source: analysis.parentNodeId,
                target: checkpointId,
                type: 'smoothstep',
                animated: true,
                style: { stroke: '#f97316', strokeWidth: 2, strokeDasharray: '5,5' },
                markerEnd: { type: MarkerType.ArrowClosed, color: '#f97316' },
            };

            // Add to graph
            setNodes(prev => [...prev, checkpointNode]);
            setEdges(prev => [...prev, checkpointEdge]);

            toast.success(`✨ Checkpoint added! Branches from "${(parentNode.data as RoadmapNodeData).label}"`);
            setLinkInput("");

        } catch (error) {
            console.error("Failed to ingest link:", error);
            toast.error("Failed to analyze resource. Try again.");
        } finally {
            setIsAnalyzingLink(false);
        }
    }, [linkInput, nodes, setNodes, setEdges]);

    const handleGenerate = async () => {
        if (!domain.trim()) return;
        setIsGenerating(true);
        setNodes([]);
        setEdges([]);
        setSummary("");
        setIsPanelOpen(false);

        try {
            toast.info("🧠 Analyzing your Learning DNA...");
            const profile = await getLearningProfile();

            toast.info(`🏗️ Building Roadmap: ${domain}...`);
            const architect = await import("@/lib/ai/roadmap-architect");
            const graph: RoadmapGraph = await architect.generateRoadmap(profile || {}, domain);

            if (graph && graph.nodes) {
                // Store raw nodes for panel
                const rawNodes = graph.nodes;

                // Compute layout
                const depthMap = new Map<string, number>();
                const childrenMap = new Map<string, string[]>();
                const parentSet = new Set<string>();

                for (const edge of graph.edges) {
                    if (!childrenMap.has(edge.source)) childrenMap.set(edge.source, []);
                    childrenMap.get(edge.source)!.push(edge.target);
                    parentSet.add(edge.target);
                }

                const roots = graph.nodes.filter(n => !parentSet.has(n.id)).map(n => n.id);
                if (roots.length === 0 && graph.nodes.length > 0) roots.push(graph.nodes[0].id);

                const queue = roots.map(r => ({ id: r, depth: 0 }));
                const visited = new Set<string>();
                while (queue.length > 0) {
                    const { id, depth } = queue.shift()!;
                    if (visited.has(id)) continue;
                    visited.add(id);
                    depthMap.set(id, depth);
                    for (const child of childrenMap.get(id) ?? []) {
                        if (!visited.has(child)) {
                            queue.push({ id: child, depth: depth + 1 });
                        }
                    }
                }
                for (const node of graph.nodes) {
                    if (!depthMap.has(node.id)) depthMap.set(node.id, 0);
                }

                const depthGroups = new Map<number, string[]>();
                for (const [id, depth] of depthMap) {
                    if (!depthGroups.has(depth)) depthGroups.set(depth, []);
                    depthGroups.get(depth)!.push(id);
                }

                const NODE_WIDTH = 220;
                const NODE_HEIGHT = 100;
                const X_GAP = 80;
                const Y_GAP = 100;

                const layoutedNodes: Node[] = graph.nodes.map((node) => {
                    const depth = depthMap.get(node.id) ?? 0;
                    const siblings = depthGroups.get(depth) ?? [node.id];
                    const sibIndex = siblings.indexOf(node.id);
                    const totalWidth = siblings.length * (NODE_WIDTH + X_GAP) - X_GAP;
                    const startX = -(totalWidth / 2) + 500;

                    const rawNode = rawNodes.find(n => n.id === node.id)!;

                    return {
                        id: node.id,
                        type: 'roadmapNode',
                        data: {
                            label: node.label,
                            description: node.description,
                            status: node.status,
                            nodeType: node.type,
                            onClick: () => handleNodeClick(rawNode),
                        } as RoadmapNodeData,
                        position: {
                            x: startX + sibIndex * (NODE_WIDTH + X_GAP),
                            y: depth * (NODE_HEIGHT + Y_GAP) + 50,
                        },
                    };
                });

                const layoutedEdges: Edge[] = graph.edges.map(edge => ({
                    id: edge.id,
                    source: edge.source,
                    target: edge.target,
                    animated: true,
                    style: { stroke: '#8b5cf6', strokeWidth: 2 },
                    markerEnd: { type: MarkerType.ArrowClosed, color: '#8b5cf6' },
                }));

                setNodes(layoutedNodes);
                setEdges(layoutedEdges);
                setSummary(graph.summary);

                toast.success("✨ Roadmap Generated! Click any node to explore.");
                await saveRoadmap(domain, graph);
            }
        } catch (error) {
            console.error(error);
            toast.error("Failed to generate roadmap.");
        } finally {
            setIsGenerating(false);
        }
    };

    // Load test roadmap for development/testing
    const loadTestRoadmap = useCallback(() => {
        const graph = LLM_ROADMAP;
        setDomain("LLMs");
        setSummary(graph.summary);
        setIsPanelOpen(false);

        // Compute layout (same logic as handleGenerate)
        const depthMap = new Map<string, number>();
        const childrenMap = new Map<string, string[]>();
        const parentSet = new Set<string>();

        for (const edge of graph.edges) {
            if (!childrenMap.has(edge.source)) childrenMap.set(edge.source, []);
            childrenMap.get(edge.source)!.push(edge.target);
            parentSet.add(edge.target);
        }

        const roots = graph.nodes.filter(n => !parentSet.has(n.id)).map(n => n.id);
        if (roots.length === 0 && graph.nodes.length > 0) roots.push(graph.nodes[0].id);

        const queue = roots.map(r => ({ id: r, depth: 0 }));
        const visited = new Set<string>();
        while (queue.length > 0) {
            const { id, depth } = queue.shift()!;
            if (visited.has(id)) continue;
            visited.add(id);
            depthMap.set(id, depth);
            for (const child of childrenMap.get(id) ?? []) {
                if (!visited.has(child)) {
                    queue.push({ id: child, depth: depth + 1 });
                }
            }
        }
        for (const node of graph.nodes) {
            if (!depthMap.has(node.id)) depthMap.set(node.id, 0);
        }

        const depthGroups = new Map<number, string[]>();
        for (const [id, depth] of depthMap) {
            if (!depthGroups.has(depth)) depthGroups.set(depth, []);
            depthGroups.get(depth)!.push(id);
        }

        const NODE_WIDTH = 220;
        const NODE_HEIGHT = 100;
        const X_GAP = 80;
        const Y_GAP = 100;

        const layoutedNodes: Node[] = graph.nodes.map((node) => {
            const depth = depthMap.get(node.id) ?? 0;
            const siblings = depthGroups.get(depth) ?? [node.id];
            const sibIndex = siblings.indexOf(node.id);
            const totalWidth = siblings.length * (NODE_WIDTH + X_GAP) - X_GAP;
            const startX = -(totalWidth / 2) + 500;

            return {
                id: node.id,
                type: 'roadmapNode',
                data: {
                    label: node.label,
                    description: node.description,
                    status: node.status,
                    nodeType: node.type,
                    onClick: () => handleNodeClick(node),
                } as RoadmapNodeData,
                position: {
                    x: startX + sibIndex * (NODE_WIDTH + X_GAP),
                    y: depth * (NODE_HEIGHT + Y_GAP) + 50,
                },
            };
        });

        const layoutedEdges: Edge[] = graph.edges.map(edge => ({
            id: edge.id,
            source: edge.source,
            target: edge.target,
            animated: true,
            style: { stroke: '#8b5cf6', strokeWidth: 2 },
            markerEnd: { type: MarkerType.ArrowClosed, color: '#8b5cf6' },
        }));

        // ============================================
        // DEMO: Pre-loaded example checkpoints
        // ============================================
        const demoCheckpoints = [
            {
                id: "checkpoint-demo-1",
                label: "Vision Transformers",
                description: "How attention mechanisms power image recognition in ViT architectures",
                sourceUrl: "https://medium.com/towards-data-science/attention-in-vision-transformers-explained",
                sourceType: "blog" as const,
                aiComment: "Complete 'Attention Mechanism' first, then explore this in ~2 weeks to see cross-domain applications of attention.",
                prerequisites: ["Attention Mechanism", "Neural Networks"],
                parentNodeId: "attention",
            },
            {
                id: "checkpoint-demo-2",
                label: "RAG with LangChain",
                description: "Building production RAG pipelines with LangChain and vector databases",
                sourceUrl: "https://www.youtube.com/watch?v=LhnCsygAvzY",
                sourceType: "video" as const,
                aiComment: "Wait until you've covered RAG Systems basics, then use this for hands-on implementation (~3 weeks out).",
                prerequisites: ["RAG Systems", "Prompt Engineering"],
                parentNodeId: "rag",
            },
        ];

        // Find parent nodes and create checkpoint nodes
        const attentionNode = layoutedNodes.find(n => n.id === "attention");
        const ragNode = layoutedNodes.find(n => n.id === "rag");

        const checkpointNodes: Node[] = [];
        const checkpointEdges: Edge[] = [];

        if (attentionNode) {
            const checkpoint1 = demoCheckpoints[0];
            checkpointNodes.push({
                id: checkpoint1.id,
                type: 'checkpointNode',
                data: {
                    ...checkpoint1,
                    onClick: () => {
                        setSelectedCheckpoint(checkpoint1);
                        setSelectedNode(null);
                        setIsPanelOpen(true);
                    },
                } as CheckpointNodeData,
                position: {
                    x: attentionNode.position.x + 300,
                    y: attentionNode.position.y + 20,
                },
            });
            checkpointEdges.push({
                id: `edge-${checkpoint1.id}`,
                source: "attention",
                target: checkpoint1.id,
                type: 'smoothstep',
                animated: true,
                style: { stroke: '#f97316', strokeWidth: 2, strokeDasharray: '5,5' },
                markerEnd: { type: MarkerType.ArrowClosed, color: '#f97316' },
            });
        }

        if (ragNode) {
            const checkpoint2 = demoCheckpoints[1];
            checkpointNodes.push({
                id: checkpoint2.id,
                type: 'checkpointNode',
                data: {
                    ...checkpoint2,
                    onClick: () => {
                        setSelectedCheckpoint(checkpoint2);
                        setSelectedNode(null);
                        setIsPanelOpen(true);
                    },
                } as CheckpointNodeData,
                position: {
                    x: ragNode.position.x + 300,
                    y: ragNode.position.y + 20,
                },
            });
            checkpointEdges.push({
                id: `edge-${checkpoint2.id}`,
                source: "rag",
                target: checkpoint2.id,
                type: 'smoothstep',
                animated: true,
                style: { stroke: '#f97316', strokeWidth: 2, strokeDasharray: '5,5' },
                markerEnd: { type: MarkerType.ArrowClosed, color: '#f97316' },
            });
        }

        // Set checkpoints state for the panel
        setCheckpoints(demoCheckpoints);

        // Combine all nodes and edges
        setNodes([...layoutedNodes, ...checkpointNodes]);
        setEdges([...layoutedEdges, ...checkpointEdges]);
        toast.success("🧪 Test LLM Roadmap Loaded with 2 demo checkpoints! Click any node to explore.");
    }, [handleNodeClick, setNodes, setEdges]);

    return (
        <div className="relative w-full h-[700px] rounded-xl overflow-hidden border border-purple-500/20 bg-gradient-to-br from-black via-purple-950/10 to-black">
            {/* Header Bar */}
            <div className="absolute top-0 left-0 right-0 z-20 bg-black/80 backdrop-blur-md border-b border-white/10 px-6 py-4">
                <div className="flex items-center justify-between">
                    <div className="flex items-center gap-3">
                        <div className="p-2 rounded-lg bg-gradient-to-br from-purple-500/20 to-blue-500/20 border border-purple-500/30">
                            <LayoutDashboard className="h-5 w-5 text-purple-400" />
                        </div>
                        <div>
                            <h2 className="text-lg font-bold text-white">Learning Roadmap</h2>
                            <p className="text-xs text-white/50">Click any node to explore resources</p>
                        </div>
                    </div>

                    <div className="flex items-center gap-3">
                        <div className="relative">
                            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-white/30" />
                            <Input
                                placeholder="Enter your learning goal..."
                                value={domain}
                                onChange={(e) => setDomain(e.target.value)}
                                onKeyDown={(e) => e.key === "Enter" && handleGenerate()}
                                className="w-72 pl-10 bg-white/5 border-purple-500/30 text-white placeholder:text-white/30"
                            />
                        </div>
                        <Button
                            onClick={handleGenerate}
                            disabled={isGenerating || !domain.trim()}
                            className="bg-gradient-to-r from-purple-600 to-blue-600 hover:from-purple-500 hover:to-blue-500 text-white shadow-lg shadow-purple-500/20"
                        >
                            {isGenerating ? (
                                <Loader2 className="h-4 w-4 animate-spin mr-2" />
                            ) : (
                                <Zap className="h-4 w-4 mr-2" />
                            )}
                            Generate Roadmap
                        </Button>
                        <Button
                            onClick={loadTestRoadmap}
                            variant="outline"
                            className="border-amber-500/30 text-amber-400 hover:bg-amber-500/10"
                        >
                            🧪 Load Test Data
                        </Button>
                    </div>
                </div>

                {/* Summary Banner */}
                {summary && (
                    <motion.div
                        initial={{ opacity: 0, y: -10 }}
                        animate={{ opacity: 1, y: 0 }}
                        className="mt-3 px-4 py-2 bg-purple-500/10 border border-purple-500/20 rounded-lg"
                    >
                        <p className="text-xs text-purple-300">{summary}</p>
                    </motion.div>
                )}

                {/* Link Ingest Bar - Add External Resources */}
                {nodes.length > 0 && (
                    <motion.div
                        initial={{ opacity: 0, y: -10 }}
                        animate={{ opacity: 1, y: 0 }}
                        className="mt-3 flex items-center gap-3"
                    >
                        <div className="flex items-center gap-2 px-3 py-2 bg-orange-500/10 border border-orange-500/20 rounded-lg flex-1">
                            <GitBranch className="h-4 w-4 text-orange-400" />
                            <span className="text-xs text-orange-300">Add External Resource:</span>
                            <Input
                                placeholder="Paste Medium article or YouTube link..."
                                value={linkInput}
                                onChange={(e) => setLinkInput(e.target.value)}
                                onKeyDown={(e) => e.key === "Enter" && handleIngestLink()}
                                className="flex-1 h-8 bg-black/50 border-orange-500/30 text-white placeholder:text-white/30 text-xs"
                            />
                            <Button
                                onClick={handleIngestLink}
                                disabled={isAnalyzingLink || !linkInput.trim()}
                                size="sm"
                                className="h-8 bg-orange-600 hover:bg-orange-500 text-white"
                            >
                                {isAnalyzingLink ? (
                                    <Loader2 className="h-3 w-3 animate-spin" />
                                ) : (
                                    <Plus className="h-3 w-3" />
                                )}
                            </Button>
                        </div>
                        {checkpoints.length > 0 && (
                            <Badge variant="outline" className="border-orange-500/30 text-orange-400 text-xs">
                                {checkpoints.length} checkpoint{checkpoints.length > 1 ? 's' : ''}
                            </Badge>
                        )}
                    </motion.div>
                )}
            </div>

            {/* ReactFlow Graph */}
            <div className="absolute inset-0 pt-[80px]">
                {nodes.length > 0 ? (
                    <ReactFlow
                        nodes={nodes}
                        edges={edges}
                        onNodesChange={onNodesChange}
                        onEdgesChange={onEdgesChange}
                        nodeTypes={nodeTypes}
                        fitView
                        fitViewOptions={{ padding: 0.3 }}
                        minZoom={0.3}
                        maxZoom={1.5}
                        defaultEdgeOptions={{
                            type: 'smoothstep',
                        }}
                        proOptions={{ hideAttribution: true }}
                    >
                        <Background color="#3f3f46" gap={30} size={1} />
                        <Controls
                            className="!bg-black/80 !border-white/10 !rounded-xl"
                            style={{ bottom: 20, left: 20 }}
                        />
                        <MiniMap
                            nodeColor={(node) => {
                                // Checkpoint nodes are orange
                                if (node.type === 'checkpointNode') {
                                    return '#f97316';
                                }
                                const status = (node.data as RoadmapNodeData).status;
                                return status === 'completed' ? '#10b981' :
                                    status === 'in-progress' ? '#3b82f6' :
                                        status === 'next' ? '#f59e0b' : '#52525b';
                            }}
                            maskColor="rgba(0,0,0,0.8)"
                            className="!bg-black/80 !border-white/10 !rounded-xl"
                            style={{ bottom: 20, right: 20 }}
                        />
                    </ReactFlow>
                ) : (
                    <div className="flex items-center justify-center h-full">
                        <div className="text-center space-y-4">
                            <div className="p-6 rounded-full bg-purple-500/10 border border-purple-500/20 mx-auto w-fit">
                                <LayoutDashboard className="h-16 w-16 text-purple-400/50" />
                            </div>
                            <div>
                                <h3 className="text-xl font-semibold text-white/80">Build Your Learning Path</h3>
                                <p className="text-sm text-white/40 mt-1 max-w-md">
                                    Enter a skill or domain above (e.g., "System Design", "Machine Learning", "React")
                                    to generate a personalized roadmap.
                                </p>
                            </div>
                        </div>
                    </div>
                )}
            </div>

            {/* Status Legend */}
            {nodes.length > 0 && (
                <div className="absolute bottom-4 left-1/2 -translate-x-1/2 z-10 flex items-center gap-4 px-4 py-2 bg-black/80 backdrop-blur-md border border-white/10 rounded-full">
                    <div className="flex items-center gap-1.5 text-[10px]">
                        <span className="h-2 w-2 rounded-full bg-emerald-500" />
                        <span className="text-white/60">Completed</span>
                    </div>
                    <div className="flex items-center gap-1.5 text-[10px]">
                        <span className="h-2 w-2 rounded-full bg-blue-500" />
                        <span className="text-white/60">In Progress</span>
                    </div>
                    <div className="flex items-center gap-1.5 text-[10px]">
                        <span className="h-2 w-2 rounded-full bg-amber-500" />
                        <span className="text-white/60">Up Next</span>
                    </div>
                    <div className="flex items-center gap-1.5 text-[10px]">
                        <span className="h-2 w-2 rounded-full bg-zinc-500" />
                        <span className="text-white/60">Locked</span>
                    </div>
                    <div className="flex items-center gap-1.5 text-[10px]">
                        <span className="h-2 w-2 rounded-full bg-orange-500" />
                        <span className="text-white/60">Checkpoint</span>
                    </div>
                </div>
            )}

            {/* Right Panel - Slide Out */}
            <Sheet open={isPanelOpen} onOpenChange={setIsPanelOpen}>
                <SheetContent className="w-[480px] sm:w-[540px] bg-black/95 border-l border-purple-500/20 p-0 overflow-hidden">
                    {selectedNode && (
                        <div className="h-full flex flex-col">
                            {/* Panel Header */}
                            <SheetHeader className="p-6 pb-4 border-b border-white/10 bg-gradient-to-r from-purple-900/20 to-blue-900/20">
                                <div className="flex items-start gap-3">
                                    <div className={cn(
                                        "p-3 rounded-xl",
                                        selectedNode.status === 'completed' ? "bg-emerald-500/20" :
                                            selectedNode.status === 'next' ? "bg-amber-500/20" : "bg-purple-500/20"
                                    )}>
                                        {selectedNode.type === 'project' ? <Rocket className="h-6 w-6 text-purple-400" /> :
                                            selectedNode.type === 'milestone' ? <GraduationCap className="h-6 w-6 text-amber-400" /> :
                                                <Brain className="h-6 w-6 text-blue-400" />}
                                    </div>
                                    <div className="flex-1">
                                        <SheetTitle className="text-xl text-white">{selectedNode.label}</SheetTitle>
                                        <SheetDescription className="mt-1 text-white/60">
                                            {selectedNode.description}
                                        </SheetDescription>
                                        <div className="flex items-center gap-2 mt-3">
                                            <Badge variant="outline" className={cn(
                                                "text-xs",
                                                selectedNode.status === 'completed' ? "border-emerald-500/50 text-emerald-400" :
                                                    selectedNode.status === 'next' ? "border-amber-500/50 text-amber-400" :
                                                        selectedNode.status === 'locked' ? "border-zinc-500/50 text-zinc-400" :
                                                            "border-blue-500/50 text-blue-400"
                                            )}>
                                                {selectedNode.status}
                                            </Badge>
                                            <Badge variant="secondary" className="text-xs bg-white/5">
                                                {selectedNode.type}
                                            </Badge>
                                        </div>
                                    </div>
                                </div>
                            </SheetHeader>

                            {/* Panel Content */}
                            <ScrollArea className="flex-1 p-6">
                                {isLoadingResources ? (
                                    <div className="flex flex-col items-center justify-center py-12">
                                        <Loader2 className="h-8 w-8 animate-spin text-purple-400 mb-3" />
                                        <p className="text-sm text-white/50">Finding personalized resources...</p>
                                        <Progress value={45} className="w-48 mt-3 h-1" />
                                    </div>
                                ) : recommendations ? (
                                    <div className="space-y-6">
                                        {/* Learning Strategy */}
                                        <div className="bg-gradient-to-r from-purple-900/20 to-blue-900/20 border border-purple-500/20 rounded-lg p-4">
                                            <div className="flex items-start gap-3">
                                                <Lightbulb className="h-5 w-5 text-amber-400 mt-0.5 shrink-0" />
                                                <div>
                                                    <h4 className="text-sm font-semibold text-amber-400 mb-1">Recommended Approach</h4>
                                                    <p className="text-xs text-white/70">{recommendations.curated_sequence}</p>
                                                    <p className="text-xs text-purple-300/70 mt-2 italic">{recommendations.learning_strategy}</p>
                                                </div>
                                            </div>
                                        </div>

                                        {/* Resource Tabs */}
                                        <Tabs defaultValue="for-you" className="w-full">
                                            <TabsList className="grid w-full grid-cols-4 bg-black/40 border border-white/10">
                                                <TabsTrigger value="for-you" className="text-xs data-[state=active]:bg-purple-500/20">
                                                    <Target className="h-3 w-3 mr-1" /> For You
                                                </TabsTrigger>
                                                <TabsTrigger value="stretch" className="text-xs data-[state=active]:bg-amber-500/20">
                                                    <TrendingUp className="h-3 w-3 mr-1" /> Stretch
                                                </TabsTrigger>
                                                <TabsTrigger value="gaps" className="text-xs data-[state=active]:bg-red-500/20">
                                                    <Layers className="h-3 w-3 mr-1" /> Gaps
                                                </TabsTrigger>
                                                <TabsTrigger value="build" className="text-xs data-[state=active]:bg-emerald-500/20">
                                                    <Rocket className="h-3 w-3 mr-1" /> Build
                                                </TabsTrigger>
                                            </TabsList>

                                            <TabsContent value="for-you" className="mt-3 space-y-2">
                                                {recommendations.for_your_level.map((res, idx) => (
                                                    <ResourceCard key={idx} resource={res} />
                                                ))}
                                            </TabsContent>
                                            <TabsContent value="stretch" className="mt-3 space-y-2">
                                                {recommendations.stretch_goals.map((res, idx) => (
                                                    <ResourceCard key={idx} resource={res} />
                                                ))}
                                            </TabsContent>
                                            <TabsContent value="gaps" className="mt-3 space-y-2">
                                                {recommendations.foundational_gaps.map((res, idx) => (
                                                    <ResourceCard key={idx} resource={res} />
                                                ))}
                                            </TabsContent>
                                            <TabsContent value="build" className="mt-3 space-y-3">
                                                {recommendations.implementation_projects.map((res, idx) => (
                                                    <ResourceCard key={idx} resource={res} />
                                                ))}
                                                {projects.length > 0 && (
                                                    <div className="pt-3 border-t border-white/10 space-y-3">
                                                        <h5 className="text-xs font-semibold text-purple-400 flex items-center gap-1">
                                                            <Rocket className="h-3 w-3" /> Project Ideas
                                                        </h5>
                                                        {projects.map((project, idx) => (
                                                            <ProjectCard key={idx} project={project} />
                                                        ))}
                                                    </div>
                                                )}
                                            </TabsContent>
                                        </Tabs>

                                        {/* Deep Curate Button */}
                                        {!curatedPath && (
                                            <Button
                                                onClick={handleCuratePath}
                                                variant="outline"
                                                className="w-full border-purple-500/30 text-purple-300 hover:bg-purple-500/10"
                                            >
                                                <Sparkles className="h-4 w-4 mr-2" />
                                                Curate Deep Learning Path
                                            </Button>
                                        )}

                                        {/* Curated Path */}
                                        {curatedPath && (
                                            <div className="space-y-4 pt-4 border-t border-white/10">
                                                <h4 className="text-sm font-semibold text-purple-400 flex items-center gap-2">
                                                    <Sparkles className="h-4 w-4" /> Curated Learning Path
                                                </h4>

                                                <div className="bg-blue-950/20 p-3 rounded border border-blue-500/20 text-xs text-blue-300 italic">
                                                    "{curatedPath.why_this_sequence}"
                                                </div>

                                                {/* Micro Learning */}
                                                {curatedPath.micro_learning?.length > 0 && (
                                                    <div className="space-y-2">
                                                        <h5 className="text-xs font-semibold text-emerald-400">⚡ Quick Wins</h5>
                                                        {curatedPath.micro_learning.map((r: any, i: number) => (
                                                            <CuratedResourceCard key={i} res={r} />
                                                        ))}
                                                    </div>
                                                )}

                                                {/* Deep Dive */}
                                                {curatedPath.deep_dive?.length > 0 && (
                                                    <div className="space-y-2">
                                                        <h5 className="text-xs font-semibold text-purple-400">📚 Deep Dive</h5>
                                                        {curatedPath.deep_dive.map((r: any, i: number) => (
                                                            <CuratedResourceCard key={i} res={r} />
                                                        ))}
                                                    </div>
                                                )}

                                                {/* Implementation */}
                                                {curatedPath.implementation?.length > 0 && (
                                                    <div className="space-y-2">
                                                        <h5 className="text-xs font-semibold text-orange-400">🔨 Build It</h5>
                                                        {curatedPath.implementation.map((r: any, i: number) => (
                                                            <CuratedResourceCard key={i} res={r} />
                                                        ))}
                                                    </div>
                                                )}

                                                {/* Project Challenge */}
                                                {curatedPath.project_suggestion && (
                                                    <div className="bg-gradient-to-br from-pink-900/20 to-purple-900/20 p-4 rounded-lg border border-pink-500/20">
                                                        <h5 className="text-xs font-bold text-pink-300 flex items-center gap-1 mb-2">
                                                            <Lightbulb className="h-3 w-3" /> Project Challenge
                                                        </h5>
                                                        <p className="text-xs text-pink-100/80">{curatedPath.project_suggestion}</p>
                                                    </div>
                                                )}
                                            </div>
                                        )}
                                    </div>
                                ) : (
                                    <div className="text-center py-12 text-white/40">
                                        <BookOpen className="h-10 w-10 mx-auto mb-3 opacity-30" />
                                        <p className="text-sm">Loading resources...</p>
                                    </div>
                                )}
                            </ScrollArea>
                        </div>
                    )}

                    {/* Checkpoint Panel (External Resources) */}
                    {selectedCheckpoint && !selectedNode && (
                        <div className="h-full flex flex-col">
                            {/* Checkpoint Header */}
                            <SheetHeader className="p-6 pb-4 border-b border-white/10 bg-gradient-to-r from-orange-900/20 to-red-900/20">
                                <div className="flex items-start gap-3">
                                    <div className="p-3 rounded-xl bg-orange-500/20 relative">
                                        {selectedCheckpoint.sourceType === 'video' ? (
                                            <Youtube className="h-6 w-6 text-red-400" />
                                        ) : selectedCheckpoint.sourceType === 'blog' ? (
                                            <FileText className="h-6 w-6 text-pink-400" />
                                        ) : selectedCheckpoint.sourceType === 'tutorial' ? (
                                            <Code className="h-6 w-6 text-cyan-400" />
                                        ) : (
                                            <FileText className="h-6 w-6 text-orange-400" />
                                        )}
                                        <div className="absolute -top-1 -right-1 p-1 rounded-full bg-orange-500">
                                            <GitBranch className="h-3 w-3 text-black" />
                                        </div>
                                    </div>
                                    <div className="flex-1">
                                        <div className="flex items-center gap-2 mb-1">
                                            <SheetTitle className="text-xl text-white">{selectedCheckpoint.label}</SheetTitle>
                                            <Badge variant="outline" className="text-[10px] border-orange-500/50 text-orange-400">
                                                Checkpoint
                                            </Badge>
                                        </div>
                                        <SheetDescription className="mt-1 text-white/60">
                                            {selectedCheckpoint.description}
                                        </SheetDescription>
                                        <div className="flex items-center gap-2 mt-3">
                                            <Badge variant="secondary" className="text-xs bg-orange-500/10 text-orange-300 border border-orange-500/30">
                                                {selectedCheckpoint.sourceType}
                                            </Badge>
                                            <Badge variant="outline" className="text-xs border-white/10 text-white/50">
                                                External Resource
                                            </Badge>
                                        </div>
                                    </div>
                                </div>
                            </SheetHeader>

                            {/* Checkpoint Content */}
                            <ScrollArea className="flex-1 p-6">
                                <div className="space-y-6">
                                    {/* AI Advice */}
                                    <div className="bg-gradient-to-r from-amber-900/20 to-orange-900/20 border border-amber-500/20 rounded-lg p-4">
                                        <div className="flex items-start gap-3">
                                            <div className="p-2 rounded-lg bg-amber-500/20">
                                                <Lightbulb className="h-5 w-5 text-amber-400" />
                                            </div>
                                            <div>
                                                <h4 className="text-sm font-semibold text-amber-400 mb-1">AI Recommendation</h4>
                                                <p className="text-sm text-white/80 leading-relaxed">{selectedCheckpoint.aiComment}</p>
                                            </div>
                                        </div>
                                    </div>

                                    {/* Prerequisites */}
                                    {selectedCheckpoint.prerequisites.length > 0 && (
                                        <div className="space-y-3">
                                            <h4 className="text-sm font-semibold text-orange-400 flex items-center gap-2">
                                                <AlertTriangle className="h-4 w-4" /> Prerequisites
                                            </h4>
                                            <div className="flex flex-wrap gap-2">
                                                {selectedCheckpoint.prerequisites.map((prereq, idx) => (
                                                    <Badge 
                                                        key={idx} 
                                                        variant="outline" 
                                                        className="text-xs border-orange-500/30 text-orange-300 bg-orange-500/10"
                                                    >
                                                        {prereq}
                                                    </Badge>
                                                ))}
                                            </div>
                                        </div>
                                    )}

                                    {/* Source Link */}
                                    <div className="space-y-3">
                                        <h4 className="text-sm font-semibold text-white/80 flex items-center gap-2">
                                            <Link2 className="h-4 w-4 text-orange-400" /> Resource Link
                                        </h4>
                                        <a
                                            href={selectedCheckpoint.sourceUrl}
                                            target="_blank"
                                            rel="noopener noreferrer"
                                            className="block p-4 rounded-lg bg-gradient-to-br from-orange-900/20 to-red-900/20 border border-orange-500/30 hover:border-orange-500/50 transition-all group"
                                        >
                                            <div className="flex items-center gap-3">
                                                <div className="p-2 rounded-lg bg-orange-500/20">
                                                    {selectedCheckpoint.sourceType === 'video' ? (
                                                        <Youtube className="h-5 w-5 text-red-400" />
                                                    ) : (
                                                        <FileText className="h-5 w-5 text-orange-400" />
                                                    )}
                                                </div>
                                                <div className="flex-1 min-w-0">
                                                    <p className="text-sm font-medium text-white group-hover:text-orange-300 truncate">
                                                        {selectedCheckpoint.label}
                                                    </p>
                                                    <p className="text-[10px] text-white/50 truncate mt-1">
                                                        {selectedCheckpoint.sourceUrl}
                                                    </p>
                                                </div>
                                                <ExternalLink className="h-4 w-4 text-white/30 group-hover:text-orange-400 shrink-0" />
                                            </div>
                                        </a>
                                    </div>

                                    {/* Timing Suggestion */}
                                    <div className="p-4 rounded-lg bg-black/40 border border-white/10">
                                        <div className="flex items-center gap-2 mb-2">
                                            <Timer className="h-4 w-4 text-purple-400" />
                                            <h4 className="text-sm font-semibold text-purple-400">When to Study</h4>
                                        </div>
                                        <p className="text-xs text-white/60">
                                            This checkpoint branches from your main roadmap. Complete the prerequisites 
                                            first, then explore this resource when you're ready to deepen your understanding.
                                            Consider it an optional deep-dive that complements your core learning path.
                                        </p>
                                    </div>

                                    {/* Parent Node Info */}
                                    <div className="p-4 rounded-lg bg-purple-500/10 border border-purple-500/20">
                                        <div className="flex items-center gap-2 mb-2">
                                            <GitBranch className="h-4 w-4 text-purple-400" />
                                            <h4 className="text-sm font-semibold text-purple-400">Branches From</h4>
                                        </div>
                                        <p className="text-sm text-purple-200">
                                            {nodes.find(n => n.id === selectedCheckpoint.parentNodeId)?.data?.label as string || selectedCheckpoint.parentNodeId}
                                        </p>
                                    </div>
                                </div>
                            </ScrollArea>
                        </div>
                    )}
                </SheetContent>
            </Sheet>
        </div>
    );
}

// Resource Card Component
function ResourceCard({ resource }: { resource: any }) {
    const Icon = TYPE_ICONS[resource.type] || FileText;
    const difficultyClass = DIFFICULTY_COLORS[resource.difficulty] || DIFFICULTY_COLORS.intermediate;

    return (
        <a
            href={resource.url}
            target="_blank"
            rel="noopener noreferrer"
            className="block p-3 rounded-lg bg-black/40 hover:bg-black/60 border border-white/5 hover:border-purple-500/30 transition-all group"
        >
            <div className="flex items-start gap-3">
                <div className="p-2 rounded-md bg-purple-500/10 text-purple-400 shrink-0">
                    <Icon className="h-4 w-4" />
                </div>
                <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-1">
                        <h4 className="text-sm font-medium text-white group-hover:text-purple-300 truncate flex-1">
                            {resource.title}
                        </h4>
                        <ExternalLink className="h-3 w-3 text-white/30 group-hover:text-purple-400 shrink-0" />
                    </div>
                    <p className="text-xs text-white/60 line-clamp-2 mb-2">
                        {resource.why_recommended || resource.description}
                    </p>
                    <div className="flex items-center gap-2 flex-wrap">
                        <Badge variant="outline" className={cn("text-[10px] h-5", difficultyClass)}>
                            {resource.difficulty}
                        </Badge>
                        {resource.estimated_time && (
                            <Badge variant="outline" className="text-[10px] h-5 border-white/10 text-white/50">
                                <Clock className="h-2.5 w-2.5 mr-1" />
                                {resource.estimated_time}
                            </Badge>
                        )}
                        {resource.implementation_focus && (
                            <Badge variant="outline" className="text-[10px] h-5 border-emerald-500/30 text-emerald-400">
                                <Code className="h-2.5 w-2.5 mr-1" />
                                Hands-on
                            </Badge>
                        )}
                    </div>
                </div>
            </div>
        </a>
    );
}

// Curated Resource Card
function CuratedResourceCard({ res }: { res: { title: string; url: string; description: string } }) {
    return (
        <a
            href={res.url}
            target="_blank"
            rel="noopener noreferrer"
            className="block p-2 rounded bg-black/40 hover:bg-black/60 transition-colors group border border-white/5"
        >
            <div className="text-xs font-medium text-blue-400 flex items-center gap-1 group-hover:underline truncate">
                {res.title} <ExternalLink className="h-3 w-3 opacity-50" />
            </div>
            {res.description && (
                <div className="text-[10px] text-muted-foreground line-clamp-1 mt-0.5">{res.description}</div>
            )}
        </a>
    );
}

// Project Card
function ProjectCard({ project }: { project: any }) {
    return (
        <div className="p-3 rounded-lg bg-gradient-to-br from-purple-900/10 to-blue-900/10 border border-purple-500/20">
            <div className="flex items-start justify-between mb-2">
                <h4 className="text-sm font-semibold text-purple-300">{project.project_name}</h4>
                {project.estimated_hours && (
                    <Badge variant="outline" className="text-[10px] border-purple-500/30 text-purple-400">
                        ~{project.estimated_hours}h
                    </Badge>
                )}
            </div>
            <p className="text-xs text-white/60 mb-2">{project.description}</p>
            {project.skills_practiced && (
                <div className="flex flex-wrap gap-1">
                    {project.skills_practiced.map((skill: string, i: number) => (
                        <Badge key={i} variant="secondary" className="text-[10px] h-4 bg-purple-500/10 text-purple-300">
                            {skill}
                        </Badge>
                    ))}
                </div>
            )}
            {(project.starter_repo || project.tutorial_url) && (
                <div className="flex gap-2 mt-2 pt-2 border-t border-white/5">
                    {project.starter_repo && (
                        <a
                            href={project.starter_repo}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="text-[10px] text-blue-400 hover:underline flex items-center gap-1"
                        >
                            <Code className="h-2.5 w-2.5" /> Starter Repo
                        </a>
                    )}
                    {project.tutorial_url && (
                        <a
                            href={project.tutorial_url}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="text-[10px] text-emerald-400 hover:underline flex items-center gap-1"
                        >
                            <BookOpen className="h-2.5 w-2.5" /> Tutorial
                        </a>
                    )}
                </div>
            )}
        </div>
    );
}
