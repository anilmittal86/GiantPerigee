import { TwitterApi } from "twitter-api-v2";
import { NextResponse } from "next/server";

export async function POST(req) {
    try {
        const {
            thread,
            api_key: clientApiKey,
            api_secret: clientApiSecret,
            access_token: clientAccessToken,
            access_secret: clientAccessSecret
        } = await req.json();

        // Use client credentials or fallback to server-side env vars
        const apiKey = clientApiKey || process.env.TWITTER_API_KEY;
        const apiSecret = clientApiSecret || process.env.TWITTER_API_SECRET;
        const accessToken = clientAccessToken || process.env.TWITTER_ACCESS_TOKEN;
        const accessSecret = clientAccessSecret || process.env.TWITTER_ACCESS_SECRET;

        // Validate required credentials
        if (!apiKey || !apiSecret || !accessToken || !accessSecret) {
            return NextResponse.json(
                { error: "Missing Twitter OAuth 1.0a credentials. Required: API Key, API Secret, Access Token, Access Token Secret" },
                { status: 400 }
            );
        }

        // Validate thread
        if (!thread || !Array.isArray(thread) || thread.length === 0) {
            return NextResponse.json(
                { error: "Thread must be a non-empty array of tweets" },
                { status: 400 }
            );
        }

        // Validate tweet lengths
        for (let i = 0; i < thread.length; i++) {
            if (thread[i].length > 280) {
                return NextResponse.json(
                    {
                        error: `Tweet ${i + 1} exceeds 280 characters (${thread[i].length} chars)`,
                        tweet: thread[i]
                    },
                    { status: 400 }
                );
            }
        }

        console.log(`Posting Twitter thread with ${thread.length} tweets...`);

        // Initialize Twitter client with OAuth 1.0a credentials
        const client = new TwitterApi({
            appKey: apiKey,
            appSecret: apiSecret,
            accessToken: accessToken,
            accessSecret: accessSecret,
        });

        let previousTweetId = null;
        const tweetIds = [];

        // Post each tweet in the thread
        for (let i = 0; i < thread.length; i++) {
            const tweetText = thread[i];

            console.log(`Posting tweet ${i + 1}/${thread.length}:`, tweetText.substring(0, 50) + "...");

            const tweetOptions = {
                text: tweetText
            };

            // If not the first tweet, add reply parameters to create a thread
            if (previousTweetId) {
                tweetOptions.reply = {
                    in_reply_to_tweet_id: previousTweetId
                };
            }

            const tweet = await client.v2.tweet(tweetOptions);
            const tweetId = tweet.data.id;
            tweetIds.push(tweetId);
            previousTweetId = tweetId;

            console.log(`Tweet ${i + 1} posted successfully: ${tweetId}`);
        }

        // Get authenticated user info to construct proper URL
        let username = "twitter";
        try {
            const userInfo = await client.v2.me();
            username = userInfo.data.username;
        } catch (e) {
            console.warn("Could not fetch username:", e.message);
        }

        const firstTweetId = tweetIds[0];

        return NextResponse.json({
            success: true,
            tweetIds: tweetIds,
            threadId: firstTweetId,
            link: `https://twitter.com/${username}/status/${firstTweetId}`,
            message: `Thread posted successfully with ${thread.length} tweets`
        });

    } catch (error) {
        console.error("Twitter Post Error:", error);

        let errorMsg = error.message || "Failed to post to Twitter";

        // Check for specific Twitter API errors
        if (error.code === 403) {
            errorMsg = "Authentication Failed. Please verify your Twitter API credentials (API Key, API Secret, Access Token, Access Token Secret).";
        } else if (error.code === 401) {
            errorMsg = "Invalid credentials. Ensure your Access Token and Access Token Secret are correct and have write permissions.";
        } else if (error.data) {
            errorMsg = error.data.detail || error.data.title || errorMsg;
        }

        return NextResponse.json(
            {
                error: errorMsg,
                details: error.data || error.message,
            },
            { status: error.code || 500 }
        );
    }
}
