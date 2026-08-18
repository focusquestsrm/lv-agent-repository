import dagre from "@dagrejs/dagre";
import { compareResources } from "./duplicates.js";

export const CONNECTION_TYPES = ["next", "feedback", "conditional", "nested", "supporting"];
export const MAPPING_RELATIONSHIPS = ["performs", "supports", "automates", "provides_data", "receives_data", "planned"];

export function classifyLifecycleStructure(phases = [], stages = [], connections = []) {
  const hasPhases = phases.length > 0;
  const hasNested = stages.some((stage) => stage.parent_stage_id) || connections.some((connection) => connection.connection_type === "nested");
  const ordered = [...stages].sort((a, b) => Number(a.sequence) - Number(b.sequence));
  const hasCircular = ordered.length > 1 && connections.some((connection) => connection.from_stage_id === ordered.at(-1)?.id && connection.to_stage_id === ordered[0]?.id);
  const kinds = [hasPhases && "phased", hasNested && "nested", hasCircular && "circular"].filter(Boolean);
  if (kinds.length > 1) return "hybrid";
  if (hasPhases) return "phased";
  if (hasNested) return "nested";
  if (hasCircular) return "circular";
  return "linear";
}

export function validateConnection(connections, source, target, type, repeatConfirmed = false) {
  if (!source || !target) return { valid: false, message: "Choose both a source and target stage." };
  if (source === target && !repeatConfirmed) return { valid: false, message: "A self-connection must be explicitly identified as a repeat or loop." };
  if (connections.some((connection) => connection.from_stage_id === source && connection.to_stage_id === target && connection.connection_type === type)) return { valid: false, message: "That connection already exists." };
  return { valid: true, message: "" };
}

export function autoArrangeLifecycle(phases = [], stages = [], connections = []) {
  const graph = new dagre.graphlib.Graph().setDefaultEdgeLabel(() => ({}));
  graph.setGraph({ rankdir: "LR", ranksep: 90, nodesep: 55, marginx: 30, marginy: 30 });
  stages.forEach((stage) => graph.setNode(stage.id, { width: 210, height: 108 }));
  connections.filter((connection) => connection.from_stage_id !== connection.to_stage_id).forEach((connection) => graph.setEdge(connection.from_stage_id, connection.to_stage_id));
  dagre.layout(graph);
  const positions = {};
  stages.forEach((stage, index) => {
    const node = graph.node(stage.id);
    positions[stage.id] = node ? { x: Math.round(node.x - 105), y: Math.round(node.y - 54) } : { x: index * 260, y: 80 };
  });
  phases.forEach((phase, phaseIndex) => {
    const children = stages.filter((stage) => stage.phase_id === phase.id).map((stage) => positions[stage.id]).filter(Boolean);
    positions[phase.id] = children.length ? { x: Math.min(...children.map((point) => point.x)) - 35, y: Math.min(...children.map((point) => point.y)) - 75 } : { x: phaseIndex * 340, y: 10 };
  });
  return positions;
}

export function lifecycleSummary(phases = [], stages = [], mappings = [], resources = []) {
  const activeResources = resources.filter((resource) => resource.status !== "retired");
  const stageMappings = (stageId) => mappings.filter((mapping) => mapping.stage_id === stageId && activeResources.some((resource) => resource.id === mapping.resource_id));
  const gaps = stages.filter((stage) => stageMappings(stage.id).length === 0);
  const supported = stages.filter((stage) => stageMappings(stage.id).length > 0);
  const overlaps = stages.filter((stage) => {
    const mapped = stageMappings(stage.id).map((mapping) => activeResources.find((resource) => resource.id === mapping.resource_id)).filter(Boolean);
    return mapped.some((resource, index) => mapped.slice(index + 1).some((other) => compareResources(resource, other).score >= 55));
  });
  return { totalPhases: phases.length, totalStages: stages.length, supportedStages: supported.length, gaps: gaps.length, overlaps: overlaps.length, mappedResources: new Set(mappings.map((mapping) => mapping.resource_id)).size, gapIds: gaps.map((stage) => stage.id), overlapIds: overlaps.map((stage) => stage.id) };
}

export function lifecycleListGroups(phases = [], stages = []) {
  const orderedPhases = [...phases].sort((a, b) => a.sequence - b.sequence);
  const groups = orderedPhases.map((phase) => ({ phase, stages: stages.filter((stage) => stage.phase_id === phase.id).sort((a, b) => a.sequence - b.sequence) }));
  const unphased = stages.filter((stage) => !stage.phase_id).sort((a, b) => a.sequence - b.sequence);
  if (unphased.length) groups.push({ phase: null, stages: unphased });
  return groups;
}
