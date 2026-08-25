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
  | "asset_prompt" | "asset_set" | "voice_options" | "post_card"
  // Addendum-03 (Marketing Studio v2)
  | "campaign_option" | "template_picker" | "campaign_detail" | "model_confirm"
  | "creative_set" | "ad_card" | "intake_progress";

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

// generation_log rows — what was actually generated, as opposed to what the
// agent proposed/approved (ActivityEntry). Separate tables, never conflated.
export interface GenerationLogEntry {
  id: string;
  thread_id: string | null;
  asset_id: string | null;
  event: string; // generate | reroll | seam_qa | edit_prompt | use_as_reference
  prompt: string | null;
  model: string | null;
  seed: string | null;
  cost: number; // USD — ad-card totals are credits (1 credit = $0.10)
  created_at: number;
}

// ---- Addendum-03 §Marketing Studio v2: campaign contracts -------------------
// Mirrors app/schemas.py exactly. A campaign IS a series (same row); its
// threads carry kind="campaign".

export type CampaignObjective = "awareness" | "traffic" | "conversions";
export type CreativeType = "video" | "image";
export type CampaignStatus = "draft" | "planned" | "in_production" | "ready" | "live";

export interface ProductBlock {
  name: string;
  description: string;
  image_upload_ids: string[]; // 3–8 → product pack / consistency lock
}

export interface CampaignBlock {
  objective: CampaignObjective; // drives CCF weights
  target_audience: string;
  platforms: string[];
  description: string | null;
  creative_type: CreativeType;
}

export interface BrandBlock {
  url: string | null;
  palette: string[]; // hex
  font: string | null;
  logo_upload_id: string | null;
  tagline: string | null;
  policy_upload_id: string | null;
  // extracted from the policy doc + product description, then one-tap
  // confirmed — the confirmed list is the claims source of truth
  approved_claims: string[];
  banned_words: string[];
  claims_confirmed: boolean;
}

export interface CampaignContext {
  name: string;
  product: ProductBlock | null;
  campaign: CampaignBlock | null;
  brand: BrandBlock | null;
}

export interface CardsDone {
  product: boolean;
  campaign: boolean;
  brand: boolean;
}

export interface CampaignOption {
  option_id: string; // o1, o2, o3
  name_line: string;
  description: string;
  storyline: string;
  objective_echo: string;
  why_it_fits: string;
  evidence: Evidence[]; // source_ids or an honest gap
}

export interface TemplateRef {
  id: string;
  type: "image" | "video";
  style_descriptors: string[];
  thumb?: string | null; // /api-served thumbnail (manifest.json)
}

export interface DetailShot {
  slot: string; // shot_01 | slide_01
  duration_s: number | null;
  visual_prompt: string;
  vo_or_copy: string | null;
}

export interface CampaignDetail {
  creative_type: CreativeType;
  shots: DetailShot[];
  copy_primary: string;
  cta: string;
  claims_used: string[]; // ⊆ confirmed claims
  style_ref: TemplateRef | null;
  version: number;
  changes: string[]; // refine-loop diff log
}

export interface VariantSpec {
  variant_id: string; // A, B, C
  delta: string; // named delta — never a rewording
  hypothesis: string;
  cost_usd: number;
}

export interface ModelConfirm {
  recommended_model: string;
  reason: string;
  cost_usd: number;
  settings_note: string;
  variants_proposed: VariantSpec[];
}

export interface AdMedia {
  kind: "video" | "image" | "audio";
  ratio: string;
  duration_s: number | null;
  url: string;
  cover_url: string | null;
  params: Record<string, any>;
}

export interface AdCard {
  id: string;
  campaign_id: string;
  thread_id: string;
  option_id: string;
  variant_group_id: string | null;
  variant_id: string | null;
  creative_type: CreativeType;
  placements: Record<string, string>; // platform → copy
  ratios: string[];
  naming: string;
  media: AdMedia[];
  total_cost_credits: number;
  status: "draft" | "ready" | "live";
  created_at: number;
}

export interface SeatScore {
  element: ElementName;
  rating: Rating;
  reason: string;
  evidence: Evidence[];
}

export interface SeatReview {
  seat: "performance" | "brand" | "platform";
  element_scores: SeatScore[];
  kill_recommendation: string | null;
  fixes: { priority: number; change: string }[];
}

export interface CampaignSummary {
  id: string;
  name: string;
  objective: string;
  status: CampaignStatus;
  creative_count: number;
  spend_credits: number;
  thread_id: string | null;
}

export interface CampaignRecord {
  id: string;
  name: string;
  context: CampaignContext;
  status: CampaignStatus;
  cards_done: CardsDone;
  threads: Thread[];
  ad_cards: AdCard[];
}

// system extractor pipeline — never an agent tool; the user confirms the fill
export interface BrandExtract {
  palette: string[];
  font: string | null;
  logo_url: string | null;
  tagline: string | null;
  source_url: string;
  notes: string[];
}

export interface ClaimsExtract {
  approved_claims: string[];
  banned_words: string[];
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

export type AgentRun = {
  run_id: string;
  agent: string;
  model: string;
  prompt_version: string;
  mock: boolean;
  attempts: number;
  duration_s: number;
  validation_errors: string[];
  tool_calls: { tool: string; input: unknown; result_count?: number }[];
  cited_source_ids: string[];
  thread_id: string | null;
  campaign_name: string | null;
  node_input: unknown;
  node_output: unknown;
  started_at: number;
};

export const api = {
  health: () => req<any>("/health"),
  // TEMPORARY debug surface — structured node input/output across ALL runs.
  // Dev-only server-side (MOCK_LLM or PLOTLINE_DEBUG_OBSERVABILITY).
  agentRuns: (limit = 200) =>
    req<{ runs: AgentRun[] }>(`/api/agent-runs?limit=${limit}`),
  profile: {
    get: () => req<any>("/api/profile"),
    put: (data: any) => req<any>("/api/profile", { method: "PUT", body: JSON.stringify(data) }),
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
    // thread-scoped, not artifact-scoped — one log covers every asset in the run
    generationLog: (id: string) =>
      req<GenerationLogEntry[]>(`/api/threads/${id}/generation-log`),
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
  // ---- Addendum-03: Marketing Studio ----
  campaigns: {
    list: () => req<CampaignSummary[]>("/api/campaigns"),
    get: (id: string) => req<CampaignRecord>(`/api/campaigns/${id}`),
    create: (name: string) =>
      req<{ campaign_id: string; thread: Thread }>("/api/campaigns", {
        method: "POST",
        body: JSON.stringify({ name }),
      }),
    saveBlock: (id: string, block: "product" | "campaign" | "brand", data: any) =>
      req<{ context: CampaignContext; cards_done: CardsDone }>(
        `/api/campaigns/${id}/blocks/${block}`,
        { method: "PUT", body: JSON.stringify(data) }
      ),
    // system pipeline fills palette/font/logo/tagline; the user confirms/edits
    fetchBrand: (id: string, url: string) =>
      req<BrandExtract>(`/api/campaigns/${id}/brand/fetch`, {
        method: "POST",
        body: JSON.stringify({ url }),
      }),
    // candidates only — confirmed list is written back via saveBlock("brand")
    extractClaims: (id: string) =>
      req<ClaimsExtract>(`/api/campaigns/${id}/claims/extract`, { method: "POST" }),
    // 422 lists the missing blocks — rumination never starts on a half context
    start: (id: string) => req<{ ok: true }>(`/api/campaigns/${id}/start`, { method: "POST" }),
  },
  templates: {
    list: () => req<TemplateRef[]>("/api/templates"),
  },
  adCards: {
    list: (campaignId?: string) =>
      req<AdCard[]>(`/api/ad-cards${campaignId ? `?campaign_id=${encodeURIComponent(campaignId)}` : ""}`),
    get: (id: string) => req<AdCard>(`/api/ad-cards/${id}`),
    bundleUrl: (id: string) => `${API_URL}/api/ad-cards/${id}/bundle`,
    markLive: (id: string) => req<AdCard>(`/api/ad-cards/${id}/mark-live`, { method: "POST" }),
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

// Addendum-03 My Campaigns lifecycle: Draft → Planned → In production → Ready → Live
export const CAMPAIGN_STATUS_LABELS: Record<string, string> = {
  draft: "Draft",
  planned: "Planned",
  in_production: "In production",
  ready: "Ready",
  live: "Live",
};

export const OBJECTIVE_LABELS: Record<string, string> = {
  awareness: "Awareness",
  traffic: "Traffic",
  conversions: "Conversions",
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
