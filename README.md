# 🚀 LinkedIn Marketing Agent

**Your Automated AI Social Media Manager.**

This application empowers you to generate, edit, and publish high-impact LinkedIn posts using the power of **Google Gemini 2.0**. It's designed for professionals who want to maintain a consistent, authoritative presence without the daily grind of drafting from scratch.

![UI Screenshot](https://via.placeholder.com/1200x600?text=LinkedIn+Marketing+Agent+Dashboard)
*(Replace with actual screenshot)*

## ✨ Key Features

-   **🧠 AI-Powered Content**: Generates 3 distinct post types (Hook, Insight, CTA) tailored to your brand voice.
-   **🌍 Grounded in Reality**: Uses **Google Search** grounding to fetch real-time news and facts, ensuring your posts are up-to-date.
-   **✍️ Full Editorial Control**: Edit any generated post directly in the browser to fix facts or tweak the tone before publishing.
-   **💼 Direct Integration**: Posts directly to your LinkedIn Company Page with a single click.
-   **🎨 Premium UI**: A clean, modern interface featuring **Geist** typography and a distraction-free design.

## 🛠️ Technology Stack

-   **Framework**: [Next.js 16](https://nextjs.org/) (App Router)
-   **AI Model**: [Google Gemini 2.0 Flash](https://ai.google.dev/)
-   **Integration**: LinkedIn API (OAuth 2.0)
-   **Styling**: CSS Modules with Premium Design Tokens

## 🚀 Getting Started

### Prerequisites

-   Node.js 18+ installed.
-   A Google AI Studio API Key.
-   LinkedIn Developer App credentials.

### Installation

1.  **Clone the repository**:
    ```bash
    git clone https://github.com/anilmittal86/GiantPerigee.git
    cd LinkedInPostAgent
    ```

2.  **Install dependencies**:
    ```bash
    npm install
    ```

3.  **Run the development server**:
    ```bash
    npm run dev
    ```

4.  **Open the App**:
    Visit [http://localhost:3000](http://localhost:3000).

### Configuration

You can configure your API keys in two ways:

1.  **UI (Recommended for Local)**: Open the "Advanced Settings" toggle in the app and paste your keys.
2.  **Environment Variables**: Create a `.env.local` file in the root directory:
    ```env
    GEMINI_API_KEY=your_key_here
    LINKEDIN_ACCESS_TOKEN=your_token_here
    LINKEDIN_ORG_URN=urn:li:organization:123456
    ```

👉 **Need help getting keys?** Check the built-in **User Guide** in the app header!

## 🤝 Contributing

Contributions are welcome! Please feel free to submit a Pull Request.

## 📄 License

This project is licensed under the generic MIT License.
