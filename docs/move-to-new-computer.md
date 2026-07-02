# 專案換電腦接手指南

這份指南用來把 `cards-collection` 從目前電腦移到另一台電腦，並保留：

- 本機開發能力
- Supabase CLI 管理能力
- GitHub push / deploy 能力

建議做法是走「GitHub + Secrets / 帳密重建」，不要直接整包搬運快取資料夾。

## 1. 舊電腦先確認

在舊電腦先做這些檢查：

1. `git status`
   - 確認沒有忘記提交或推送的修改
2. `git push origin main`
   - 確保 GitHub 上是最新版本
3. 確認你拿得到：
   - GitHub 帳號
   - Supabase 帳號
   - `.env` 內的 `VITE_SUPABASE_URL`、`VITE_SUPABASE_ANON_KEY`
   - `SUPABASE_ACCESS_TOKEN`
   - `SUPABASE_DB_PASSWORD`
   - 若未來要用 AI 生圖，再加 `OPENAI_API_KEY`
4. 到 GitHub repo 設定確認 Actions secrets 仍存在：
   - `VITE_SUPABASE_URL`
   - `VITE_SUPABASE_ANON_KEY`

## 2. 不要直接搬的東西

以下內容不要當成主要轉移方式：

- `node_modules/`
- `dist/`
- `.git` 以外的快取資料
- Supabase CLI 的本機登入狀態
- npm global 套件資料夾

這些在新電腦重新安裝通常更穩定。

## 3. 新電腦要先裝什麼

新電腦先安裝：

- Git
- Node.js LTS
- npm
- Supabase CLI
- 你常用的編輯器
- 可正常使用 `git`、`npm`、`supabase` 的終端機

## 4. 新電腦抓專案

```bash
git clone https://github.com/ttneway/cards-collection.git
cd cards-collection
npm ci
```

然後建立 `.env`：

```bash
VITE_SUPABASE_URL=...
VITE_SUPABASE_ANON_KEY=...
```

可以直接參考 `.env.example`。

## 5. 新電腦重新登入

### GitHub

- 確認這台電腦可以正常 `git pull` / `git push`
- 若需要，重新設定 PAT 或憑證管理員

### Supabase CLI

```bash
supabase login
supabase link
```

之後若要讓我繼續直接幫你處理 Supabase，還需要準備：

- `SUPABASE_ACCESS_TOKEN`
- `SUPABASE_DB_PASSWORD`

## 6. 新電腦驗證

### 本機前端驗證

```bash
npm ci
npm run build
npm run dev
```

確認：

- 網站可以正常開啟
- 登入可用
- 任務頁、角色頁、卡包頁正常
- `npm run build` 之後有 `dist/404.html`

### Supabase 驗證

```bash
supabase --version
supabase login
supabase link
supabase db push --linked
supabase functions deploy <function-name>
```

確認：

- `supabase/config.toml` 能正常對到原專案
- migrations 狀態正確
- functions 可以部署

## 7. 最推薦的實際搬法

1. 舊電腦把所有最新修改推到 GitHub
2. 安全記下 `.env`、`SUPABASE_ACCESS_TOKEN`、`SUPABASE_DB_PASSWORD`
3. 新電腦安裝 Git / Node / Supabase CLI
4. `git clone`
5. 建立 `.env`
6. `npm ci`
7. `supabase login`
8. `supabase link`
9. `npm run build`
10. 驗證沒問題後再開始正式開發

## 8. 完成後檢查清單

- [ ] `git pull` 正常
- [ ] `git push` 正常
- [ ] `npm ci` 正常
- [ ] `npm run build` 正常
- [ ] `npm run dev` 正常
- [ ] `.env` 已正確連到原本 Supabase
- [ ] `supabase login` 成功
- [ ] `supabase link` 成功
- [ ] `supabase db push --linked` 成功
- [ ] GitHub Actions secrets 仍存在
- [ ] 主要功能頁可開：登入、任務、角色、卡包、教師後台

## 9. 這個專案目前用到的重點

- Git 遠端：`https://github.com/ttneway/cards-collection.git`
- 前端環境：`Node + npm`
- 前端必要環境變數：
  - `VITE_SUPABASE_URL`
  - `VITE_SUPABASE_ANON_KEY`
- Supabase 專案設定：`supabase/config.toml`
- Supabase migrations / functions：都已收在 repo 內
