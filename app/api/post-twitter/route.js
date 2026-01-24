import axios from "axios";
import { NextResponse } from "next/server";

export async function POST(req) {
    try {
        const { thread, access_token: clientToken } = await req.json();

        let access_token = clientToken;

        // Fallback to server-side env var if not provided by client
        if (!access_token) {
            access_token = process.env.TWITTER_BEARER_TOKEN;
        }

        // Sanitize inputs
        const cleanToken = access_token?.trim();

        if (!cleanToken || !thread || !Array.isArray(thread) || thread.length === 0) {
            return NextResponse.json(
                { error: "Missing required fields (token, thread)" },
                { status: 400 }
            );
        }

        console.log(`Posting Twitter thread with ${thread.length} tweets...`);

        let previousTweetId = null;
        const tweetIds = [];

        // Post each tweet in the thread
        for (let i = 0; i < thread.length; i++) {
            const tweetText = thread[i];

            // Validate tweet length (280 characters max)
            if (tweetText.length > 280) {
                return NextResponse.json(
                    {
                        error: `Tweet ${i + 1} exceeds 280 characters (${tweetText.length} chars)`,
                        tweet: tweetText
                    },
                    { status: 400 }
                );
            }

            const body = {
                text: tweetText
            };

            // If not the first tweet, add reply parameters to create a thread
            if (previousTweetId) {
                body.reply = {
                    in_reply_to_tweet_id: previousTweetId
                };
            }

            console.log(`Posting tweet ${i + 1}/${thread.length}:`, tweetText.substring(0, 50) + "...");

            const response = await axios.post(
                "https://api.twitter.com/2/tweets",
                body,
                {
                    headers: {
                        Authorization: `Bearer ${cleanToken}`,
                        "Content-Type": "application/json",
                    },
                }
            );

            const tweetId = response.data.data.id;
            tweetIds.push(tweetId);
            previousTweetId = tweetId;

            console.log(`Tweet ${i + 1} posted successfully: ${tweetId}`);
        }

        // Return the URL of the first tweet in the thread
        const firstTweetId = tweetIds[0];

        // Note: We need the username to construct the full URL
        // For now, we'll return the tweet ID and a generic URL structure
        // The username can be fetched from Twitter API if needed
        return NextResponse.json({
            success: true,
            tweetIds: tweetIds,
            threadId: firstTweetId,
            // Generic link format - will need username to complete
            link: `https://twitter.com/i/web/status/${firstTweetId}`,
            message: `Thread posted successfully with ${thread.length} tweets`
        });

    } catch (error) {
        console.error("Twitter Post Error:", error.response?.data || error.message);

        let errorMsg = error.response?.data?.detail || error.response?.data?.title || "Failed to post to Twitter";

        // Specific hint for authentication errors
        if (error.response?.status === 401) {
            errorMsg = "Authentication Failed. Ensure your Twitter Bearer Token is valid and has write permissions.";
        }

        // Specific hint for forbidden errors
        if (error.response?.status === 403) {
            errorMsg = "Permission Denied. Ensure your Twitter API access includes tweet creation permissions (OAuth 2.0 with tweet.write scope).";
        }

        return NextResponse.json(
            {
                error: errorMsg,
                details: error.response?.data,
            },
            { status: error.response?.status || 500 }
        );
    }
}
