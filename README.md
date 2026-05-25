# LeetCode Leaderboard 🏆

A beautiful, high-fidelity leaderboard dashboard built with **Next.js (App Router)**, **Vanilla CSS (CSS Modules)**, and **Supabase (PostgreSQL)**. It tracks LeetCode statistics (easy, medium, hard solved questions) and contest ratings for you and your friends, calculating a combined score using the custom formula:

$$\text{Score} = (\text{Hard} \times 5) + (\text{Medium} \times 3) + (\text{Easy} \times 1)$$

Data is fetched directly from LeetCode's public GraphQL API (no Selenium or Headless Chrome required, making it 100% serverless/Vercel-compatible) and cached in Supabase for sub-millisecond leaderboard loading.

---

## Features

- 🌟 **Premium Dark Mode UI**: Modern glassmorphic podiums, glowing score highlights, responsive grids, and clean visual typography (using Google Fonts Outfit & Inter).
- 🔄 **Real-Time Data Sync**: A manual synchronization button with a built-in 15-second cooldown to keep stats updated without overloading LeetCode.
- 🥇 **Dynamic Podium**: The top 3 users are presented on a styled Gold, Silver, and Bronze podium.
- 🔍 **Live Client Filter & Sort**: Search for friends in real-time or sort the table by total solved questions, contest ratings, or overall score.
- 🛡️ **Graceful Onboarding**: If database settings are missing, the website will display an interactive setup screen instead of crashing.

---

## 🛠️ Step 1: Supabase Database Setup

1. Sign up for a free account at [Supabase](https://supabase.com/).
2. Create a new project.
3. Once the database is ready, go to the **SQL Editor** tab on the left sidebar.
4. Click **New Query**, paste the following script, and click **Run**:

```sql
-- Create the main table to store user statistics
CREATE TABLE leetcode_users (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    username TEXT UNIQUE NOT NULL,
    display_name TEXT NOT NULL,
    easy_solved INTEGER NOT NULL DEFAULT 0,
    medium_solved INTEGER NOT NULL DEFAULT 0,
    hard_solved INTEGER NOT NULL DEFAULT 0,
    total_solved INTEGER NOT NULL DEFAULT 0,
    contest_rating NUMERIC DEFAULT 0.0,
    contest_global_ranking INTEGER,
    contest_attended_count INTEGER DEFAULT 0,
    score INTEGER NOT NULL DEFAULT 0,
    avatar_url TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL,
    last_synced_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
);

-- Optimize sorting queries by creating a index on the score column
CREATE INDEX idx_leetcode_users_score ON leetcode_users (score DESC);

-- Enable Row Level Security (RLS)
ALTER TABLE leetcode_users ENABLE ROW LEVEL SECURITY;

-- Allow anyone to read the leaderboard (client-side SELECT)
CREATE POLICY "Allow public read access" 
ON leetcode_users FOR SELECT 
TO public 
USING (true);
```

---

## ⚙️ Step 2: Environment Variables

Create a file named `.env.local` in the root of the project (if it doesn't already exist) and populate it with your Supabase credentials:

```bash
# Found in Project Settings > API
NEXT_PUBLIC_SUPABASE_URL=https://your-project-id.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=your-anon-key-here

# Found in Project Settings > API > Service Role Key
# WARNING: Keep this secret! This allows Next.js server actions to bypass RLS policies and sync data.
SUPABASE_SERVICE_ROLE_KEY=your-supabase-service-role-key
```

---

## 💻 Step 3: Run Locally

Install the project dependencies and launch the Next.js development server:

```bash
# Install dependencies (ignoring peer warnings from React 19 / Next 16)
npm install --legacy-peer-deps

# Start development server
npm run dev
```

Open [http://localhost:3000](http://localhost:3000) in your browser.

---

## 🚀 Step 4: Host on Vercel

Hosting Next.js on Vercel is extremely easy and free:

1. Push this project to your GitHub, GitLab, or Bitbucket account.
2. Sign in to [Vercel](https://vercel.com/) and click **Add New > Project**.
3. Import your LeetCode Leaderboard repository.
4. Under **Environment Variables**, add the three variables from your `.env.local` file:
   - `NEXT_PUBLIC_SUPABASE_URL`
   - `NEXT_PUBLIC_SUPABASE_ANON_KEY`
   - `SUPABASE_SERVICE_ROLE_KEY`
5. Click **Deploy**. Vercel will build and serve your app.

---

## 📂 Project Architecture

```
├── src/
│   ├── app/
│   │   ├── api/
│   │   │   ├── sync/route.ts   # Server action to sync all user stats
│   │   │   └── users/route.ts  # Validates and adds a new user to Supabase
│   │   ├── globals.css         # Styling variables, resets & custom animations
│   │   ├── layout.tsx          # Google fonts (Inter + Outfit) & page wrapper
│   │   ├── page.tsx            # Main server-side page (handles DB connections & initial data fetch)
│   │   ├── LeaderboardClient.tsx # Interactive client-side view (Search, Sort, Modal forms)
│   │   └── page.module.css     # Premium styling module for layout & podium
│   └── lib/
│       ├── leetcode.ts         # LeetCode GraphQL fetch & score helper
│       └── supabase.ts         # Supabase client instantiation
```
