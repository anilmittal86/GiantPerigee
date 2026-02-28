"use client";

import { useState, useEffect } from "react";
import axios from "axios";

export default function PostGenerator({ generatedPosts, loading, configData }) {
    const [postingIndex, setPostingIndex] = useState(null);
    const [postResult, setPostResult] = useState(null);
    const [activeTab, setActiveTab] = useState("linkedin");

    const [posts, setPosts] = useState({
        linkedin: [],
        reddit: [],
        twitter: []
    });

    useEffect(() => {
        if (generatedPosts) {
            let newPosts = { linkedin: [], reddit: [], twitter: [] };

            if (Array.isArray(generatedPosts)) {
                newPosts.linkedin = generatedPosts;
            } else {
                newPosts.linkedin = generatedPosts.linkedin || [];
                newPosts.reddit = generatedPosts.reddit || [];
                newPosts.twitter = generatedPosts.twitter || [];
            }

            setPosts(newPosts);
        }
    }, [generatedPosts]);

    const handlePost = async (content, index, imageUrl) => {
        setPostingIndex(index);
        setPostResult(null);

        try {
            const res = await axios.post("/api/post", {
                post_content: content,
                access_token: configData.linkedinToken,
                urn: configData.linkedinUrn,
                image_url: imageUrl
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
        const url = `https://old.reddit.com/r/${subreddit}/submit?title=${encodeURIComponent(title)}&selftext=true&text=${encodeURIComponent(content)}`;
        window.open(url, '_blank');
    };

    const handleTwitterShare = (thread) => {
        const firstTweet = thread[0] || '';
        const url = `https://twitter.com/intent/tweet?text=${encodeURIComponent(firstTweet)}`;
        window.open(url, '_blank');
    };

    const handleCopyFirstTweet = (thread) => {
        const firstTweet = thread[0] || '';
        navigator.clipboard.writeText(firstTweet).then(() => {
        }).catch(err => {
            console.error("Failed to copy: ", err);
        });
    };

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
            <div className="loading-container fade-in">
                <div className="loading-spinner"></div>
                <h2 style={{ color: "var(--primary-hover)", marginBottom: "0.5rem", fontSize: "1.5rem" }}>Generating awesome content...</h2>
                <p style={{ color: "var(--text-dim)", fontSize: "0.95rem" }}>Consulting the creative spirits</p>
            </div>
        );
    }

    const hasPosts = posts.linkedin.length > 0 || posts.reddit.length > 0 || posts.twitter.length > 0;

    if (!hasPosts) {
        return (
            <div className="empty-state fade-in">
                <div className="empty-state-icon">📝</div>
                <p style={{ fontSize: "1rem", color: "var(--text-dim)" }}>No posts generated yet. Configure your settings and click "Generate Posts".</p>
            </div>
        );
    }

    const currentPosts = posts[activeTab];

    const platformConfig = {
        linkedin: { label: "LinkedIn", icon: "💼", color: "var(--linkedin)" },
        reddit: { label: "Reddit", icon: "🔗", color: "var(--reddit)" },
        twitter: { label: "Twitter", icon: "🐦", color: "var(--twitter)" }
    };

    return (
        <div className="fade-in">
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "1.5rem", flexWrap: "wrap", gap: "1rem" }}>
                <div className="section-header" style={{ marginBottom: 0 }}>
                    <div className="section-icon">📄</div>
                    <div>
                        <div className="section-title">Generated Content</div>
                        <div className="section-description">Review, edit, and publish your posts</div>
                    </div>
                </div>

                <div className="pill-container" style={{ margin: 0 }}>
                    {["linkedin", "reddit", "twitter"].map(platform => (
                        <button
                            key={platform}
                            className={`pill-btn ${activeTab === platform ? `active platform-${platform}` : ''}`}
                            onClick={() => setActiveTab(platform)}
                        >
                            <span style={{ fontSize: "1rem" }}>{platformConfig[platform].icon}</span>
                            {platformConfig[platform].label}
                        </button>
                    ))}
                </div>
            </div>

            {postResult && activeTab === "linkedin" && (
                <div className={`status-message ${postResult.type === "success" ? "status-success" : "status-error"}`}>
                    <span>{postResult.type === "success" ? "✓" : "✕"}</span>
                    <span>{postResult.msg}</span>
                    {postResult.link && <a href={postResult.link} target="_blank" style={{ marginLeft: "auto", color: "inherit", textDecoration: "underline" }}>View Post →</a>}
                </div>
            )}

            <div className="grid">
                {currentPosts.map((postObj, idx) => (
                    <div key={idx} className="post-card fade-in">
                        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "1rem" }}>
                            <div className={`badge ${activeTab === 'reddit' ? 'badge-orange' : 'badge-blue'}`} style={{ marginBottom: 0, width: "auto", display: "inline-block" }}>
                                Option {idx + 1}
                            </div>
                            {postObj.score && (
                                <div style={{
                                    padding: "0.375rem 0.875rem",
                                    borderRadius: "var(--radius-full)",
                                    fontSize: "0.8rem",
                                    fontWeight: 700,
                                    background: postObj.score >= 8 ? "var(--success-light)" : "var(--warning-light)",
                                    color: postObj.score >= 8 ? "var(--success)" : "var(--warning)",
                                    border: `1px solid ${postObj.score >= 8 ? "rgba(16, 185, 129, 0.3)" : "rgba(245, 158, 11, 0.3)"}`
                                }}>
                                    Score: {postObj.score}/10
                                </div>
                            )}
                        </div>

                        {activeTab === "linkedin" && postObj.image && (
                            <div style={{ marginBottom: "1rem", borderRadius: "var(--radius-md)", overflow: "hidden", border: "1px solid var(--border)" }}>
                                <img
                                    src={postObj.image.url}
                                    alt="Post visual"
                                    style={{ width: "100%", height: "auto", display: "block" }}
                                />
                                {postObj.image.photographer && (
                                    <div style={{
                                        padding: "0.5rem 0.75rem",
                                        fontSize: "0.75rem",
                                        color: "var(--text-dim)",
                                        background: "var(--background-secondary)"
                                    }}>
                                        Photo by <a
                                            href={postObj.image.photographer_url}
                                            target="_blank"
                                            rel="noopener noreferrer"
                                            style={{ color: "var(--primary-hover)" }}
                                        >
                                            {postObj.image.photographer}
                                        </a> on Pexels
                                    </div>
                                )}
                            </div>
                        )}

                        {activeTab === "reddit" && (
                            <input
                                type="text"
                                className="input"
                                value={postObj.title || ""}
                                onChange={(e) => handleContentChange(e.target.value, idx, "title")}
                                placeholder="Post Title"
                                style={{ marginBottom: "0.75rem", fontWeight: 600 }}
                            />
                        )}

                        {activeTab === "twitter" ? (
                            <div style={{ marginBottom: "1rem" }}>
                                <div style={{ marginBottom: "0.75rem", color: "var(--text-dim)", fontSize: "0.85rem", fontWeight: 500 }}>
                                    Thread ({postObj.thread?.length || 0} tweets)
                                </div>
                                {(postObj.thread || []).map((tweet, tweetIdx) => (
                                    <div key={tweetIdx} style={{ marginBottom: "0.75rem" }}>
                                        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "0.375rem" }}>
                                            <span style={{ fontSize: "0.8rem", color: "var(--text-dim)", fontWeight: 500 }}>Tweet {tweetIdx + 1}</span>
                                            <span style={{
                                                fontSize: "0.8rem",
                                                fontWeight: 600,
                                                color: tweet.length > 280 ? "var(--error)" : "var(--text-dim)",
                                                padding: "0.125rem 0.5rem",
                                                borderRadius: "var(--radius-full)",
                                                background: tweet.length > 280 ? "var(--error-light)" : "transparent"
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
                                                background: "var(--background-secondary)",
                                                color: "var(--text-main)",
                                                border: `1.5px solid ${tweet.length > 280 ? "var(--error)" : "var(--border)"}`,
                                                borderRadius: "var(--radius-sm)",
                                                padding: "0.75rem",
                                                resize: "vertical",
                                                fontFamily: "inherit",
                                                fontSize: "0.95rem",
                                                lineHeight: "1.5",
                                                transition: "border-color 0.2s ease"
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
                                    background: "var(--background-secondary)",
                                    color: "var(--text-main)",
                                    border: "1.5px solid var(--border)",
                                    borderRadius: "var(--radius-sm)",
                                    padding: "0.875rem",
                                    marginBottom: "1rem",
                                    resize: "vertical",
                                    fontFamily: "inherit",
                                    fontSize: "1rem",
                                    lineHeight: "1.6",
                                    transition: "border-color 0.2s ease"
                                }}
                            />
                        )}

                        <div style={{ display: "flex", gap: "0.75rem", flexWrap: "wrap" }}>
                            {activeTab === "linkedin" ? (
                                <button
                                    className="btn"
                                    onClick={() => handlePost(postObj.content, idx, postObj.image?.url)}
                                    disabled={postingIndex !== null}
                                    style={{
                                        background: postingIndex === idx ? "var(--surface-elevated)" : "var(--linkedin)",
                                        boxShadow: postingIndex === idx ? "none" : "0 4px 12px rgba(10, 102, 194, 0.3)"
                                    }}
                                >
                                    {postingIndex === idx ? "Posting..." : "💼 Post to LinkedIn"}
                                </button>
                            ) : activeTab === "twitter" ? (
                                <>
                                    <button
                                        className="btn-secondary"
                                        onClick={() => handleCopyFirstTweet(postObj.thread)}
                                    >
                                        📋 Copy Content
                                    </button>
                                    <button
                                        className="btn"
                                        onClick={() => handleTwitterShare(postObj.thread)}
                                        style={{ background: "var(--twitter)", boxShadow: "0 4px 12px rgba(29, 155, 240, 0.3)" }}
                                    >
                                        🐦 Share on Twitter
                                    </button>
                                </>
                            ) : (
                                <>
                                    <button
                                        className="btn-secondary"
                                        onClick={() => handleCopy(postObj.content)}
                                    >
                                        📋 Copy Content
                                    </button>
                                    <button
                                        className="btn"
                                        onClick={() => handleRedditShare(postObj.title || "", postObj.content)}
                                        style={{ background: "var(--reddit)", boxShadow: "0 4px 12px rgba(255, 69, 0, 0.3)" }}
                                    >
                                        🔗 Share on r/{configData.subreddit || "AEO_AkuparaAI"}
                                    </button>
                                </>
                            )}
                        </div>
                    </div>
                ))}
            </div>

            {currentPosts.length === 0 && (
                <div className="empty-state">
                    <div className="empty-state-icon">
                        {activeTab === "linkedin" ? "💼" : activeTab === "twitter" ? "🐦" : "🔗"}
                    </div>
                    <p>No generated posts found for {platformConfig[activeTab].label}.</p>
                </div>
            )}
        </div>
    );
}
