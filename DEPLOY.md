# Deploying to Vercel via GitHub

This guide will walk you through deploying your Next.js application to Vercel using GitHub.

## Prerequisites

- A [GitHub](https://github.com/) account.
- A [Vercel](https://vercel.com/) account.

## Step 1: Create a GitHub Repository

1.  Log in to your GitHub account.
2.  Click the **+** icon in the top-right corner and select **New repository**.
3.  Name your repository (e.g., `giant-perigee`).
4.  Choose **Public** or **Private** (Private is recommended for projects with API keys, although we won't be committing the keys themselves).
5.  Do **not** initialize with a README, .gitignore, or license (we already have these).
6.  Click **Create repository**.

## Step 2: Push Your Code to GitHub

Open your terminal or command prompt in the project folder and run the following commands:

1.  **Initialize Git** (if not already done):
    ```bash
    git init
    ```

2.  **Add your files**:
    ```bash
    git add .
    ```

3.  **Commit your changes**:
    ```bash
    git commit -m "Initial commit"
    ```

4.  **Link your local repository to GitHub** (replace `YOUR_USERNAME` with your actual GitHub username):
    ```bash
    git branch -M main
    git remote add origin https://github.com/YOUR_USERNAME/giant-perigee.git
    ```

5.  **Push your code**:
    ```bash
    git push -u origin main
    ```

## Step 3: Deploy to Vercel

1.  Log in to your [Vercel Dashboard](https://vercel.com/dashboard).
2.  Click **Add New...** and select **Project**.
3.  In the "Import Git Repository" section, you should see your new `giant-perigee` repository. Click **Import**.
    - If you don't see it, ensure your GitHub account is connected to Vercel.
4.  **Configure Project**:
    - **Framework Preset**: Should automatically detect `Next.js`.
    - **Root Directory**: `./` (default).
5.  **Environment Variables**:
    - Expand the **Environment Variables** section.
    - If your app requires an API key (e.g., for Google Gemini), add it here:
        - **Key**: `GEMINI_API_KEY` (or whatever variable name your code expects)
        - **Value**: Your actual API key starting with `AIza...`
    - Click **Add**.
6.  Click **Deploy**.

## Step 4: Verify Deployment

Vercel will build your application. Once finished, you will see a "Congratulations!" screen with a screenshot of your app.

- Click the **Visit** button to see your live site.
- Vercel automatically assigns a domain (e.g., `giant-perigee.vercel.app`).

## Troubleshooting

- **Build Failed**: View the logs in Vercel. Common issues include missing environment variables or type errors.
- **404 Warnings**: If you see 404s for API routes, ensure your environment variables are correctly set in the Vercel project settings, then redeploy.
