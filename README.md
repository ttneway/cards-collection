# 校園集卡牌

校園卡片收集遊戲。學生可以登入、完成任務、掃描任務碼、累積星星並抽卡；教師與幹部角色可進入對應管理/審核入口。

## Tech Stack

- React + TypeScript + Vite
- Tailwind CSS
- Supabase Auth / Database / RPC
- GitHub Pages deployment via GitHub Actions

## Local Setup

```bash
npm ci
cp .env.example .env
npm run dev
```

`.env` needs:

```bash
VITE_SUPABASE_URL=your_supabase_url_here
VITE_SUPABASE_ANON_KEY=your_supabase_anon_key_here
```

## Build

```bash
npm run build
```

The build uses `base: '/cards-collection/'` for GitHub Pages. After Vite finishes, `postbuild` copies `dist/index.html` to `dist/404.html` so direct visits such as `/cards-collection/auth` and page refreshes on nested routes load the React app instead of GitHub Pages' default 404 page.

## Deploy

Deployment runs from `.github/workflows/deploy.yml` on pushes to `main`.

Required GitHub Actions secrets:

- `VITE_SUPABASE_URL`
- `VITE_SUPABASE_ANON_KEY`

GitHub Pages should use **GitHub Actions** as the source.

Production URL:

```text
https://ttneway.github.io/cards-collection/
```

## Supabase

Apply the SQL in `supabase/migrations/00001_initial_schema.sql` to create the initial schema, RLS policies, RPC functions, and seed data.
