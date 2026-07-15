# AI 生圖提示詞與流程說明

這份文件整理目前專案中「卡牌 / 裝備 / 職業」生圖時，系統實際會如何組裝提示詞，以及提示詞最後是怎麼送進雲端 AI 或共享 ComfyUI。

適用範圍：
- 卡牌管理頁 `/teacher/cards`
- 裝備管理頁 `/teacher/equipment`
- 職業管理頁 `/teacher/professions`
- 共享生圖設定頁 `/teacher/ai-remote`

---

## 1. 整體流程

目前專案有兩條生圖路線：

1. 雲端 AI
   - OpenAI
   - Google Gemini
   - Hugging Face

2. 共享 ComfyUI 主機
   - 前端不直接打 ComfyUI
   - 會先呼叫 Supabase Edge Function
   - Edge Function 組好 `finalPrompt`
   - 再把 `finalPrompt` 和其他 placeholders 填進 workflow JSON
   - 最後由 Gateway 送去本機 ComfyUI

也就是說，不管你用哪一種 provider，真正的核心文字提示詞都是先在同一個地方組好的。

實作位置：
- [aiPromptBuilder.ts](D:/codexTEST/card/cards-collection/src/lib/aiPromptBuilder.ts)
- [generate-card-image/index.ts](D:/codexTEST/card/cards-collection/supabase/functions/generate-card-image/index.ts)
- [server.mjs](D:/codexTEST/card/cards-collection/tools/comfyui-shared-gateway/server.mjs)

---

## 2. 提示詞的組成規則

系統會先根據物件類型建立一段 `finalPrompt`。

### 2.1 卡牌 prompt

卡牌的 prompt 來源：
- 卡牌名稱
- 稀有度
- 卡牌描述
- 分集冊名稱或系列名稱
- 主色
- AI 風格模板
- 教師另外補充的提示詞

組法大意如下：

```text
[風格模板描述]
Design artwork for a school collectible card.
The primary subject of this card must be "[卡牌名稱]".
Album or collection theme: [分集冊名稱或系列名稱].
Card rarity: [稀有度].
Main accent color: [主色].
Card description: [卡牌描述]
Supporting detail to include without replacing the main subject: [教師補充提示詞]
Keep the named subject obvious at first glance.
Avoid text, watermarks, UI, and unrelated random portrait subjects.
```

另外，卡牌還會再追加一段「卡牌比例用」的補充：

```text
Use a vertical trading-card composition.
Keep the subject centered and readable inside a 3:4 portrait safe area,
with comfortable margins for a card frame.
```

所以卡牌 prompt 會比裝備 / 職業多一段「請配合卡牌構圖」的限制。

---

### 2.2 裝備 prompt

裝備的 prompt 來源：
- 裝備名稱
- 稀有度
- 裝備描述
- 裝備欄位類型（頭飾 / 項鍊 / 戒指 / 寵物）
- AI 風格模板
- 教師補充提示詞

組法大意如下：

```text
[風格模板描述]
Design artwork for a school collectible equipment item.
The equipment named "[裝備名稱]" must be the main subject.
Equipment slot: [欄位類型].
Equipment rarity: [稀有度].
Equipment description: [裝備描述]
Supporting detail to include without replacing the main subject: [教師補充提示詞]
The item itself must dominate the composition.
If a character appears, they must remain secondary to the equipment.
Avoid text, watermarks, UI, and unrelated random portraits.
```

重點是：
- 主角必須是裝備本體
- 如果畫出人物，人物只能當陪襯

---

### 2.3 職業 prompt

職業的 prompt 來源：
- 職業名稱
- 職業代碼
- 職業描述
- 主題色
- 解鎖階段
- AI 風格模板
- 教師補充提示詞

組法大意如下：

```text
[風格模板描述]
Design artwork for a fantasy school profession or class.
The profession named "[職業名稱]" must be represented clearly as the main subject.
Profession code: [職業代碼].
Theme color: [主題色].
Unlock tier: [解鎖階段].
Profession description: [職業描述]
Supporting detail to include without replacing the main subject: [教師補充提示詞]
The result should work as a polished profession icon or portrait for a mobile game selection screen.
Avoid text, watermarks, UI, and unrelated subjects.
```

重點是：
- 要能清楚代表那個職業
- 偏向「遊戲職業圖示 / 角色立繪」的感覺

---

## 3. AI 風格模板實際加了什麼

目前內建三個主要風格模板，系統不是只記錄中文名稱，而是會對應到一段英文風格描述。

### 3.1 `Q版校園奇幻風`

對應描述：

```text
Create a polished chibi fantasy campus illustration with bright lighting,
clear silhouette, soft depth, and a premium collectible mobile game feeling.
```

意思：
- Q 版
- 校園奇幻
- 光線明亮
- 主體輪廓清楚
- 看起來像高品質手機遊戲收藏圖

### 3.2 `日系動漫插畫`

對應描述：

```text
Create a clean anime illustration with readable composition, expressive lighting,
refined details, and a premium game reward presentation.
```

意思：
- 日系動漫感
- 構圖清楚
- 光影有表現
- 細節較精緻

### 3.3 `卡牌框線風格`

對應描述：

```text
Create a polished collectible trading-card illustration with a visible decorative frame
on all four edges and premium printed-card styling.
```

意思：
- 會要求四邊有可見卡牌邊框
- 偏向實體收藏卡牌印刷感

---

## 4. 教師補充提示詞在系統裡的角色

教師自己輸入的提示詞，不會直接取代主題，而是被包成：

```text
Supporting detail to include without replacing the main subject: [你的文字]
```

這代表系統的設計理念是：

- 主題永遠以卡牌 / 裝備 / 職業名稱為核心
- 教師補充提示詞只是「加強細節」
- 不應該把主角完全換掉

例如：

- 卡牌名稱：`排球場`
- 補充提示詞：`超帥球員在排球場打球`

系統真正想表達的是：
- 主題仍然必須是「排球場」
- 球員是在這個主題上增加戲劇性
- 不能變成只畫一個人物大頭照

如果模型仍常把人物搶成主角，通常是模型本身對「人物」偏好太高，這時候就要：

1. 把卡牌名稱寫得更明確
2. 在補充提示詞裡再強調場景主體
3. 或在 workflow / negative prompt 裡加強限制

---

## 5. 雲端 AI 路線怎麼送出

雲端 AI 路線時，Edge Function 會把 `finalPrompt` 直接送給對應 provider。

### OpenAI

會送出：

```json
{
  "model": "[OpenAI 模型名]",
  "prompt": "[finalPrompt]",
  "size": "[尺寸]"
}
```

### Gemini

也是直接把 `finalPrompt` 當成文字提示詞送出。

### Hugging Face

也是直接把 `finalPrompt` 當主提示詞送出，並附帶寬高。

---

## 6. 尺寸與比例怎麼決定

目前系統針對卡牌和其他物件用不同尺寸。

### 卡牌

- OpenAI：`1024x1536`
- Hugging Face / Remote placeholders：
  - `image_width = 896`
  - `image_height = 1200`
  - `aspect_ratio = 3:4`

### 裝備 / 職業

- OpenAI：`1024x1024`
- Hugging Face / Remote placeholders：
  - `image_width = 1024`
  - `image_height = 1024`

所以卡牌會特別要求直式 3:4，比較符合目前卡牌版型。

---

## 7. 共享 ComfyUI 路線怎麼送出

共享 ComfyUI 不會只送一段 prompt 字串，而是：

1. 先組好 `finalPrompt`
2. 再建立 placeholders
3. 再把 placeholders 填進 workflow JSON

目前會提供給 workflow 的 placeholders 有：

```text
{{full_prompt}}
{{card_name}}
{{card_description}}
{{album_name}}
{{rarity}}
{{image_style}}
{{extra_prompt}}
{{card_color}}
{{negative_prompt}}
{{image_width}}
{{image_height}}
{{aspect_ratio}}
{{seed}}
```

其中最重要的是：

- `{{full_prompt}}`
  - 就是系統最後組好的完整提示詞

- `{{negative_prompt}}`
  - 來自「共享生圖設定」頁面的負面提示詞

- `{{seed}}`
  - 來自共享生圖設定頁的 random / fixed seed 設定

- `{{image_width}}` / `{{image_height}}` / `{{aspect_ratio}}`
  - 來自系統對卡牌或其他物件設定的尺寸

---

## 8. 一個實際例子

假設你在卡牌管理頁設定：

- 卡牌名稱：`排球場`
- 稀有度：`SR`
- 分集冊：`校園運動場景`
- 主色：`#22c55e`
- 風格模板：`Q版校園奇幻風`
- 補充提示詞：`超帥球員在排球場打球`

系統組出的 `finalPrompt` 大致會是：

```text
Create a polished chibi fantasy campus illustration with bright lighting, clear silhouette,
soft depth, and a premium collectible mobile game feeling.
Design artwork for a school collectible card.
The primary subject of this card must be "排球場".
Album or collection theme: 校園運動場景.
Card rarity: SR.
Main accent color: #22c55e.
Supporting detail to include without replacing the main subject: 超帥球員在排球場打球
Keep the named subject obvious at first glance.
Avoid text, watermarks, UI, and unrelated random portrait subjects.
Use a vertical trading-card composition.
Keep the subject centered and readable inside a 3:4 portrait safe area, with comfortable margins for a card frame.
```

如果走共享 ComfyUI，還會再把它塞進：

```json
{
  "full_prompt": "上面那整段 finalPrompt",
  "card_name": "排球場",
  "card_description": "",
  "album_name": "校園運動場景",
  "rarity": "SR",
  "image_style": "Q版校園奇幻風",
  "extra_prompt": "超帥球員在排球場打球",
  "card_color": "#22c55e",
  "negative_prompt": "[共享設定頁填的負面提示詞]",
  "image_width": "896",
  "image_height": "1200",
  "aspect_ratio": "3:4",
  "seed": "[亂數或固定 seed]"
}
```

接著 Gateway 會把 workflow 裡的 `{{full_prompt}}`、`{{seed}}` 等欄位全部替換掉，再送去 ComfyUI。

---

## 9. 為什麼有時生成結果還是會偏掉

就算系統 prompt 有限制，仍可能出現偏掉，常見原因有：

1. 模型本身偏好人物特寫
   - 尤其二次元模型常把「人物」當最強主題

2. 補充提示詞過強
   - 例如寫太多人物外貌、姿勢、特寫資訊

3. workflow 自己有固定風格傾向
   - 像某些 workflow 或 checkpoint 比較偏立繪、頭像

4. 負面提示詞不夠
   - 沒有明確限制 portrait / close-up / solo character

---

## 10. 怎麼自己調整比較有效

如果你想讓主題更穩，建議這樣調：

### 卡牌 / 場景類

- 名稱要明確，例如：
  - `校園排球場`
  - `夜間排球場`
  - `操場司令台`

- 補充提示詞要寫成：
  - `以排球場場景為主體，球場線、球網、觀眾席清楚可見，球員只是陪襯`

### 裝備類

- 補充提示詞避免人物成主角
- 明確寫：
  - `裝備本體置中，人物不可搶主體`

### 職業類

- 補充提示詞可描述服裝、姿態、道具
- 但最好仍點出：
  - `要像遊戲職業立繪`

---

## 11. 如果你想看「這一次真的送了什麼」

目前系統在共享 ComfyUI 預覽流程裡，其實有 `final_prompt` 這個欄位存在回傳資料中。

也就是說，技術上可以再加一個 UI：

- 直接顯示本次送出的完整 prompt
- 顯示替換後的 placeholders
- 顯示實際 seed

如果你要，我下一步可以直接幫你做成：

1. 生圖頁上的「查看本次提示詞」按鈕
2. 顯示 `finalPrompt`
3. 顯示 `negativePrompt`
4. 顯示 `seed`
5. 顯示送進 ComfyUI 的 placeholders 摘要

---

## 12. 目前相關程式位置

### Prompt 組裝
- [aiPromptBuilder.ts](D:/codexTEST/card/cards-collection/src/lib/aiPromptBuilder.ts)

### Edge Function 組 `finalPrompt`
- [generate-card-image/index.ts](D:/codexTEST/card/cards-collection/supabase/functions/generate-card-image/index.ts)

### 共享 ComfyUI placeholders
- [TeacherRemoteAiPage.tsx](D:/codexTEST/card/cards-collection/src/pages/TeacherRemoteAiPage.tsx)

### Gateway placeholder 替換
- [server.mjs](D:/codexTEST/card/cards-collection/tools/comfyui-shared-gateway/server.mjs)

### 共享 ComfyUI 設定說明
- [comfyui-remote-setup.md](D:/codexTEST/card/cards-collection/docs/comfyui-remote-setup.md)
