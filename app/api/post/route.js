import axios from "axios";
import { NextResponse } from "next/server";

export async function POST(req) {
    try {
        const { post_content } = await req.json();
        let { access_token, urn } = await req.json();

        // Fallback to server-side env vars if not provided by client
        if (!access_token) access_token = process.env.LINKEDIN_ACCESS_TOKEN;
        if (!urn) urn = process.env.LINKEDIN_ORG_URN;

        // Sanitize inputs
        const cleanToken = access_token?.trim();
        let cleanUrn = urn?.trim();

        if (!cleanToken || !cleanUrn || !post_content) {
            return NextResponse.json(
                { error: "Missing required fields (token, urn, content)" },
                { status: 400 }
            );
        }

        // Ensure URN is in correct format "urn:li:organization:12345"
        // If user enters just numbers, prepend organization URN prefix.
        if (/^\d+$/.test(cleanUrn)) {
            cleanUrn = `urn:li:organization:${cleanUrn}`;
        }

        const body = {
            author: cleanUrn,
            lifecycleState: "PUBLISHED",
            specificContent: {
                "com.linkedin.ugc.ShareContent": {
                    shareCommentary: {
                        text: post_content,
                    },
                    shareMediaCategory: "NONE",
                },
            },
            visibility: {
                "com.linkedin.ugc.MemberNetworkVisibility": "PUBLIC",
            },
        };

        console.log("Posting to LinkedIn with body:", JSON.stringify(body, null, 2));

        const response = await axios.post(
            "https://api.linkedin.com/v2/ugcPosts",
            body,
            {
                headers: {
                    Authorization: `Bearer ${cleanToken}`,
                    "Content-Type": "application/json",
                    "X-Restli-Protocol-Version": "2.0.0",
                },
            }
        );

        return NextResponse.json({
            success: true,
            data: response.data,
            link: `https://www.linkedin.com/feed/update/${response.data.id}`,
        });
    } catch (error) {
        console.error("LinkedIn Post Error:", error.response?.data || error.message);

        let errorMsg = error.response?.data?.message || "Failed to post to LinkedIn";

        // Specific hint for permission errors
        if (error.response?.status === 403 && error.response.data?.code === "ACCESS_DENIED") {
            errorMsg = "Permission Denied. Ensure your Access Token has 'w_organization_social' scope (for Company Pages) or 'w_member_social' (for Profiles). Check specifically if you are trying to post to a Page with a Personal Token.";
        }

        return NextResponse.json(
            {
                error: errorMsg,
                details: error.response?.data,
                debug_author_used: body.author // Send back what we tried to use
            },
            { status: error.response?.status || 500 }
        );
    }
}
