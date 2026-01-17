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
        const model = genAI.getGenerativeModel({ model: "gemini-2.0-flash" });

        const prompt = `You are a professional LinkedIn social media manager.
    
    Company Guidelines:
    ${guidelines}
    
    Product/Topic Info:
    ${product_info}
    
    Task:
    Create 3 distinct, engaging LinkedIn posts based on the above information.
    1. Professional and informative.
    2. Engaging and question-asking.
    3. Short, punchy, and promotional.
    
    Return the response ONLY as a valid JSON array of strings. Do not include markdown formatting like \`\`\`json. Example: ["Post 1 content", "Post 2 content", "Post 3 content"]`;

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
