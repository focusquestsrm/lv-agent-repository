const categories = [
  "Fairness & bias",
  "Privacy & data",
  "Accuracy & grounding",
  "Safety & oversight",
  "Transparency",
  "Security",
];

export default async (request) => {
  if (request.method !== "POST") {
    return Response.json({ error: "Method not allowed" }, { status: 405 });
  }

  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    return Response.json(
      { error: "Governance service is not configured." },
      { status: 503 },
    );
  }

  let entry;
  try {
    entry = await request.json();
  } catch {
    return Response.json({ error: "Invalid request body." }, { status: 400 });
  }

  const response = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "x-api-key": apiKey,
      "anthropic-version": "2023-06-01",
    },
    body: JSON.stringify({
      model: process.env.ANTHROPIC_MODEL || "claude-sonnet-4-20250514",
      max_tokens: 1400,
      temperature: 0,
      system:
        "You are an enterprise AI governance reviewer. Assess only evidence present in the submitted registry entry. Do not invent risks. A low-risk entry should remain low. Medium, high, or critical risk requires a concrete, actionable finding. Evaluate fairness/bias, privacy/data, accuracy/grounding, safety/oversight, transparency, and security.",
      messages: [
        {
          role: "user",
          content: `Assess this proposed ${entry.entry_type || "agent"}:\n${JSON.stringify(entry)}`,
        },
      ],
      tools: [
        {
          name: "submit_governance_assessment",
          description: "Return the structured governance assessment.",
          input_schema: {
            type: "object",
            required: ["risk_level", "governance_score", "summary", "checks"],
            properties: {
              risk_level: {
                type: "string",
                enum: ["low", "medium", "high", "critical"],
              },
              governance_score: { type: "integer", minimum: 0, maximum: 100 },
              summary: { type: "string" },
              checks: {
                type: "array",
                minItems: 6,
                maxItems: 6,
                items: {
                  type: "object",
                  required: ["category", "score", "status", "findings"],
                  properties: {
                    category: { type: "string", enum: categories },
                    score: { type: "integer", minimum: 0, maximum: 100 },
                    status: {
                      type: "string",
                      enum: ["passed", "attention", "failed"],
                    },
                    findings: { type: "string" },
                  },
                },
              },
            },
          },
        },
      ],
      tool_choice: { type: "tool", name: "submit_governance_assessment" },
    }),
  });

  if (!response.ok) {
    const detail = await response.text();
    console.error("Governance API error", response.status, detail.slice(0, 500));
    return Response.json(
      { error: "Governance assessment could not be completed." },
      { status: 502 },
    );
  }

  const message = await response.json();
  const assessment = message.content?.find((item) => item.type === "tool_use")?.input;
  if (!assessment) {
    return Response.json(
      { error: "Governance assessment returned an invalid result." },
      { status: 502 },
    );
  }

  const flagged = ["medium", "high", "critical"].includes(
    assessment.risk_level,
  );
  return Response.json({
    ...assessment,
    flagged,
    provider: "Anthropic Claude",
  });
};
