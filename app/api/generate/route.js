import { GoogleGenerativeAI } from "@google/generative-ai";
import { NextResponse } from "next/server";

export async function POST(req) {
    try {
        console.log("Generate API called");
        const { product_info, guidelines, gemini_api_key: clientKey } = await req.json();

        let gemini_api_key = clientKey;

        // Fallback to server-side env var if not provided by client
        if (!gemini_api_key) {
            console.log("Using server-side GEMINI_API_KEY");
            gemini_api_key = process.env.GEMINI_API_KEY;
        } else {
            console.log("Using client-side provided key");
        }

        if (!gemini_api_key) {
            console.error("No API key found");
            return NextResponse.json(
                { error: "Gemini API Key is required" },
                { status: 400 }
            );
        }

        const genAI = new GoogleGenerativeAI(gemini_api_key);
        // User has access to gemini-2.0-flash
        console.log("Initializing Gemini model...");
        const model = genAI.getGenerativeModel({
            model: "gemini-2.0-flash",
            tools: [{ googleSearch: {} }],
        });

        const prompt = `Role: You are the Lead Content Strategist for a cutting-edge firm.
        
        Goal: Write 3 distinct, high-impact LinkedIn posts.

        Brand Voice (Guidelines):
        ${guidelines}

        Context (Product/Topic):
        ${product_info}

        Task:
        Create 3 distinct options. Each option MUST follow this exact structure:
        
        1. The Hook: A one-line scroll-stopper. (e.g., "Google Search is dying. Is your brand ready?")
        2. The Agitation: Why the old way is failing or the problem.
        3. The Insight: The specific value/solution based on the provided Context.
        4. The CTA: A soft call to action.

        Generate these 3 specific types of posts:
        Option 1: The Wake Up Call (A hard truth).
        Option 2: The Insight / How-To (Actionable advice).
        Option 3: Myth-Busting or Future Forecast (Contrarian view).

        Formatting:
        - Use line breaks for readability.
        - Use 3-5 relevant hashtags.
        - Keep each post under 200 words.
        - Sound like a human expert, not a robot. Avoid buzzwords like "delve", "unleash", "game-changer".

        Return the response ONLY as a valid JSON array of strings. 
        IMPORTANT: Do NOT include the "Option 1:" or "Option 2:" labels in the strings. Just the post content itself.
        Do not include markdown formatting like \`\`\`json. 
        Example: ["Hook... content...", "Hook... content...", "Hook... content..."]`;

        console.log("Sending prompt to Gemini...");
        const result = await model.generateContent(prompt);
        console.log("Received response from Gemini");
        const response = await result.response;
        let text = response.text();
        console.log("Raw text response:", text.substring(0, 100) + "...");

        // Cleanup potential markdown if the model ignores instruction
        text = text.replace(/```json/g, "").replace(/```/g, "").trim();

        const posts = JSON.parse(text);

        console.log("Parsed posts successfully");
        return NextResponse.json({ posts });
    } catch (error) {
        console.error("Generate error:", error);
        return NextResponse.json(
            {
                error: error.message || "Failed to generate posts.",
                details: error.toString()
            },
            { status: 500 }
        );
    }
}
