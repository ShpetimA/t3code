import {
  deriveAgentPanelModel,
  type RuntimeSubagent,
} from "@t3tools/client-runtime/state/subagentRuntime";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vite-plus/test";

import { AgentsPanel } from "./AgentsPanel";

const STARTED_AT = "2026-08-10T12:00:00.000Z";
const COMPLETED_AT = "2026-08-10T12:00:05.000Z";

function buildAgent(input: {
  readonly id: string;
  readonly kind: RuntimeSubagent["kind"];
  readonly title: string;
  readonly parentAgentId: string | null;
  readonly phaseIndex: number | null;
}): RuntimeSubagent {
  return {
    id: input.id,
    kind: input.kind,
    title: input.title,
    role: null,
    model: null,
    effort: null,
    status: "completed",
    activationCount: 1,
    usage: null,
    progress: null,
    lastToolName: null,
    result: "Done",
    error: null,
    outputFile: null,
    parentAgentId: input.parentAgentId,
    agentIndex: null,
    phaseIndex: input.phaseIndex,
    phaseTitle: input.phaseIndex === null ? null : "Build",
    attempt: null,
    workflowName: input.kind === "workflow" ? input.title : null,
    phases: input.kind === "workflow" ? [{ index: 0, title: "Build" }] : [],
    runHandles: null,
    recentActivity: [],
    firstSeenAt: STARTED_AT,
    startedAt: STARTED_AT,
    completedAt: COMPLETED_AT,
    updatedAt: COMPLETED_AT,
  };
}

describe("AgentsPanel", () => {
  it("marks every direct agent in the requested spawn batch", () => {
    const first = buildAgent({
      id: "agent:first",
      kind: "subagent",
      title: "First agent",
      parentAgentId: null,
      phaseIndex: null,
    });
    const second = buildAgent({
      id: "agent:second",
      kind: "subagent",
      title: "Second agent",
      parentAgentId: null,
      phaseIndex: null,
    });
    const markup = renderToStaticMarkup(
      <AgentsPanel
        model={deriveAgentPanelModel({ agents: [first, second] })}
        revealRequest={{
          requestId: 1,
          target: { _tag: "Agents", agentIds: [first.id, second.id] },
        }}
      />,
    );

    expect(markup.match(/bg-info\/10/g)).toHaveLength(2);
  });

  it("expands and marks a settled workflow requested by its timeline row", () => {
    const workflow = buildAgent({
      id: "workflow:one",
      kind: "workflow",
      title: "Review workflow",
      parentAgentId: null,
      phaseIndex: null,
    });
    const member = buildAgent({
      id: "agent:reviewer",
      kind: "workflow_agent",
      title: "Reviewer",
      parentAgentId: workflow.id,
      phaseIndex: 0,
    });
    const model = deriveAgentPanelModel({ agents: [workflow, member] });

    const collapsedMarkup = renderToStaticMarkup(<AgentsPanel model={model} />);
    const revealedMarkup = renderToStaticMarkup(
      <AgentsPanel
        model={model}
        revealRequest={{
          requestId: 1,
          target: { _tag: "Workflow", workflowId: workflow.id },
        }}
      />,
    );

    expect(collapsedMarkup).not.toContain("Reviewer");
    expect(revealedMarkup).toContain("Reviewer");
    expect(revealedMarkup).toContain("border-info/40");
  });
});
