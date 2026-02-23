import { getAccessToken } from "@/lib/supabase";

const API_URL = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000";

async function authHeaders(): Promise<Record<string, string>> {
  const token = await getAccessToken();
  const headers: Record<string, string> = { "Content-Type": "application/json" };
  if (token) headers["Authorization"] = `Bearer ${token}`;
  return headers;
}

// ═══════════════════════════════════════
// Phase 1 — Analysis
// ═══════════════════════════════════════

export async function analyzeFast(idea: string, category?: string, turnstileToken?: string) {
  const res = await fetch(`${API_URL}/api/analyze/fast`, {
    method: "POST",
    headers: await authHeaders(),
    body: JSON.stringify({ idea, category, turnstile_token: turnstileToken }),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({ detail: "Analysis failed" }));
    throw new Error(err.detail || `Server error: ${res.status}`);
  }
  return res.json();
}

export async function analyzeDeepStream(
  idea: string,
  category: string | null,
  onProgress: (msg: string) => void,
  onDone: (data: any) => void,
  onError: (err: string) => void,
  turnstileToken?: string,
) {
  const res = await fetch(`${API_URL}/api/analyze/deep`, {
    method: "POST",
    headers: await authHeaders(),
    body: JSON.stringify({ idea, category, turnstile_token: turnstileToken }),
  });

  if (!res.ok) {
    const err = await res.json().catch(() => ({ detail: "Research failed" }));
    onError(err.detail || `Server error: ${res.status}`);
    return;
  }
  if (!res.body) { onError("No response body"); return; }

  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });
    const blocks = buffer.split("\n\n");
    buffer = blocks.pop() || "";

    for (const block of blocks) {
      if (block.startsWith(":")) continue;
      const dataLine = block.split("\n").find((l) => l.startsWith("data: "));
      const eventLine = block.split("\n").find((l) => l.startsWith("event: "));
      if (!dataLine) continue;
      try {
        const data = JSON.parse(dataLine.slice(6));
        const event = eventLine?.slice(7) || "message";
        if (event === "progress") onProgress(data.message);
        else if (event === "done") onDone(data);
        else if (event === "error") onError(data.message);
      } catch {}
    }
  }
}

export async function getResearchHistory() {
  const res = await fetch(`${API_URL}/api/research`, { headers: await authHeaders() });
  if (!res.ok) return [];
  const data = await res.json();
  return data.research || [];
}

export async function getResearchDetail(id: string) {
  const res = await fetch(`${API_URL}/api/research/${id}`, { headers: await authHeaders() });
  if (!res.ok) throw new Error("Research not found");
  return res.json();
}

// ═══════════════════════════════════════
// Phase 2 — Chat
// ═══════════════════════════════════════

export async function sendChatMessage(researchId: string, message: string) {
  const res = await fetch(`${API_URL}/api/research/${researchId}/chat`, {
    method: "POST",
    headers: await authHeaders(),
    body: JSON.stringify({ message }),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({ detail: "Chat failed" }));
    throw new Error(err.detail || `Server error: ${res.status}`);
  }
  return res.json();
}

export async function getChatHistory(researchId: string) {
  const res = await fetch(`${API_URL}/api/research/${researchId}/chat/history`, {
    headers: await authHeaders(),
  });
  if (!res.ok) return [];
  const data = await res.json();
  return data.messages || [];
}

// ═══════════════════════════════════════
// Phase 2 — Notes
// ═══════════════════════════════════════

export async function getNotes(researchId: string): Promise<string> {
  const res = await fetch(`${API_URL}/api/research/${researchId}/notes`, {
    headers: await authHeaders(),
  });
  if (!res.ok) return "";
  const data = await res.json();
  return data.notes || "";
}

export async function saveNotes(researchId: string, notes: string) {
  const res = await fetch(`${API_URL}/api/research/${researchId}/notes`, {
    method: "PUT",
    headers: await authHeaders(),
    body: JSON.stringify({ notes }),
  });
  if (!res.ok) throw new Error("Could not save notes");
  return res.json();
}

// ═══════════════════════════════════════
// Phase 2 — PDF Export
// ═══════════════════════════════════════

export async function downloadPdf(researchId: string) {
  const token = await getAccessToken();
  const headers: Record<string, string> = {};
  if (token) headers["Authorization"] = `Bearer ${token}`;

  const res = await fetch(`${API_URL}/api/research/${researchId}/export/pdf`, { headers });
  if (!res.ok) {
    const err = await res.json().catch(() => ({ detail: "PDF export failed" }));
    throw new Error(err.detail || `Server error: ${res.status}`);
  }

  const blob = await res.blob();
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `shiporskip-${researchId.slice(0, 8)}.pdf`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}
