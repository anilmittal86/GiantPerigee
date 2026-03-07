import axios from "axios";
import { NextResponse } from "next/server";

async function uploadImageToLinkedIn(imageUrl, accessToken, author) {
    try {
        const registerResponse = await axios.post(
            "https://api.linkedin.com/v2/assets?action=registerUpload",
            {
                registerUploadRequest: {
                    recipes: ["urn:li:digitalmediaRecipe:feedshare-image"],
                    owner: author,
                    serviceRelationships: [
                        {
                            relationshipType: "OWNER",
                            identifier: "urn:li:userGeneratedContent"
                        }
                    ]
                }
            },
            {
                headers: {
                    Authorization: `Bearer ${accessToken}`,
                    "Content-Type": "application/json",
                    "X-Restli-Protocol-Version": "2.0.0",
                }
            }
        );

        const uploadUrl = registerResponse.data.value.uploadMechanism["com.linkedin.digitalmedia.uploading.MediaUploadHttpRequest"].uploadUrl;
        const asset = registerResponse.data.value.asset;

        let imageBuffer;
        let contentType = "image/jpeg";

        // Handle base64 data URLs (from AI-generated images) vs regular URLs
        if (imageUrl.startsWith('data:')) {
            const matches = imageUrl.match(/^data:([^;]+);base64,(.+)$/);
            if (matches) {
                contentType = matches[1];
                imageBuffer = Buffer.from(matches[2], 'base64');
            } else {
                throw new Error("Invalid base64 data URL format");
            }
        } else {
            const imageResponse = await axios.get(imageUrl, { responseType: 'arraybuffer' });
            imageBuffer = Buffer.from(imageResponse.data, 'binary');
        }

        await axios.put(uploadUrl, imageBuffer, {
            headers: {
                "Content-Type": contentType,
                Authorization: `Bearer ${accessToken}`,
            }
        });

        return asset;
    } catch (error) {
        console.error("Image upload error:", error.response?.data || error.message);
        throw error;
    }
}

export async function POST(req) {
    let authorUsed = null;

    try {
        const { post_content, access_token: clientToken, urn: clientUrn, image_url } = await req.json();

        let access_token = clientToken;
        let urn = clientUrn;

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
        authorUsed = cleanUrn;

        let assetUrn = null;
        if (image_url) {
            console.log("Uploading image to LinkedIn...");
            assetUrn = await uploadImageToLinkedIn(image_url, cleanToken, cleanUrn);
            console.log("Image uploaded successfully:", assetUrn);
        }

        const body = {
            author: cleanUrn,
            lifecycleState: "PUBLISHED",
            specificContent: {
                "com.linkedin.ugc.ShareContent": {
                    shareCommentary: {
                        text: post_content,
                    },
                    shareMediaCategory: assetUrn ? "IMAGE" : "NONE",
                    ...(assetUrn && {
                        media: [
                            {
                                status: "READY",
                                description: {
                                    text: "Image"
                                },
                                media: assetUrn,
                                title: {
                                    text: "Post Image"
                                }
                            }
                        ]
                    })
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
                debug_author_used: authorUsed // Send back the author URN we tried to use
            },
            { status: error.response?.status || 500 }
        );
    }
}
