import type { AgentMessage, AgentQuestion, ArtifactEnvelope, ThreadMessage } from "../api";

/** A new campaign needs only these two inputs; planning details belong in chat. */
export function campaignStartProblem(text: string, uploadIds: string[]): string | null {
  if (!text.trim()) return "Add one line about the campaign you want to make.";
  if (!uploadIds.length) return "Attach at least one product image to get started.";
  return null;
}

export function campaignNameFromPrompt(text: string, existingNames: string[] = []): string {
  const base = text.trim().replace(/\s+/g, " ").slice(0, 90) || "New campaign";
  const taken = new Set(existingNames.map((name) => name.trim().toLowerCase()));
  if (!taken.has(base.toLowerCase())) return base;
  let suffix = 2;
  while (taken.has(`${base} (${suffix})`.toLowerCase())) suffix++;
  return `${base} (${suffix})`;
}

/** A newer turn supersedes the old ask, even when it is a status/error turn. */
export function latestCampaignQuestion(messages: ThreadMessage[]): { q: AgentQuestion; msgId: string } | null {
  const latest = messages.at(-1);
  if (!latest || latest.role !== "agent") return null;
  const q = (latest.envelope as AgentMessage).question;
  return q ? { q, msgId: latest.id } : null;
}

/** Old cards are history, not fresh approvals. Only the current server ask is live. */
export function campaignArtifactForReview(artifact: ArtifactEnvelope, question: AgentQuestion | null): ArtifactEnvelope {
  const offered = new Set((question?.options ?? [])
    .filter((option) => option.artifact_id === artifact.id && option.event)
    .map((option) => option.event));
  return { ...artifact, actions: (artifact.actions ?? []).filter((action) => offered.has(action.event)) };
}
