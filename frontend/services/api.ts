const API_URL = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000";

export async function analyzeFast(idea: string, category?: string) {
  const res = await fetch(`${API_URL}/api/analyze/fast`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ idea, category }),
  });
  if (!res.ok) throw new Error("Analysis failed");
  return res.json();
}

export async function analyzeDeepStream(
  idea: string,
  category: string | null,
  onProgress: (msg: string) => void,
  onDone: (data: any) => void,
  onError: (err: string) => void,
) {
  const res = await fetch(`${API_URL}/api/analyze/deep`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ idea, category }),
  });

  if (!res.ok) { onError(`Server error: ${res.status}`); return; }
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
