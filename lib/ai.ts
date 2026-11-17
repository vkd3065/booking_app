// 외부 AI(Gemini) 호출. 서버에서만 사용 (키는 서버 환경 변수 GEMINI_API_KEY)
const MODEL = process.env.GEMINI_MODEL || "gemini-flash-latest";

export function aiReady() {
  return !!process.env.GEMINI_API_KEY;
}

// 지시문과 자료를 보내고 JSON 답을 받음
export async function askAI(system: string, user: string): Promise<Record<string, unknown>> {
  const res = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${MODEL}:generateContent`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-goog-api-key": process.env.GEMINI_API_KEY!,
    },
    body: JSON.stringify({
      systemInstruction: { parts: [{ text: system }] },
      contents: [{ role: "user", parts: [{ text: user }] }],
      generationConfig: { responseMimeType: "application/json", temperature: 0.2 },
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
