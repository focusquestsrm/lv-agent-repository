export const PROPRIETARY_NOTICE = "The agents, skillsets, platforms, lifecycle maps, and related information contained in The Hub are proprietary to and owned by Lead Ventures. Access and use are limited to authorized users.";
export const SHORT_PROPRIETARY_NOTICE = "Proprietary Lead Ventures information. Authorized access and use only.";

export const LIFECYCLE_TEMPLATES = {
  focusquest: {
    name: "FocusQuest Operational Lifecycle",
    description: "A phased institution-to-outcomes lifecycle with a nested student journey.",
    lifecycle_type: "phased",
    phases: [
      ["Phase I – Acquire the Institution", ["Market Intelligence & Target Identification", "Lead Generation & Institutional Outreach", "Contact Established, Discovery & Program Audit", "Solution Design & Proposal"]],
      ["Phase II – Commit and Build", ["Partnership Agreement & Procurement", "Onboarding: Program Build & Platform Delivery", "Faculty & Staff Enablement"]],
      ["Phase III – Deliver the Student Journey", ["Student Acquisition & Enrollment", "Student Success & Engagement", "Workforce Readiness & Career Outcomes"]],
      ["Phase IV – Prove and Grow", ["Outcomes Reporting, Renewal & Expansion"]],
    ],
    nestedStage: "Student Acquisition & Enrollment",
  },
  d9: {
    name: "D9 Network Member Lifecycle",
    description: "A circular member lifecycle with activation, referral, and recovery feedback paths.",
    lifecycle_type: "circular",
    phases: [["Member Lifecycle", ["Discover", "Join", "Activate", "Engage", "Upgrade", "Advocate", "Renew or Recover"]]],
    connections: [["Join", "Activate", "feedback"], ["Activate", "Engage", "feedback"], ["Advocate", "Discover", "feedback"], ["Renew or Recover", "Engage", "feedback"]],
  },
};

export function suggestLifecycleAlignment(resource, stages = []) {
  const resourceTokens = new Set(`${resource.name || ""} ${resource.description || ""} ${resource.skills_summary || ""} ${resource.category || ""} ${resource.integrations || ""}`.toLowerCase().split(/[^a-z0-9]+/).filter((word) => word.length > 3));
  return stages.map((stage) => {
    const stageTokens = new Set(`${stage.name || ""} ${stage.purpose || ""} ${(stage.activities || []).join(" ")}`.toLowerCase().split(/[^a-z0-9]+/).filter((word) => word.length > 3));
    const matches = [...resourceTokens].filter((word) => stageTokens.has(word));
    const confidence = resourceTokens.size && stageTokens.size ? Math.round((matches.length / Math.min(resourceTokens.size, stageTokens.size)) * 100) : 0;
    return { stage, confidence: Math.min(confidence, 100), explanation: matches.length ? `Shared concepts: ${matches.join(", ")}.` : "No strong deterministic keyword match was found." };
  }).filter((item) => item.confidence >= 15).sort((a, b) => b.confidence - a.confidence);
}
