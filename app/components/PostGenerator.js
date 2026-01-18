"use client";

import { useState, useEffect } from "react";
import axios from "axios";

export default function PostGenerator({ generatedPosts, loading, configData }) {
    const [postingIndex, setPostingIndex] = useState(null);
    const [postResult, setPostResult] = useState(null);
    const [editablePosts, setEditablePosts] = useState([]);

    useEffect(() => {
        if (generatedPosts && generatedPosts.length > 0) {
            setEditablePosts(generatedPosts);
        }
    }, [generatedPosts]);

    const handlePost = async (content, index) => {
        // Check removed to allow backend env var fallback
        // if (!configData.linkedinToken || !configData.linkedinUrn) { ... }

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

    if (loading) {
        return (
            <div style={{ textAlign: "center", padding: "4rem" }}>
                <h2 style={{ color: "var(--primary)" }}>Generating awesome content...</h2>
                <p style={{ color: "var(--text-dim)" }}>Consulting the creative spirits</p>
            </div>
        );
    }

    if (!generatedPosts || generatedPosts.length === 0) {
        return (
            <div style={{ textAlign: "center", padding: "4rem", color: "var(--text-dim)" }}>
                <p>No posts generated yet. Configure and click "Generate".</p>
            </div>
        );
    }

    // Allow manual updates if generatedPosts changes deeply (simple check)
    // Better approach: use useEffect

    const handlePostChange = (text, idx) => {
        const newPosts = [...editablePosts];
        newPosts[idx] = text;
        setEditablePosts(newPosts);
    };

    return (
        <div>
            <h2 style={{ marginBottom: "1.5rem" }}>Select a Post</h2>

            {postResult && (
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
                {editablePosts.map((post, idx) => (
                    <div key={idx} className="card">
                        <div className="badge badge-blue">Option {idx + 1}</div>
                        <textarea
                            value={post}
                            onChange={(e) => handlePostChange(e.target.value, idx)}
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
                                lineHeight: "1.5"
                            }}
                        />
                        <button
                            className="btn btn-secondary"
                            onClick={() => handlePost(post, idx)}
                            disabled={postingIndex !== null}
                        >
                            {postingIndex === idx ? "Posting..." : "Post to LinkedIn"}
                        </button>
                    </div>
                ))}
            </div>
        </div>
    );
}
