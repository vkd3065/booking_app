// 외부 AI(Gemini) 호출. 서버에서만 사용
// VERTEX_API_KEY가 있으면 Vertex AI(Google Cloud), 없으면 AI Studio의 GEMINI_API_KEY 사용
// 모델은 Gemini 4 Hydrogen, 추론 수준은 HIGH (환경 변수 GEMINI_MODEL, GEMINI_THINKING으로 바꿀 수 있음)
const MODEL = process.env.GEMINI_MODEL || "gemini-4-hydrogen";
const THINKING = process.env.GEMINI_THINKING || "HIGH";

export function aiReady() {
  return !!(process.env.VERTEX_API_KEY || process.env.GEMINI_API_KEY);
}

// 어디로 보낼지 (주소, 헤더)
function target(): { url: string; headers: Record<string, string> } {
  const vertexKey = process.env.VERTEX_API_KEY;
  if (vertexKey) {
    return {
      url: `https://aiplatform.googleapis.com/v1/publishers/google/models/${MODEL}:generateContent?key=${vertexKey}`,
      headers: { "Content-Type": "application/json" },
    };
  }
  return {
    url: `https://generativelanguage.googleapis.com/v1beta/models/${MODEL}:generateContent`,
    headers: { "Content-Type": "application/json", "x-goog-api-key": process.env.GEMINI_API_KEY! },
  };
}

// 지시문과 자료를 보내고 JSON 답을 받음 (요청 형식은 두 곳이 같음)
export async function askAI(system: string, user: string): Promise<Record<string, unknown>> {
  const { url, headers } = target();
  const res = await fetch(url, {
    method: "POST",
    headers,
    body: JSON.stringify({
      systemInstruction: { parts: [{ text: system }] },
      contents: [{ role: "user", parts: [{ text: user }] }],
      // Gemini 3 이후 모델은 temperature를 기본값으로 두는 것이 권장이라 지정하지 않음
      generationConfig: { responseMimeType: "application/json", thinkingConfig: { thinkingLevel: THINKING } },
    }),
  });
  if (!res.ok) {
    throw new Error("AI_HTTP_" + res.status);
  }
  const body = await res.json();
  const text: string = (body?.candidates?.[0]?.content?.parts ?? [])
    .map((p: { text?: string }) => p.text ?? "")
    .join("");
  try {
    return JSON.parse(text);
  } catch {
    // JSON이 아니면 글만 답으로 사용
    return { answer: text };
  }
}
