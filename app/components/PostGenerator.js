"use client";

import { useState, useEffect } from "react";
import axios from "axios";

export default function PostGenerator({ generatedPosts, loading, configData }) {
    const [postingIndex, setPostingIndex] = useState(null);
    const [postResult, setPostResult] = useState(null);
    const [activeTab, setActiveTab] = useState("linkedin");

    // Store posts for each platform
    const [posts, setPosts] = useState({
        linkedin: [],
        reddit: [],
        twitter: []
    });

    useEffect(() => {
        if (generatedPosts) {
            // Handle new object structure or legacy array
            let newPosts = { linkedin: [], reddit: [], twitter: [] };

            if (Array.isArray(generatedPosts)) {
                newPosts.linkedin = generatedPosts;
            } else {
                newPosts.linkedin = generatedPosts.linkedin || [];
                newPosts.reddit = generatedPosts.reddit || [];
                newPosts.twitter = generatedPosts.twitter || [];
            }

            setPosts(newPosts);

            // Auto-switch to populated tab if one is empty? No, default to LinkedIn.
        }
    }, [generatedPosts]);

    const handlePost = async (content, index) => {
        setPostingIndex(index);
        setPostResult(null);

        try {
            const res = await axios.post("/api/post", {
                post_content: content,
                access_token: configData.linkedinToken,
                urn: configData.linkedinUrn
            });

            if (res.data.success) {
                setPostResult({ type: "success", msg: "Posted successfully!", link: res.data.link });
            }
        } catch (err) {
            console.error(err);
            const errorMsg = err.response?.data?.error || err.message || "Failed to post.";
            const errorDetails = err.response?.data?.details ? JSON.stringify(err.response.data.details) : "";
            setPostResult({ type: "error", msg: `${errorMsg} ${errorDetails}` });
        } finally {
            setPostingIndex(null);
        }
    };

    const handleRedditShare = (title, content) => {
        const subreddit = configData.subreddit || "AEO_AkuparaAI";
        // Use old.reddit.com as it reliably handles the text parameter
        const url = `https://old.reddit.com/r/${subreddit}/submit?title=${encodeURIComponent(title)}&selftext=true&text=${encodeURIComponent(content)}`;
        window.open(url, '_blank');
    };

    const handleTwitterShare = (thread) => {
        // Open Twitter compose page
        window.open('https://twitter.com/compose/tweet', '_blank');
    };

    const handleCopyThread = (thread) => {
        // Format thread with tweet numbers for easy copying
        const formattedThread = thread.map((tweet, idx) => `${idx + 1}/${thread.length}\n${tweet}`).join('\n\n---\n\n');

        navigator.clipboard.writeText(formattedThread).then(() => {
            alert(`Thread copied to clipboard!\n\nPaste each tweet manually on Twitter.\nThe thread has ${thread.length} tweets.`);
        }).catch(err => {
            console.error("Failed to copy: ", err);
            alert("Failed to copy thread. Please try again.");
        });
    };

    // Keep for future paid tier support
    // const handleTwitterPost = async (thread, index) => {
    //     setPostingIndex(index);
    //     setPostResult(null);
    //     try {
    //         const res = await axios.post("/api/post-twitter", {
    //             thread: thread,
    //             api_key: configData.twitterApiKey,
    //             api_secret: configData.twitterApiSecret,
    //             access_token: configData.twitterAccessToken,
    //             access_secret: configData.twitterAccessSecret
    //         });
    //         if (res.data.success) {
    //             setPostResult({ type: "success", msg: res.data.message, link: res.data.link });
    //         }
    //     } catch (err) {
    //         console.error(err);
    //         const errorMsg = err.response?.data?.error || err.message || "Failed to post to Twitter.";
    //         const errorDetails = err.response?.data?.details ? JSON.stringify(err.response.data.details) : "";
    //         setPostResult({ type: "error", msg: `${errorMsg} ${errorDetails}` });
    //     } finally {
    //         setPostingIndex(null);
    //     }
    // };

    const handleCopy = (text) => {
        navigator.clipboard.writeText(text).then(() => {
            alert("Content copied to clipboard!");
        }).catch(err => {
            console.error("Failed to copy: ", err);
        });
    };

    const handleContentChange = (val, idx, field = "content") => {
        const newPosts = { ...posts };
        const list = [...newPosts[activeTab]];

        if (field === "content") {
            list[idx] = { ...list[idx], content: val };
        } else if (field === "title") {
            list[idx] = { ...list[idx], title: val };
        }

        newPosts[activeTab] = list;
        setPosts(newPosts);
    };

    const handleThreadTweetChange = (threadIdx, tweetIdx, val) => {
        const newPosts = { ...posts };
        const list = [...newPosts.twitter];
        const thread = [...list[threadIdx].thread];
        thread[tweetIdx] = val;
        list[threadIdx] = { ...list[threadIdx], thread };
        newPosts.twitter = list;
        setPosts(newPosts);
    };

    if (loading) {
        return (
            <div style={{ textAlign: "center", padding: "4rem" }}>
                <h2 style={{ color: "var(--primary)" }}>Generating awesome content...</h2>
                <p style={{ color: "var(--text-dim)" }}>Consulting the creative spirits</p>
            </div>
        );
    }

    // Check if we have any posts at all
    const hasPosts = posts.linkedin.length > 0 || posts.reddit.length > 0 || posts.twitter.length > 0;

    if (!hasPosts) {
        return (
            <div style={{ textAlign: "center", padding: "4rem", color: "var(--text-dim)" }}>
                <p>No posts generated yet. Configure and click "Generate".</p>
            </div>
        );
    }

    const currentPosts = posts[activeTab];

    return (
        <div>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "1.5rem" }}>
                <h2 style={{ margin: 0 }}>Select a Post</h2>

                <div className="pill-container" style={{ margin: 0 }}>
                    <button
                        className={`pill-btn ${activeTab === 'linkedin' ? 'active' : ''}`}
                        onClick={() => setActiveTab('linkedin')}
                    >
                        LinkedIn
                    </button>
                    <button
                        className={`pill-btn ${activeTab === 'reddit' ? 'active' : ''}`}
                        onClick={() => setActiveTab('reddit')}
                    >
                        Reddit
                    </button>
                    <button
                        className={`pill-btn ${activeTab === 'twitter' ? 'active' : ''}`}
                        onClick={() => setActiveTab('twitter')}
                    >
                        Twitter
                    </button>
                </div>
            </div>

            {postResult && activeTab === "linkedin" && (
                <div style={{
                    padding: "1rem",
                    marginBottom: "1rem",
                    borderRadius: "8px",
                    background: postResult.type === "success" ? "rgba(3, 218, 198, 0.1)" : "rgba(255, 0, 0, 0.1)",
                    color: postResult.type === "success" ? "var(--success)" : "#ff6b6b",
                    border: `1px solid ${postResult.type === "success" ? "var(--success)" : "#ff6b6b"}`
                }}>
                    {postResult.msg}
                    {postResult.link && <a href={postResult.link} target="_blank" style={{ marginLeft: "1rem", color: "inherit" }}>View Post</a>}
                </div>
            )}

            <div className="grid">
                {currentPosts.map((postObj, idx) => (
                    <div key={idx} className="card" style={{ position: "relative" }}>
                        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "0.5rem" }}>
                            <div className={`badge ${activeTab === 'reddit' ? 'badge-orange' : activeTab === 'twitter' ? 'badge-blue' : 'badge-blue'}`}>
                                Option {idx + 1}
                            </div>
                            {postObj.score && (
                                <div className="badge" style={{
                                    backgroundColor: postObj.score >= 8 ? "var(--success)" : "var(--warning)",
                                    color: "#000",
                                    fontWeight: "bold"
                                }}>
                                    Score: {postObj.score}/10
                                </div>
                            )}
                        </div>

                        {activeTab === "reddit" && (
                            <input
                                type="text"
                                className="input"
                                value={postObj.title || ""}
                                onChange={(e) => handleContentChange(e.target.value, idx, "title")}
                                placeholder="Post Title"
                                style={{ marginBottom: "0.5rem", fontWeight: "bold" }}
                            />
                        )}

                        {activeTab === "twitter" ? (
                            <div style={{ marginBottom: "1rem" }}>
                                <div style={{ marginBottom: "0.5rem", color: "var(--text-dim)", fontSize: "0.9rem" }}>
                                    Thread ({postObj.thread?.length || 0} tweets)
                                </div>
                                {(postObj.thread || []).map((tweet, tweetIdx) => (
                                    <div key={tweetIdx} style={{ marginBottom: "0.75rem" }}>
                                        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "0.25rem" }}>
                                            <span style={{ fontSize: "0.85rem", color: "var(--text-dim)" }}>Tweet {tweetIdx + 1}</span>
                                            <span style={{
                                                fontSize: "0.85rem",
                                                color: tweet.length > 280 ? "#ff6b6b" : "var(--text-dim)"
                                            }}>
                                                {tweet.length}/280
                                            </span>
                                        </div>
                                        <textarea
                                            value={tweet}
                                            onChange={(e) => handleThreadTweetChange(idx, tweetIdx, e.target.value)}
                                            style={{
                                                width: "100%",
                                                minHeight: "80px",
                                                background: "var(--background)",
                                                color: "var(--text-main)",
                                                border: `1px solid ${tweet.length > 280 ? "#ff6b6b" : "var(--border)"}`,
                                                borderRadius: "4px",
                                                padding: "0.5rem",
                                                resize: "vertical",
                                                fontFamily: "inherit",
                                                fontSize: "0.95rem",
                                                lineHeight: "1.4"
                                            }}
                                        />
                                    </div>
                                ))}
                            </div>
                        ) : (
                            <textarea
                                value={postObj.content || ""}
                                onChange={(e) => handleContentChange(e.target.value, idx, "content")}
                                style={{
                                    width: "100%",
                                    minHeight: "200px",
                                    background: "var(--background)",
                                    color: "var(--text-main)",
                                    border: "1px solid var(--border)",
                                    borderRadius: "4px",
                                    padding: "0.5rem",
                                    marginBottom: "1rem",
                                    resize: "vertical",
                                    fontFamily: "inherit",
                                    fontSize: "1.1rem",
                                    lineHeight: "1.6"
                                }}
                            />
                        )}

                        {activeTab === "linkedin" ? (
                            <button
                                className="btn btn-secondary"
                                onClick={() => handlePost(postObj.content, idx)}
                                disabled={postingIndex !== null}
                            >
                                {postingIndex === idx ? "Posting..." : "Post to LinkedIn"}
                            </button>
                        ) : activeTab === "twitter" ? (
                            <div style={{ display: "flex", gap: "0.5rem" }}>
                                <button
                                    className="btn btn-secondary"
                                    onClick={() => handleCopyThread(postObj.thread)}
                                >
                                    Copy Thread
                                </button>
                                <button
                                    className="btn btn-secondary"
                                    onClick={() => handleTwitterShare(postObj.thread)}
                                >
                                    Open Twitter
                                </button>
                            </div>
                        ) : (
                            <div style={{ display: "flex", gap: "0.5rem" }}>
                                <button
                                    className="btn btn-secondary"
                                    onClick={() => handleCopy(postObj.content)}
                                >
                                    Copy Content
                                </button>
                                <button
                                    className="btn btn-secondary"
                                    onClick={() => handleRedditShare(postObj.title || "", postObj.content)}
                                >
                                    Share on r/{configData.subreddit || "AEO_AkuparaAI"}
                                </button>
                            </div>
                        )}
                    </div>
                ))}
            </div>

            {currentPosts.length === 0 && (
                <div style={{ textAlign: "center", padding: "2rem", color: "var(--text-dim)" }}>
                    No generated posts found for {activeTab === "linkedin" ? "LinkedIn" : activeTab === "twitter" ? "Twitter" : "Reddit"}.
                </div>
            )}
        </div>
    );
}
