import { GoogleGenerativeAI } from "@google/generative-ai";
import { NextResponse } from "next/server";

async function searchPexelsImage(keywordSets) {
    const PEXELS_API_KEY = process.env.PEXELS_API_KEY || 'YOUR_PEXELS_API_KEY';

    // keywordSets is an array of search queries to try in order of relevance
    // e.g. ["AI chatbot customer service", "customer support technology", "business automation"]
    for (const query of keywordSets) {
        try {
            const cleanQuery = query.replace(/#\w+/g, '').trim().substring(0, 100);

            const response = await fetch(
                `https://api.pexels.com/v1/search?query=${encodeURIComponent(cleanQuery)}&per_page=5&orientation=landscape`,
                {
                    headers: {
                        'Authorization': PEXELS_API_KEY
                    }
                }
            );

            if (response.ok) {
                const data = await response.json();
                if (data.photos && data.photos.length > 0) {
                    // Pick a random photo from top results for variety across posts
                    const photo = data.photos[Math.floor(Math.random() * Math.min(data.photos.length, 3))];
                    return {
                        url: photo.src.large,
                        photographer: photo.photographer,
                        photographer_url: photo.photographer_url
                    };
                }
            }
        } catch (error) {
            console.error(`Pexels search error for query "${query}":`, error);
        }
    }

    // No relevant image found from any keyword set
    return null;
}


export async function POST(req) {
    try {
        console.log("Generate API called");
        const { product_info, post_type, gemini_api_key: clientKey, subreddit = "AEO_AkuparaAI" } = await req.json();

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
            model: "gemini-2.5-flash-lite",
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
        2. **Double Line Breaks**: You MUST use double line breaks (\\n\\n).
        3. **No Labels**: Do NOT use structural labels (e.g. "Hook:", "Body:").
        4. **Tone**: Human, professional, impactful.
        5. **Hashtags**: Include relevant hashtags AT THE END (LinkedIn Only).
        6. **Quantity**: generate exactly 3 High-Quality potential options for LinkedIn, 3 options for Reddit, AND 3 thread options for Twitter.

        PLATFORM SPECIFICS:
        - **LinkedIn**: Professional, thought-leader style. Use hashtags.
            - **image_keywords**: For each LinkedIn post, include an "image_keywords" array with exactly 2 concise Pexels stock photo search queries (2-4 words each) that would find a relevant, professional image. Be concrete and visual (e.g. "team collaboration office", "data analytics dashboard"). Avoid abstract concepts. Each post MUST have DIFFERENT keywords.
        - **Reddit**: Conversational, community-focused, specific to the Subreddit "r/${subreddit}".
            - **Title**: Required. Catchy, specific, no clickbait.
            - **Body**: Informal, discussion-driven. NO HASHTAGS.
        - **Twitter**: Engaging threads optimized for Twitter's format.
            - **Thread Format**: Each option should be a complete thread (array of tweets).
            - **Tweet Length**: Each tweet MUST be 280 characters or less.
            - **Thread Structure**:
                - Tweet 1: Strong hook that grabs attention
                - Tweet 2-4: Break down the main points (numbered or flowing narrative)
                - Last Tweet: CTA or thought-provoking conclusion
            - **Style**: Conversational, punchy, use emojis sparingly for emphasis.
            - **Hashtags**: 1-2 relevant hashtags only in the last tweet.
            - Each thread should have 3-6 tweets total.

        CRITICAL SCORING INSTRUCTION (The "Simon Cowell" Rule):
        - **Score 6.0 - 7.5**: Good, professional, safe.
        - **Score 7.6 - 8.9**: Great hook, strong value, "Scroll Stopper".
        - **Score 9.0+**: RARE. Absolute viral perfection.
        
        Output Schema:
        Return a JSON object with three keys "linkedin", "reddit", and "twitter":
        {
            "linkedin": [
                { "content": "post 1 content...", "score": 7.2, "image_keywords": ["concrete visual query 1", "concrete visual query 2"] },
                ...
            ],
            "reddit": [
                { "title": "Post Title", "content": "post body...", "score": 8.5 },
                ...
            ],
            "twitter": [
                {
                    "thread": [
                        "Tweet 1 text (max 280 chars)...",
                        "Tweet 2 text (max 280 chars)...",
                        "Tweet 3 text (max 280 chars)..."
                    ],
                    "score": 8.0
                },
                ...
            ]
        }`;

        console.log("Sending prompt to Gemini...");
        const result = await model.generateContent(prompt);
        console.log("Received response from Gemini");
        const response = await result.response;
        let text = response.text();
        console.log("Raw text response:", text.substring(0, 500) + "...");

        // Smart JSON extraction that fixes "Bad control character" errors
        // by escaping newlines inside strings.
        function sanitizeAndParseJson(str) {
            // Find start of JSON (either object or array)
            const startObj = str.indexOf('{');
            const startArr = str.indexOf('[');

            let startIndex = -1;
            let openChar = '';
            let closeChar = '';

            if (startObj !== -1 && (startArr === -1 || startObj < startArr)) {
                startIndex = startObj;
                openChar = '{';
                closeChar = '}';
            } else if (startArr !== -1) {
                startIndex = startArr;
                openChar = '[';
                closeChar = ']';
            } else {
                return null;
            }

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
                    } else if (char === openChar) {
                        depth++;
                    } else if (char === closeChar) {
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

        if (posts) {
            // Validate structure
            if (Array.isArray(posts)) {
                // Legacy support or fallback if AI ignores schema
                posts = {
                    linkedin: posts.sort((a, b) => (b.score || 0) - (a.score || 0)),
                    reddit: [],
                    twitter: []
                };
            } else {
                // Sort all arrays if present
                if (posts.linkedin && Array.isArray(posts.linkedin)) {
                    posts.linkedin.sort((a, b) => (b.score || 0) - (a.score || 0));
                }
                if (posts.reddit && Array.isArray(posts.reddit)) {
                    posts.reddit.sort((a, b) => (b.score || 0) - (a.score || 0));
                }
                if (posts.twitter && Array.isArray(posts.twitter)) {
                    posts.twitter.sort((a, b) => (b.score || 0) - (a.score || 0));
                }
            }

            // Add images to LinkedIn posts using keywords from the main prompt (no extra API call)
            if (posts.linkedin && Array.isArray(posts.linkedin) && posts.linkedin.length > 0) {
                console.log("Fetching Pexels images using prompt-generated keywords...");

                // Search Pexels for all posts in parallel using keywords from the main response
                const imagePromises = posts.linkedin.map(post => {
                    const keywords = post.image_keywords;
                    if (Array.isArray(keywords) && keywords.length > 0) {
                        return searchPexelsImage(keywords);
                    }
                    return Promise.resolve(null);
                });
                const images = await Promise.all(imagePromises);

                const usedUrls = new Set();
                for (let i = 0; i < posts.linkedin.length; i++) {
                    const image = images[i];
                    if (image && !usedUrls.has(image.url)) {
                        posts.linkedin[i].image = image;
                        usedUrls.add(image.url);
                        console.log(`Relevant image found for post ${i + 1}`);
                    } else {
                        console.log(`No relevant image for post ${i + 1}, posting without image`);
                    }
                    // Clean up - don't send keywords to frontend
                    delete posts.linkedin[i].image_keywords;
                }
            }
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
