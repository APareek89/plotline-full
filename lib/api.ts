// Thin client for plotline-api. All calls go to the local orchestrator;
// the web app never talks to the RAG service or Anthropic directly.

export const API_URL =
  process.env.NEXT_PUBLIC_API_URL ?? "http://127.0.0.1:8600";

export type Rating = "H" | "M" | "L";
export type ElementName =
  | "hook_strength"
  | "audience_alignment"
  | "retention_structure"
  | "differentiation"
  | "distribution_triggers"
  | "platform_format_fit"
  | "creator_fit_feasibility"
  | "persuasion_proof";

export interface Evidence {
  tag: "REF" | "STAT" | "TREND" | "PRINCIPLE";
  source_id: string;
  claim: string;
  as_of: string | null;
}

export interface ElementScore {
  element: ElementName;
  addressed: boolean;
  proposed_rating: Rating | null;
  how_addressed: string | null;
  why_not: string | null;
  evidence: Evidence[];
}

export interface Concept {
  id: string;
  slot_date: string | null;
  title: string;
  description: string;
  creative_direction: string;
  hook: { verbal: string; first_frame: string };
  format: string;
  platform: string;
  cta: string;
  effort: "S" | "M" | "L";
  asset_needs: string[];
  element_scores: ElementScore[];
}

export interface ElementVerdict {
  element: ElementName;
  verdict: "agree" | "downgrade" | "upgrade";
  final_rating: Rating | null;
  reason: string | null;
  evidence: Evidence[];
  evidence_gap: boolean;
}

export interface ConceptVerdict {
  concept_id: string;
  element_verdicts: ElementVerdict[];
  lenses: {
    saturation: { similar_count: number; source_id: string | null; note: string | null };
    claims_safety: string;
    feasibility: string;
    platform_policy: string;
  };
  kill_flags: string[];
  fixes: { priority: number; change: string }[];
  ccs_final: number;
}

export interface Option {
  option_id: "A" | "B" | "C";
  angle_label: string;
  hook: { verbal: string; first_frame: string };
  creative_direction_delta: string;
  ccs: number;
}

export interface PlanBundle {
  version: number;
  plan: {
    series: {
      objective: string;
      north_star_metric: string;
      pillar_mix: string | null;
      cadence: Record<string, unknown>;
      checkpoint_date: string | null;
    };
    concepts: Concept[];
    changes: string[];
  };
  feedback: { concept_verdicts: ConceptVerdict[] } | null;
  options: { concept_options: { concept_id: string; options: Option[] }[] } | null;
}

export interface ConceptState {
  series_id: string;
  concept_id: string;
  status: "qualified" | "strong" | "rework" | "approved";
  ccs: number;
  order_idx: number;
  regen_count: number;
  approved: number;
}

export interface Series {
  id: string;
  name: string;
  status: string;
  context: Record<string, any>;
  created_at: number;
  concept_total?: number;
  concept_approved?: number;
  plan_bundle?: PlanBundle | null;
  concept_states?: ConceptState[];
}

export interface InspirationCard {
  source_id: string;
  title: string;
  platform: string;
  niche: string;
  format: string;
  duration_s: number;
  description: string;
  hook_text?: string;
  hook_type?: string;
  stats?: Record<string, number>;
  as_of: string;
  why_it_works: string;
  sample_data?: boolean;
}

// ---- Addendum-01 §05: interaction envelope ----------------------------------

export type ArtifactType =
  | "context_summary" | "inspiration_set" | "format_options" | "concept"
  | "plan" | "options" | "escalation" | "confidence_card" | "script_package"
  | "brand_kit" | "final_delivery"
  | "asset_prompt" | "asset_set" | "voice_options" | "post_card";

export interface ArtifactAction {
  id: string;
  label: string;
  style: "primary" | "secondary" | "danger";
  event: string;
}

export interface ArtifactEnvelope {
  type: ArtifactType;
  id: string;
  title: string;
  payload: any;
  actions: ArtifactAction[];
}

export interface AgentMessage {
  thread_id: string;
  text: string;
  artifacts: ArtifactEnvelope[];
  question: string | null;
}

export interface ThreadMessage {
  id: string;
  seq: number;
  role: "agent" | "user";
  envelope: AgentMessage | Record<string, any>;
  created_at: number;
}

export interface Thread {
  id: string;
  series_id: string;
  ordinal: number;
  kind: string;
  stage: string;
  series_name?: string;
  working?: string | null;
  messages?: ThreadMessage[];
  concept_states?: ConceptState[];
}

export interface ActivityEntry {
  event: string;
  detail: string | null;
  created_at: number;
}

async function req<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(`${API_URL}${path}`, {
    ...init,
    headers: { "Content-Type": "application/json", ...(init?.headers ?? {}) },
    cache: "no-store",
  });
  if (!res.ok) {
    const body = await res.text().catch(() => "");
    throw new Error(`${res.status} ${res.statusText}: ${body.slice(0, 300)}`);
  }
  return res.json();
}

export const api = {
  health: () => req<any>("/health"),
  profile: {
    get: () => req<any>("/api/profile"),
    put: (data: any) => req<any>("/api/profile", { method: "PUT", body: JSON.stringify(data) }),
  },
  series: {
    list: () => req<Series[]>("/api/series"),
    get: (id: string) => req<Series>(`/api/series/${id}`),
    create: (form: any, uploadIds: string[]) =>
      req<{ id: string; context: any; thread?: Thread }>("/api/series", {
        method: "POST",
        body: JSON.stringify({ form, upload_ids: uploadIds }),
      }),
    threads: (id: string) => req<Thread[]>(`/api/series/${id}/threads`),
    inspiration: (id: string) =>
      req<{ sample_data: boolean; selection_enabled: boolean; cards: InspirationCard[] }>(
        `/api/series/${id}/inspiration`
      ),
    generate: (id: string) =>
      req<{ run_id: string }>(`/api/series/${id}/generate`, { method: "POST" }),
    approve: (id: string, conceptId: string) =>
      req(`/api/series/${id}/concepts/${conceptId}/approve`, { method: "POST" }),
    unapprove: (id: string, conceptId: string) =>
      req(`/api/series/${id}/concepts/${conceptId}/unapprove`, { method: "POST" }),
    regenerate: (id: string, conceptId: string, feedback: string) =>
      req<{ run_id: string }>(`/api/series/${id}/concepts/${conceptId}/regenerate`, {
        method: "POST",
        body: JSON.stringify({ feedback }),
      }),
    reorder: (id: string, orderedIds: string[]) =>
      req(`/api/series/${id}/reorder`, {
        method: "POST",
        body: JSON.stringify({ ordered_ids: orderedIds }),
      }),
  },
  threads: {
    get: (id: string, afterSeq = 0) => req<Thread>(`/api/threads/${id}?after_seq=${afterSeq}`),
    // §05: both input paths normalize to a UserEvent; same handler server-side
    sendText: (id: string, text: string, panelFocus?: string | null) =>
      req(`/api/threads/${id}/events`, {
        method: "POST",
        body: JSON.stringify({
          thread_id: id, type: "text", text,
          panel_focus: panelFocus ?? null,
        }),
      }),
    sendAction: (id: string, artifactId: string, event: string) =>
      req(`/api/threads/${id}/events`, {
        method: "POST",
        body: JSON.stringify({
          thread_id: id, type: "action",
          action: { artifact_id: artifactId, event },
        }),
      }),
    activity: (id: string, artifactId: string) =>
      req<ActivityEntry[]>(`/api/threads/${id}/artifacts/${artifactId}/activity`),
  },
  uploads: {
    list: () => req<any[]>("/api/uploads"),
    create: async (file: File, kind: string) => {
      const fd = new FormData();
      fd.append("file", file);
      fd.append("kind", kind);
      const res = await fetch(`${API_URL}/api/uploads`, { method: "POST", body: fd });
      if (!res.ok) throw new Error(`upload failed: ${res.status}`);
      return res.json() as Promise<{ id: string; filename: string; kind: string }>;
    },
  },
  performance: {
    list: () => req<any[]>("/api/performance"),
    add: (data: any) => req<any>("/api/performance", { method: "POST", body: JSON.stringify(data) }),
  },
};

// CCF weights (§3.8) — mirrored for display only; the server owns the math.
export const WEIGHTS: Record<string, Partial<Record<ElementName, number>>> = {
  followers_reach: {
    hook_strength: 25, audience_alignment: 15, retention_structure: 15,
    differentiation: 15, distribution_triggers: 10, platform_format_fit: 10,
    creator_fit_feasibility: 10,
  },
  engagement: {
    hook_strength: 20, audience_alignment: 15, retention_structure: 15,
    differentiation: 10, distribution_triggers: 20, platform_format_fit: 10,
    creator_fit_feasibility: 10,
  },
  conversions: {
    hook_strength: 25, audience_alignment: 15, retention_structure: 10,
    differentiation: 10, distribution_triggers: 0, platform_format_fit: 10,
    creator_fit_feasibility: 10, persuasion_proof: 20,
  },
};

export function familyOf(objective: string): keyof typeof WEIGHTS {
  if (objective === "engagement") return "engagement";
  if (objective === "conversions") return "conversions";
  return "followers_reach";
}

export const ELEMENT_LABELS: Record<ElementName, string> = {
  hook_strength: "Hook strength",
  audience_alignment: "Audience alignment",
  retention_structure: "Retention structure",
  differentiation: "Differentiation",
  distribution_triggers: "Distribution triggers",
  platform_format_fit: "Platform-format fit",
  creator_fit_feasibility: "Creator fit & feasibility",
  persuasion_proof: "Persuasion & proof",
};

export const PLATFORM_LABELS: Record<string, string> = {
  instagram_reels: "IG Reels",
  youtube_shorts: "YT Shorts",
  tiktok: "TikTok",
  instagram_feed: "IG Feed",
  linkedin: "LinkedIn",
  x: "X",
};

export function fmtStat(card: InspirationCard): string {
  const s = card.stats ?? {};
  if (s.views && s.views > 0) {
    const views = s.views >= 1e6 ? `${(s.views / 1e6).toFixed(1)}M` : `${Math.round(s.views / 1e3)}K`;
    const er = s.engagement_rate ? ` · ER ${(s.engagement_rate * 100).toFixed(1)}%` : "";
    return `${views} views${er}`;
  }
  if (s.days_live) return `${s.days_live} days live (ad library)`;
  return "—";
}
