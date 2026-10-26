// Real provider adapters. Each maps the unified chat request to the provider's
// actual HTTP API and normalizes the response + token usage.
import { randomUUID } from "node:crypto";

// Unified message shape: [{ role, content }]
function toOpenAIMessages(messages) {
  return messages.map((m) => ({ role: m.role, content: m.content }));
}

async function callOpenAICompatible(provider, model, messages) {
  const res = await fetch(`${provider.baseUrl}/chat/completions`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${provider.apiKey}`,
    },
    body: JSON.stringify({ model, messages: toOpenAIMessages(messages) }),
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data?.error?.message || `HTTP ${res.status}`);
  return {
    text: data.choices?.[0]?.message?.content ?? "",
    tokensIn: data.usage?.prompt_tokens ?? 0,
    tokensOut: data.usage?.completion_tokens ?? 0,
    model: data.model ?? model,
  };
}

async function callAnthropic(provider, model, messages) {
  const system = messages.find((m) => m.role === "system")?.content;
  const rest = messages.filter((m) => m.role !== "system");
  const res = await fetch(`${provider.baseUrl}/messages`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-api-key": provider.apiKey,
      "anthropic-version": "2023-06-01",
    },
    body: JSON.stringify({
      model,
      max_tokens: 2048,
      system,
      messages: rest.map((m) => ({ role: m.role, content: m.content })),
    }),
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data?.error?.message || `HTTP ${res.status}`);
  return {
    text: data.content?.[0]?.text ?? "",
    tokensIn: data.usage?.input_tokens ?? 0,
    tokensOut: data.usage?.output_tokens ?? 0,
    model: data.model ?? model,
  };
}

async function callGemini(provider, model, messages) {
  const system = messages.find((m) => m.role === "system")?.content;
  const contents = messages
    .filter((m) => m.role !== "system")
    .map((m) => ({
      role: m.role === "assistant" ? "model" : "user",
      parts: [{ text: m.content }],
    }));
  const url = `${provider.baseUrl}/models/${model}:generateContent?key=${provider.apiKey}`;
  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      contents,
      systemInstruction: system ? { parts: [{ text: system }] } : undefined,
    }),
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data?.error?.message || `HTTP ${res.status}`);
  return {
    text: data.candidates?.[0]?.content?.parts?.[0]?.text ?? "",
    tokensIn: data.usageMetadata?.promptTokenCount ?? 0,
    tokensOut: data.usageMetadata?.candidatesTokenCount ?? 0,
    model,
  };
}

export async function callProvider(provider, model, messages) {
  if (provider.id === "anthropic") return callAnthropic(provider, model, messages);
  if (provider.id === "gemini") return callGemini(provider, model, messages);
  return callOpenAICompatible(provider, model, messages);
}

// ---- Auto-discover available models from the provider's real API ----
export async function listModels(provider) {
  if (provider.id === "anthropic") return listAnthropicModels(provider);
  if (provider.id === "gemini") return listGeminiModels(provider);
  return listOpenAIModels(provider);
}

async function listOpenAIModels(provider) {
  const res = await fetch(`${provider.baseUrl}/models`, {
    headers: { Authorization: `Bearer ${provider.apiKey}` },
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data?.error?.message || `HTTP ${res.status}`);
  const arr = data.data || data.models || [];
  return arr.map((m) => m.id).filter(Boolean).sort();
}

async function listAnthropicModels(provider) {
  const res = await fetch(`${provider.baseUrl}/models`, {
    headers: {
      "x-api-key": provider.apiKey,
      "anthropic-version": "2023-06-01",
    },
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data?.error?.message || `HTTP ${res.status}`);
  return (data.data || []).map((m) => m.id).filter(Boolean).sort();
}

async function listGeminiModels(provider) {
  const res = await fetch(
    `${provider.baseUrl}/models?key=${provider.apiKey}&pageSize=200`
  );
  const data = await res.json();
  if (!res.ok) throw new Error(data?.error?.message || `HTTP ${res.status}`);
  return (data.models || [])
    .filter((m) => (m.supportedGenerationMethods || []).includes("generateContent"))
    .map((m) => m.name.replace(/^models\//, ""))
    .sort();
}

export function estimateCost(provider, model, tokensIn, tokensOut) {
  const p = provider.pricing?.[model];
  if (!p) return 0;
  return (tokensIn / 1e6) * p.input + (tokensOut / 1e6) * p.output;
}

export function newId() {
  return randomUUID();
}
