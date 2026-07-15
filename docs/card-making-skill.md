# 卡牌製作 Skill

這份文件是把本專案長期對話與實作經驗蒸餾成一份可交接、可延續的工作說明，目標是讓下一位 Codex 或維護者能快速理解這個「校園集卡牌」專案的設計方向、常用流程、AI 生圖架構、部署方式與常見坑點。

## 1. 專案定位

這是一個以「校園集卡牌」為主題的教學互動網站，核心是讓教師建立：

- 卡牌
- 分集冊
- 職業
- 裝備
- 任務
- 成就

再讓學生透過抽卡、任務、角色養成、職業切換、裝備搭配與成就領獎來互動。

技術主體：

- 前端：Vite + React + TypeScript
- 後端：Supabase
  - Database
  - Auth
  - Storage
  - Edge Functions
- 部署：
  - 前端主要發佈到 GitHub Pages
  - AI 生圖另有 Supabase Edge Function 與共享 ComfyUI Gateway

## 2. 專案工作的核心原則

### 2.1 先延續既有模式

這個專案已經形成一套固定做法：

- 後台頁面走 `/teacher/...`
- 學生頁面走一般前台路由
- 資料以 Supabase 為單一真相來源
- 圖片統一存入 Supabase Storage
- 生圖先預覽，確認後才套用到正式資料

除非必要，不要另外發明新的資料流。

### 2.2 先本地驗證，再推 GitHub

每次做完功能，優先順序：

1. 本地建置成功
2. 本地頁面驗證
3. 必要時部署 Supabase migration / function
4. 推 GitHub
5. 讓使用者用 GitHub Pages 或本地網址驗證

### 2.3 使用者很重視「有沒有真的部署上去」

這個專案裡，常見問題不是只有功能沒做好，而是：

- 本地改了但沒推上 GitHub
- Supabase function 改了但沒 deploy
- GitHub Pages 還停在舊版
- 使用者重新整理後看到的不是最新 commit

所以每次完成功能，都要明確確認：

- 前端是否已 push
- Edge Function 是否已 deploy
- migration 是否已 push 到 Supabase

## 3. 重要環境資訊

### 3.1 主要路徑

- 專案根目錄：`D:\codexTEST\card\cards-collection`
- 共享 ComfyUI Gateway：`D:\codexTEST\card\cards-collection\tools\comfyui-shared-gateway`
- 啟動腳本：`D:\codexTEST\card\cards-collection\tools\startup`
- ComfyUI 遠端設定說明：`D:\codexTEST\card\cards-collection\docs\comfyui-remote-setup.md`
- AI 提示詞說明：`D:\codexTEST\card\cards-collection\docs\ai-image-prompt-guide.md`

### 3.2 常用環境變數

前端：

- `VITE_SUPABASE_URL`
- `VITE_SUPABASE_ANON_KEY`

Supabase / CLI：

- `SUPABASE_ACCESS_TOKEN`
- `SUPABASE_DB_PASSWORD`

### 3.3 Supabase 專案

目前對話中使用的 Supabase project ref：

- `vmullvegdldmcehanzrw`

## 4. 功能分區理解

### 4.1 卡牌相關

- 卡牌管理：建立卡牌、編輯卡牌、AI 生圖、套用圖片
- 卡牌圖鑑：學生端或前台查看卡牌蒐集狀態
- 我的牌庫：顯示玩家已取得卡牌
- 抽卡系統：支援單抽、多抽、連續抽
- 分集冊管理：卡牌收集主題與冊子整理

### 4.2 角色相關

- 角色頁面：顯示主職業、裝備、角色資訊
- 職業後台：建立職業模板、效果、圖片
- 裝備後台：建立裝備、效果、圖片

### 4.3 任務與成就

- 任務可設定週期、上限、冷卻、按鈕完成等
- 成就已升級成：
  - 累積
  - 連續
  - 全部完成
- 成就是「自動解鎖，手動領獎」

## 5. AI 生圖的總架構

目前專案的 AI 生圖有兩條主線：

### 5.1 雲端 AI

支援過或已接過的 provider：

- OpenAI
- Google Gemini
- Hugging Face

流程：

1. 前端頁面收集卡牌 / 裝備 / 職業資料
2. 組成 `finalPrompt`
3. 呼叫 Supabase Edge Function `generate-card-image`
4. Edge Function 再去打對應 AI provider
5. 成功後回傳圖片
6. 圖片再上傳 Storage，寫回資料表

### 5.2 共享 ComfyUI 主機

這是後來重點發展的路線。

架構：

1. 教師後台選擇 `共享 ComfyUI 主機`
2. 前端讀取共享設定
3. 呼叫共享 Gateway
4. Gateway 代理到這台電腦上的 ComfyUI
5. Gateway 回傳圖片預覽
6. 教師確認後才套用到正式資料

關鍵觀念：

- 網站不直接打裸 ComfyUI
- 一律透過 Gateway
- workflow 採 API JSON 模板 + placeholder 替換

## 6. Prompt 組裝邏輯

Prompt 不是單純把卡牌名稱丟給模型，而是由多段資訊組成。

常見輸入來源：

- 名稱
- 稀有度
- 描述
- 分集冊主題
- 主色
- AI 風格模板
- 教師補充提示詞

### 6.1 卡牌 prompt 原則

卡牌 prompt 必須強調：

- 主體是卡牌名稱本身
- 不要讓補充提示詞蓋掉主體
- 畫面要適合卡牌比例
- 若是卡牌風格，保留卡框安全區

例如使用者曾遇到：

- 卡牌名稱是「排球場」
- 補充詞是「超帥球員在排球場打球」
- 結果模型生成單一可愛女孩肖像

這代表 prompt 約束不夠，主體被人物搶走。

修正方向：

- 明寫「named subject must remain the main subject」
- 把補充提示詞降為 supporting detail
- 加上避免 unrelated portrait subjects

### 6.2 裝備 prompt 原則

- 主體必須是裝備本身
- 角色如果出現，只能當陪襯
- 構圖不能被人物肖像主導

### 6.3 職業 prompt 原則

- 必須明確呈現職業意象
- 可依男 / 女版本分開生成
- 應適合角色選擇介面或圖示用途

## 7. 共享 ComfyUI 的 placeholder 規格

共享工作流 JSON 會使用 placeholder，至少要支援：

- `{{full_prompt}}`
- `{{card_name}}`
- `{{card_description}}`
- `{{album_name}}`
- `{{rarity}}`
- `{{image_style}}`
- `{{extra_prompt}}`
- `{{card_color}}`
- `{{negative_prompt}}`
- `{{image_width}}`
- `{{image_height}}`
- `{{aspect_ratio}}`
- `{{seed}}`

這代表 workflow 不應硬寫死 prompt 與 seed。

## 8. Seed 的設計原則

使用者已經明確要求：

- 網頁端可直接設定 seed
- 也可以切換成亂數 seed

所以實作時要避免：

- workflow JSON 內固定某個 seed 卻無法被覆蓋
- 前端看得到 seed，但實際送出去的 seed 沒有套用

## 9. 共用工作流管理的方向

共享生圖設定頁不是只存一份 workflow，而是要支援：

- 多個 workflow 清單
- 可命名
- 可設定適用頁面
- 可啟用 / 停用
- 可排序
- 教師可在生圖時切換使用

已知踩過的坑：

- 「新增工作流」按了沒反應
- 出現 `column reference "id" is ambiguous`
- 儲存後 JSON 沒有真的存入資料庫
- UI 出現 `?????` 亂碼

因此這塊之後修改時，要特別重視：

- DB function / query 欄位是否明確命名
- JSON 欄位讀寫是否完整
- 頁面是否有 UTF-8 / 正確文案

## 10. 共享 ComfyUI 主機的實際營運觀念

使用者要的不是「只能這台電腦 localhost 生圖」，而是：

- 這台電腦當共享生圖主機
- 外部任何裝置連 GitHub Pages 網站時
- 都能透過固定入口連回這台電腦上的 ComfyUI

也就是：

- 本機跑 ComfyUI
- 對外提供固定入口
- 網站呼叫 Gateway
- Gateway 再呼叫本機 ComfyUI

## 11. Tunnel / 對外入口的實務重點

曾經走過幾種方案：

### 11.1 trycloudflare quick tunnel

優點：

- 快
- 容易測

缺點：

- 網址會變
- 重開機後常失效
- 容易出現 DNS 無法解析

### 11.2 固定 Tunnel

這才是長期方案。

需要：

- Cloudflare 授權
- `cert.pem`
- Named Tunnel
- 固定網域或固定入口設定

### 11.3 直連版

也曾評估過：

- `ttneway.ddns.net`
- Port Forward
- Windows 防火牆放行
- Caddy / HTTPS

但實務上仍以 Tunnel 方案較穩定，也較符合使用者後續要求。

## 12. 開機自動啟動需求

使用者明確希望開機後能自動啟動：

- ComfyUI
- Gateway
- Tunnel

也希望閒置後能卸載模型，減少記憶體占用。

因此未來碰到這塊時，要記得這不是單次測試需求，而是長期營運需求。

## 13. 圖片儲存的關鍵原則

前端看得到預覽圖，不代表資料真的已經保存。

完整流程應確認：

1. 是否成功生成圖片
2. 是否成功上傳到 Supabase Storage
3. 是否成功把圖片 URL 寫回資料表
4. 前台圖鑑 / 我的牌庫 / 首頁最近獲得卡牌 是否都讀得到同一欄位

這類 bug 已經出現過：

- 卡牌管理看得到圖
- 卡牌圖鑑看不到圖
- 首頁最近獲得卡牌看不到圖

所以圖片欄位與讀取路徑要一致。

## 14. 已知 UI / 文字層面的偏好

使用者很在意：

- 頁面不要亂碼
- 文字要清楚
- 功能區要分得懂
- 教師看得懂如何操作

因此後台頁面常需要：

- 教學卡
- 欄位說明
- 範例文案
- 清楚區分簡單模式與進階模式

尤其：

- 成就管理
- 共享生圖設定
- 教師自備 API key

這幾區都要盡量降低理解門檻。

## 15. 使用者明確要求過的重要功能方向

### 15.1 AI 生圖相關

- 教師可自備 API key
- 支援 Gemini / OpenAI / Hugging Face
- 後來又希望可自訂 Hugging Face 作者名 + 模型名
- 希望所有能生圖的頁面都能查看本次提示詞
- 查看提示詞時可顯示：
  - `finalPrompt`
  - `negativePrompt`
  - `seed`
- 並可直接編輯後再送出生圖

### 15.2 卡牌與抽卡

- 卡包可設定抽出張數
- 支援 10 連抽、20 連抽、連續抽
- 連續抽時要看得到停止按鈕

### 15.3 圖片顯示與縮放

- 我的牌庫、卡牌圖鑑需要卡牌大小滑桿
- 卡牌管理頁面也希望有同樣的大小控制

### 15.4 職業系統

- 20 級轉職後，舊職業效果保留但不再成長
- 再切回舊職業才恢復成長
- 原本每 10 級增加，後來改成每 1 級增加 1 次
- 角色頁要顯示主職業圖片與裝備圖片
- 學生可選男 / 女角色
- 職業圖片也要能分男生版 / 女生版

### 15.5 成就系統

- 支援累積、連續、全部完成
- 教師後台要有更容易懂的建立方式
- 學生端要顯示進度與可領狀態
- 預先建立幾個草稿成就

## 16. 最近一次已完成的大型升級

最近已完成並驗證過的一項大功能是成就系統升級，內容包括：

- 成就主表欄位擴充
- `achievement_conditions`
- `achievement_condition_tasks`
- `get_my_achievement_statuses()`
- `sync_my_achievements()`
- `claim_achievement_reward(...)`
- 學生端成就頁顯示進度 / 可領 / 已領
- 教師端成就管理頁改版
- 預設草稿成就建立

如果後續碰到成就資料問題，先查：

- migration `00049_achievement_progress_and_claims.sql`
- `src/lib/achievements.ts`
- `src/pages/TeacherAchievementsPage.tsx`
- `src/pages/AchievementsPage.tsx`

## 17. 常見錯誤與排查思路

### 17.1 GitHub Pages 沒更新

先檢查：

- 是否真的 push 到 GitHub
- 目前頁面是哪個 commit 版本
- build 是否成功
- Pages 是否還在舊快取

### 17.2 Supabase Edge Function returned non-2xx

先看：

- function 是否已 deploy
- request payload 是否缺欄位
- provider / model 是否正確
- API key 是否有效
- 回傳錯誤是 400、429 還是 DNS 問題

### 17.3 Hugging Face 生圖失敗

已經踩過：

- `Accept type "image/*" not supported`
- `Model not supported by provider hf-inference`
- 某些模型其實要改走其他 provider
- DNS 錯誤

所以：

- 不要假設任一 Hugging Face 模型都能直接用同一條 API
- provider 能不能跑該模型要逐一確認

### 17.4 ComfyUI 共享主機生成失敗

先檢查：

- Gateway health
- ComfyUI health
- Tunnel / base URL
- workflow JSON 是否合法
- placeholder 是否都有替換
- seed 是否正常
- workflow 使用的 checkpoint / lora 在本機是否真的存在

### 17.5 本地有圖、前台沒圖

先查：

- 存哪個欄位
- 前台讀哪個欄位
- Storage URL 是否正確
- 是否有 fallback 邏輯把圖吃掉

## 18. 工作方式建議

如果未來要繼續這個專案，建議照這個順序工作：

1. 先讀 `docs/backlog.md` 與 `docs/completed.md`
2. 再看本次功能是否牽涉：
   - 前端頁面
   - migration
   - Edge Function
   - Gateway
3. 先本地驗證
4. 再部署 Supabase 變更
5. 最後 push GitHub

## 19. 建議優先維護的文件

以下文件應持續保持可讀：

- `D:\codexTEST\card\cards-collection\docs\backlog.md`
- `D:\codexTEST\card\cards-collection\docs\completed.md`
- `D:\codexTEST\card\cards-collection\docs\comfyui-remote-setup.md`
- `D:\codexTEST\card\cards-collection\docs\ai-image-prompt-guide.md`
- `D:\codexTEST\card\cards-collection\docs\card-making-skill.md`

如果發現亂碼，應優先轉成乾淨 UTF-8。

## 20. 這份 Skill 的用途

這份文件適合在以下情境使用：

- 新電腦接手專案
- 新的 Codex 要快速理解專案
- AI 生圖功能又壞掉，要回頭排查
- GitHub Pages / Supabase / ComfyUI 部署狀態混亂時
- 想整理哪些需求已完成、哪些還在待辦

如果之後要再進一步升級，可以把這份文件拆成真正的 Codex skill 結構，例如：

- `card-project-handoff`
- `shared-comfyui-operator`
- `school-card-ai-prompting`

但目前先保留成單一 md，最方便交接與閱讀。
