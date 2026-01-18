import { GoogleGenerativeAI } from "@google/generative-ai";
import { NextResponse } from "next/server";

export async function POST(req) {
    try {
        console.log("Generate API called");
        const { product_info, post_type, gemini_api_key: clientKey } = await req.json();

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
            model: "gemini-2.5-flash",
            // generationConfig: { responseMimeType: "application/json" } -- Removed for 2.5 search compatibility
            tools: [{ googleSearch: {} }],
        });





        let taskInstruction = "";

        switch (post_type) {
            case "research":
                taskInstruction = `Goal: Write 3 Deep Dive / Research-backed posts about the Context.
                Structure logic:
                1. Hook: Startling fact/trend directly related to the Context.
                2. Data: Explain "why" with authority.
                3. Application: How this applies to the reader.
                4. CTA: Thought-provoking question.
                Tone: Authoritative, academic but accessible.`;
                break;
            case "pun":
                taskInstruction = `Goal: Write 3 Short, Punchy, Humorous posts about the Context.
                Structure logic:
                1. Set-up: Relatable situation regarding the Context.
                2. Punchline: Witty observation.
                3. CTA: Lighthearted prompt.
                Tone: Witty, clever, dad joke style.`;
                break;
            case "feature":
                taskInstruction = `Goal: Write 3 Product/Feature Launch posts.
                Structure logic:
                1. Problem: What's broken in the user's specific Context?
                2. Reveal: The new solution (Context).
                3. Benefit: Specific outcome.
                4. CTA: "Link in bio" or "Try it now".
                Tone: Exciting, energetic.`;
                break;
            case "question":
                taskInstruction = `Goal: Write 3 Engaging Questions strictly about the Context.
                Structure logic:
                1. Question: A specific, thought-provoking question directly regarding the details in the Context.
                2. Context: Briefly explain the nuance or tension.
                3. Ask: "What do you think?"
                Tone: Curiosity-driven, professional, conversational.`;
                break;
            case "mixed":
            default:
                taskInstruction = `Goal: Write 3 Opinionated, High-Impact posts about the Context.
                Style: Assertive, Thought-Leader, "Hard Truth".
                
                Style Reference (Emulate this tone):
                "Most brands are completely blind when it comes to their AI visibility. We spend millions on SEO, yet we have zero infrastructure for tracking ChatGPT. You can’t optimize what you can’t measure. Designing 'golden prompts' isn't just a fun exercise; it is the only way to audit your reality."

                Structure Types:
                1. The Wake-Up Call: Call out a common mistake in the Context.
                2. The Strategic Pivot: Why the old way is dead and the Context is the future.
                3. The Unpopular Opinion: A controversial take on the Context.`;
                break;
        }

        const prompt = `Role: You are the Lead Content Strategist.

        Context (Product/Topic):
        ${product_info}

        Task:
        ${taskInstruction}

        GLOBAL CONSTRAINTS & FORMATTING (CRITICAL):
        1. **Strict Context Adherence**: Write ONLY about the specific details in the Context.
        2. **Double Line Breaks**: You MUST use double line breaks (\n\n).
        3. **No Labels**: Do NOT use structural labels.
        4. **Tone**: Human, professional, impactful.
        5. **Hashtags**: Include relevant hashtags AT THE END.
        6. **Quantity**: generate exactly 3 High-Quality potential options. **DO NOT purposely generate bad posts.** All 3 must be usable.

        7. **CRITICAL SCORING INSTRUCTION (The "Simon Cowell" Rule)**:
        You are now a ruthless viral content critic. Most LinkedIn posts are average.
        - **Score 6.0 - 7.5**: Good, professional, safe. (Most posts fall here).
        - **Score 7.6 - 8.9**: Great hook, strong value, "Scroll Stopper".
        - **Score 9.0+**: RARE. Absolute viral perfection.
        
        **Constraint:** You MUST differentiate. Do not give them all the same score. Find the flaws. Be critical.
        
        Output Schema:
        Return a JSON array of exactly 3 objects:
        [
            {
                "content": "post 1 content...",
                "score": 7.2
            },
            ...
        ]`;

        console.log("Sending prompt to Gemini...");
        const result = await model.generateContent(prompt);
        console.log("Received response from Gemini");
        const response = await result.response;
        let text = response.text();
        console.log("Raw text response:", text.substring(0, 500) + "...");

        // Smart JSON extraction that fixes "Bad control character" errors
        // by escaping newlines inside strings.
        function sanitizeAndParseJson(str) {
            const startIndex = str.indexOf('[');
            if (startIndex === -1) return null;

            let result = "";
            let depth = 0;
            let inString = false;
            let escape = false;

            for (let i = startIndex; i < str.length; i++) {
                const char = str[i];

                // Handle escaping within strings
                if (inString) {
                    if (escape) {
                        escape = false;
                        result += char;
                    } else if (char === '\\') {
                        escape = true;
                        result += char;
                    } else if (char === '"') {
                        inString = false;
                        result += char;
                    } else if (char === '\n' || char === '\r') {
                        // FIX: Escape literal newlines inside strings
                        result += "\\n";
                    } else if (char === '\t') {
                        result += "\\t";
                    } else {
                        result += char;
                    }
                } else {
                    // Not in string
                    if (char === '"') {
                        inString = true;
                    } else if (char === '[') {
                        depth++;
                    } else if (char === ']') {
                        depth--;
                    }
                    result += char;

                    if (depth === 0) {
                        // Found the matching closing bracket
                        return JSON.parse(result);
                    }
                }
            }
            return null;
        }

        let posts;
        try {
            posts = sanitizeAndParseJson(text);
        } catch (e) {
            console.error("Smart parse failed:", e);
        }

        if (!posts) {
            // Fallback: try basic regex clean and parse
            console.warn("Extractor failed, trying fallback parse");
            const cleanText = text.replace(/```json/g, "").replace(/```/g, "").trim();
            // Try to rudimentary fix newlines if basic parse fails
            try {
                posts = JSON.parse(cleanText);
            } catch (e2) {
                // Last ditch: global replace of newlines? Risks breaking structure.
                // Let's assume the smart parser is the main defense.
                throw new Error("Failed to parse posts. Raw response: " + text.substring(0, 100));
            }
        }

        if (posts && Array.isArray(posts)) {
            // Sort by score descending
            posts.sort((a, b) => (b.score || 0) - (a.score || 0));
        }

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
