# 校園集卡牌

校園集卡牌是一個以校園任務、點數累積、卡牌收集、角色養成為核心的 Web 專案。

目前技術重點包含：

- React + TypeScript + Vite
- Tailwind CSS
- Supabase Auth / Database / RPC / Edge Functions
- GitHub Pages + GitHub Actions 自動部署

## 本機開發

```bash
npm ci
cp .env.example .env
npm run dev
```

`.env` 需要：

```bash
VITE_SUPABASE_URL=your_supabase_url_here
VITE_SUPABASE_ANON_KEY=your_supabase_anon_key_here
```

## 建置

```bash
npm run build
```

這個專案使用 GitHub Pages 路徑：

- `base: '/cards-collection/'`

建置完成後，`postbuild` 會把 `dist/index.html` 複製成 `dist/404.html`，讓像 `/cards-collection/auth` 這類深層路由在 GitHub Pages 上重新整理時仍能載入 React app，而不是顯示預設 404。

## 部署

部署由 `.github/workflows/deploy.yml` 處理，推送到 `main` 後會自動跑 GitHub Pages。

GitHub Actions secrets 需要：

- `VITE_SUPABASE_URL`
- `VITE_SUPABASE_ANON_KEY`

GitHub Pages Source 請設定為：

- **GitHub Actions**

正式網址：

- [https://ttneway.github.io/cards-collection/](https://ttneway.github.io/cards-collection/)

## Supabase

- 所有 schema 變更都放在 `supabase/migrations/`
- Edge Functions 放在 `supabase/functions/`
- 本機 Supabase CLI 設定在 `supabase/config.toml`

若是既有資料庫，請依 migration 順序套用。

## 文件

- [專案換電腦接手指南](D:/codex%20test/cards-collection/docs/move-to-new-computer.md)
- [Backlog](D:/codex%20test/cards-collection/docs/backlog.md)
- [Completed](D:/codex%20test/cards-collection/docs/completed.md)
