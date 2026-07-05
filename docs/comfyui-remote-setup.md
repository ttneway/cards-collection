# ComfyUI 串接卡牌系統設定說明

這份文件是記錄目前「卡牌系統」如何串接這台電腦上的 ComfyUI，避免之後忘記。

## 1. 目前架構

目前卡牌系統的共享生圖，不是直接連到你平常操作的 ComfyUI 視窗，而是拆成兩層：

1. `卡牌專用 ComfyUI 後端`
2. `共享 Gateway`

流程如下：

`卡牌網站`
-> `共享 Gateway`
-> `卡牌專用 ComfyUI 後端`
-> 回傳圖片給卡牌網站

這樣做的原因是：

- 比較不容易被你平常 Comfy Desktop 的外掛干擾
- 比較適合給 GitHub Pages / Supabase Edge Function 穩定呼叫
- 能把共享金鑰、健康檢查、錯誤處理集中在 Gateway

## 2. 目前使用中的元件

### 2.1 你平常操作的 ComfyUI

你平常使用的是 `Comfy Desktop`，不是 Stability Matrix 內建的那一份。

- 程式位置：
  `C:\Users\ttn\AppData\Local\Programs\@comfyorgcomfyui-electron\Comfy Desktop.exe`
- 使用資料夾：
  `C:\Users\ttn\Documents\ComfyUI`

### 2.2 卡牌專用 ComfyUI 後端

卡牌系統目前是另外開一個「精簡版後端」給共享生圖使用：

- 本機網址：
  `http://127.0.0.1:8188`
- 啟動方式：
  使用 ComfyUI 主程式直接啟動
- 特性：
  加上 `--disable-all-custom-nodes`

也就是說，卡牌系統目前的共享生圖，**不吃你平常桌面版那些 custom nodes**。

這是目前刻意這樣設計的，目的就是求穩定。

### 2.3 共享 Gateway

- 程式位置：
  [tools/comfyui-shared-gateway/server.mjs](D:\codexTEST\card\cards-collection\tools\comfyui-shared-gateway\server.mjs)
- 本機網址：
  `http://127.0.0.1:8787`
- 對外公開網址：
  `https://shaw-pos-ann-suggestions.trycloudflare.com`

Gateway 作用：

- 驗證共享金鑰
- 對卡牌網站提供固定 API
- 幫忙呼叫 ComfyUI `/prompt`、`/history`、`/view`
- 把生成結果整理後回傳

## 3. 目前卡牌系統使用的模型

目前共享生圖用的是 `Qwen Image` 這組模型：

- UNET：
  `qwen_image_fp8_e4m3fn.safetensors`
- 文字編碼：
  `qwen_2.5_vl_7b_fp8_scaled.safetensors`
- VAE：
  `qwen_image_vae.safetensors`

模型位置都在：

- `C:\Users\ttn\Documents\ComfyUI\models\diffusion_models`
- `C:\Users\ttn\Documents\ComfyUI\models\text_encoders`
- `C:\Users\ttn\Documents\ComfyUI\models\vae`

## 4. 目前卡牌系統使用的工作流

這不是直接使用 ComfyUI 畫面裡某個現成 `.json` 工作流，而是為了 API 串接整理出來的精簡 workflow。

核心節點如下：

1. `UNETLoader`
2. `CLIPLoader`
3. `VAELoader`
4. `ModelSamplingAuraFlow`
5. `CLIPTextEncode` 正向
6. `CLIPTextEncode` 負向
7. `EmptySD3LatentImage`
8. `KSampler`
9. `VAEDecode`
10. `SaveImage`

目前設定：

- 尺寸：`1024 x 1024`
- Steps：`20`
- CFG：`3`
- Sampler：`euler`
- Scheduler：`simple`
- Shift：`3.1`

實際 workflow 內容目前儲存在 Supabase 的 `remote_ai_settings.workflow_api_json` 欄位中。

## 5. 卡牌系統裡的設定位置

前端頁面：

- [src/pages/TeacherRemoteAiPage.tsx](D:\codexTEST\card\cards-collection\src\pages\TeacherRemoteAiPage.tsx)

前端呼叫：

- [src/lib/remoteAi.ts](D:\codexTEST\card\cards-collection\src\lib\remoteAi.ts)

Edge Function：

- [supabase/functions/generate-card-image/index.ts](D:\codexTEST\card\cards-collection\supabase\functions\generate-card-image\index.ts)

資料表 / migration：

- [supabase/migrations/00039_remote_ai_gateway_settings.sql](D:\codexTEST\card\cards-collection\supabase\migrations\00039_remote_ai_gateway_settings.sql)

## 6. 目前已寫入資料庫的設定

目前 `remote_ai_settings` 已啟用，主要內容如下：

- provider：`comfyui_gateway`
- base_url：`https://shaw-pos-ann-suggestions.trycloudflare.com`
- is_enabled：`true`

共享金鑰有設定，但**不在這份 md 檔明文記錄**，避免之後被一起同步到 GitHub。

如果之後要查目前有沒有設定成功，可用：

```sql
select provider, base_url, is_enabled, shared_secret is not null as has_secret
from public.remote_ai_settings
where provider = 'comfyui_gateway';
```

## 7. 這次做過的清理

### 7.1 已處理

- `ComfyUI-DeepSeek-OCR` 殘留已移出主 `custom_nodes`
- `matplotlib` 已補裝

### 7.2 目前仍可能看到的外掛警告

你平常的 Comfy Desktop 仍可能出現一些與外掛相依套件有關的警告，例如：

- `skimage`
- `hydra`
- `iopath`
- `segment_anything`
- `argostranslate`

這些目前**不影響卡牌系統的共享生圖**，因為卡牌系統現在走的是 `--disable-all-custom-nodes` 的精簡後端。

## 8. 啟動順序建議

如果之後整台電腦重開，建議順序：

1. 開 Comfy Desktop（你平常用的）
2. 開卡牌專用 ComfyUI 後端（8188）
3. 開共享 Gateway（8787）
4. 開 Cloudflare Tunnel
5. 到卡牌系統「共享生圖主機」頁按一次「測試連線」

## 9. 目前最大注意事項

### 9.1 對外網址是暫時的

現在用的是 `trycloudflare.com` 的臨時 Tunnel：

- 電腦重開後可能失效
- cloudflared 關掉後會失效
- 不適合長期正式使用

如果要長期穩定，之後應改成：

1. Cloudflare Named Tunnel
2. 固定網域或固定子網域

### 9.2 共享生圖成功，不代表桌面版一定穩

目前卡牌系統穩定，靠的是：

- 精簡後端
- 關閉 custom nodes

所以這一套的重點是「給卡牌網站穩定生圖」，不是完整複製你平常桌面上的所有工作流環境。

## 10. 之後如果要改模型

如果之後要換共享生圖模型，通常要改的是 `remote_ai_settings.workflow_api_json` 裡的：

- `UNETLoader`
- `CLIPLoader`
- `VAELoader`
- 可能還有採樣節點參數

如果換成別的模型族系，workflow 也常常要一起改，不一定只是換檔名。

## 11. 之後如果要改回直接吃桌面版

不建議直接改，但如果真的要改，方向會是：

- 不使用 `--disable-all-custom-nodes`
- 直接讓 Gateway 指到桌面版 ComfyUI 的 port

缺點是：

- 比較容易被外掛衝到
- 啟動較慢
- 出錯來源更難查

## 12. 目前狀態摘要

截至這次整理為止：

- 共享 Gateway：已可用
- 對外 Tunnel：已可用
- 卡牌系統資料庫設定：已寫入
- 共享生圖健康檢查：已通過
- 真實生圖測試：已成功

## 13. 建議下一步

之後最值得做的兩件事：

1. 把 `trycloudflare` 改成固定 Tunnel
2. 在教師後台做一個「查看目前共享生圖設定摘要」區塊，讓你不用每次進資料庫查
