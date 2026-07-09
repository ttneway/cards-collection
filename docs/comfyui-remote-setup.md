# 共享 ComfyUI 主機與固定 Tunnel 設定說明

這份文件記錄目前卡牌系統如何串接這台電腦上的 ComfyUI，以及如何把共享生圖入口改成固定可用的網址。

## 1. 目前架構

目前共享生圖流程如下：

1. 卡牌網站前端呼叫共享生圖 Gateway
2. Gateway 驗證共享金鑰與 workflow
3. Gateway 轉送請求到這台電腦上的 ComfyUI
4. Gateway 取回圖片後再回傳給網站

目前本機服務：

- ComfyUI：`http://127.0.0.1:8188`
- 共享 Gateway：`http://127.0.0.1:8787`

目前資料庫中的共享生圖設定 `provider = comfyui_gateway`。

## 2. 目前使用的 ComfyUI

目前共用生圖主機是使用這台電腦上的原生 ComfyUI，不是 Stability Matrix 版。

已確認的 ComfyUI 路徑與環境：

- ComfyUI 工作目錄：`C:\Users\ttn\Documents\ComfyUI`
- Gateway 程式：`D:\codexTEST\card\cards-collection\tools\comfyui-shared-gateway\server.mjs`

## 3. 目前使用的模型與 workflow

共享生圖目前走的是可替換的 ComfyUI API workflow JSON。

你目前常用的卡牌 workflow 相關檔案：

- 工作流範例：`D:\codexTEST\card\cards-collection\docs\qwen-image-4steps-card-api.json`
- 你提供的 workflow 參考：`C:\Users\ttn\Downloads\(Qwen-Imgae四步生圖)qwen-image-4steps.json`

目前系統已支援以下 placeholder：

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

其中 `{{seed}}` 已可在網頁端設定為固定值或亂數值。

## 4. 目前固定網址的狀態

目前狀態分成兩種：

### 4.1 臨時可用入口

現在共享生圖可以透過 Cloudflare 的臨時 Tunnel 對外提供服務。

這種網址可以用，但有兩個缺點：

- 每次重開後網址可能改變
- 不適合當正式固定入口

### 4.2 固定入口目標

要完成的正式入口是：

- `https://ttneway.ddns.net`

目前已確認：

- `ttneway.ddns.net` 已解析到這台電腦目前的公開 IP：`210.240.38.81`
- 但外部目前還無法直接透過 `https://ttneway.ddns.net` 連到共享 Gateway

原因不是網址錯，而是固定 Tunnel 憑證還沒有完整落地。

## 5. 現在卡住的最後一步

Cloudflare `tunnel login` 已經進行到最後，但它回報：

- 瀏覽器應該已下載 Cloudflare 憑證
- 需要手動把憑證放到：
  `C:\Users\ttn\.cloudflared\cert.pem`

也就是說，現在最缺的不是程式碼，而是這一個檔案：

- `C:\Users\ttn\.cloudflared\cert.pem`

只要這個檔案到位，就能建立 Named Tunnel，並把 `ttneway.ddns.net` 真正綁定到共享生圖 Gateway。

## 6. 固定 Tunnel 完成後要做的事

拿到 `cert.pem` 後，接下來會做這幾步：

1. 建立 Cloudflare Named Tunnel
2. 將 `ttneway.ddns.net` 綁到該 Tunnel
3. 建立本機 Cloudflare 設定檔
4. 讓 Tunnel 指向本機 Gateway `http://127.0.0.1:8787`
5. 驗證外部 `https://ttneway.ddns.net/health`
6. 把資料庫中的共享生圖網址更新成 `https://ttneway.ddns.net`

## 7. 固定 Tunnel 設定檔模板

已準備好的模板檔案：

- `D:\codexTEST\card\cards-collection\tools\cloudflared\fixed-tunnel-config.example.yml`

正式啟用時，會依實際 Tunnel UUID 改成類似下面內容：

```yaml
tunnel: <TUNNEL-UUID>
credentials-file: C:\Users\ttn\.cloudflared\<TUNNEL-UUID>.json

ingress:
  - hostname: ttneway.ddns.net
    service: http://127.0.0.1:8787
  - service: http_status:404
```

## 8. 共享 Gateway 的健康檢查

Gateway 健康檢查：

- `GET /health`

生圖 API：

- `POST /generate`

目前本機可用健康檢查位置：

- `http://127.0.0.1:8787/health`

## 9. 目前已完成的相關事項

目前已完成：

- 共享生圖設定頁建立
- 管理員限定可編輯共享生圖設定
- `workflow_api_json` 可儲存
- seed 固定值 / 亂數值設定
- Gateway 支援 `{{seed}}`
- Gateway 支援閒置 5 分鐘後釋放 ComfyUI 模型記憶體
- 卡牌頁面可透過共享 ComfyUI 主機生成預覽圖

## 10. 下一步

下一步只差一件事：

把 Cloudflare 下載的憑證檔放到：

- `C:\Users\ttn\.cloudflared\cert.pem`

完成後，就可以繼續把 `ttneway.ddns.net` 做成真正固定可用的共享生圖入口。
