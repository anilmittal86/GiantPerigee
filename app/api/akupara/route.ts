// File location: app/api/akupara/route.ts
// Uses the same GEMINI_API_KEY already in your .env

import { NextRequest, NextResponse } from "next/server";
import { MODELS } from "../../config/models";

const MODEL_CHAIN = MODELS.akupara;

export async function POST(req: NextRequest) {
  try {
    const { system, prompt } = await req.json();

    const apiKey = process.env.GEMINI_API_KEY || process.env.GOOGLE_API_KEY || "";
    if (!apiKey) {
      return NextResponse.json({ error: "No Gemini API key found in env" }, { status: 500 });
    }

    const body = {
      system_instruction: {
        parts: [{ text: system }],
      },
      contents: [
        {
          role: "user",
          parts: [{ text: prompt }],
        },
      ],
      generationConfig: {
        maxOutputTokens: 1500,
        temperature: 0.7,
      },
    };

    for (let i = 0; i < MODEL_CHAIN.length; i++) {
      const modelName = MODEL_CHAIN[i];
      const url = `https://generativelanguage.googleapis.com/v1beta/models/${modelName}:generateContent?key=${apiKey}`;

      console.log(`[akupara] Trying model: ${modelName}...`);
      const response = await fetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });

      const data = await response.json();

      if (response.ok) {
        console.log(`[akupara] Success with model: ${modelName}`);
        const text = data.candidates?.[0]?.content?.parts?.[0]?.text || "";
        return NextResponse.json({ text });
      }

      // Check if rate-limited and we have more models to try
      const isRateLimit = response.status === 429 ||
        data.error?.message?.includes("RESOURCE_EXHAUSTED") ||
        data.error?.message?.includes("quota");

      if (isRateLimit && i < MODEL_CHAIN.length - 1) {
        console.warn(`[akupara] Rate limited on ${modelName}, falling back to ${MODEL_CHAIN[i + 1]}...`);
        continue;
      }

      // Not rate-limited or no more fallbacks
      return NextResponse.json(
        { error: data.error?.message || "Gemini API error" },
        { status: response.status }
      );
    }

    return NextResponse.json({ error: "All models exhausted" }, { status: 429 });
  } catch (err: any) {
    return NextResponse.json({ error: err.message || "Server error" }, { status: 500 });
  }
}
