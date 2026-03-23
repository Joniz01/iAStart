export const config = { runtime: "edge" };

export default async function handler(req) {
  if (req.method === "OPTIONS") {
    return new Response(null, { status: 200, headers: {
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Methods": "POST, OPTIONS",
      "Access-Control-Allow-Headers": "Content-Type",
    }});
  }
  if (req.method !== "POST") return new Response(JSON.stringify({ error: "Method not allowed" }), { status: 405 });

  let body;
  try { body = await req.json(); } catch { return new Response(JSON.stringify({ error: "Invalid JSON" }), { status: 400 }); }

  const { provider, apiKey, systemPrompt, messages } = body;
  if (!provider || !apiKey || !messages) return new Response(JSON.stringify({ error: "Missing fields" }), { status: 400 });
  if (provider === "gemini" && !apiKey.startsWith("AIza")) return new Response(JSON.stringify({ error: "Invalid Gemini key" }), { status: 400 });
  if (provider === "groq" && !apiKey.startsWith("gsk_")) return new Response(JSON.stringify({ error: "Invalid Groq key" }), { status: 400 });

  const corsHeaders = { "Access-Control-Allow-Origin": "*", "Content-Type": "text/event-stream", "Cache-Control": "no-cache", "X-Accel-Buffering": "no" };

  try {
    if (provider === "gemini") {
      let contents = messages.map(m => ({ role: m.role === "assistant" ? "model" : "user", parts: [{ text: m.content || "" }] }));
      if (!contents.length) contents = [{ role: "user", parts: [{ text: "Inicia." }] }];
      if (contents[contents.length - 1].role !== "user") contents.push({ role: "user", parts: [{ text: "continúa" }] });
      const res = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:streamGenerateContent?alt=sse&key=${apiKey}`, {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ systemInstruction: systemPrompt ? { parts: [{ text: systemPrompt }] } : undefined, contents, generationConfig: { maxOutputTokens: 1400, temperature: 0.7 } }),
      });
      if (!res.ok) { const d = await res.json().catch(() => ({})); return new Response(JSON.stringify({ error: d?.error?.message || `Gemini ${res.status}` }), { status: res.status, headers: { "Access-Control-Allow-Origin": "*", "Content-Type": "application/json" } }); }
      return new Response(res.body, { status: 200, headers: corsHeaders });

    } else if (provider === "groq") {
      const msgs = [{ role: "system", content: systemPrompt || "Eres un tutor útil." }, ...messages.map(m => ({ role: m.role, content: m.content }))];
      const res = await fetch("https://api.groq.com/openai/v1/chat/completions", {
        method: "POST", headers: { "Content-Type": "application/json", Authorization: `Bearer ${apiKey}` },
        body: JSON.stringify({ model: "llama-3.3-70b-versatile", max_tokens: 1400, stream: true, messages: msgs }),
      });
      if (!res.ok) { const d = await res.json().catch(() => ({})); return new Response(JSON.stringify({ error: d?.error?.message || `Groq ${res.status}` }), { status: res.status, headers: { "Access-Control-Allow-Origin": "*", "Content-Type": "application/json" } }); }
      return new Response(res.body, { status: 200, headers: corsHeaders });
    }
    return new Response(JSON.stringify({ error: "Proveedor no soportado" }), { status: 400 });
  } catch (err) {
    return new Response(JSON.stringify({ error: err.message || "Error interno" }), { status: 500, headers: { "Access-Control-Allow-Origin": "*", "Content-Type": "application/json" } });
  }
}
