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

## 11. `ttneway.ddns.net` 直連版現況

後來已確認 `ttneway.ddns.net` 不是 Cloudflare 帳號內可管理的 Zone，
所以固定入口改走直連版，而不是 Cloudflare Named Tunnel。

目前已完成：

- 本機反向代理已改用 Caddy
- 設定檔：`D:\codexTEST\card\cards-collection\tools\caddy\Caddyfile`
- 啟動腳本：`D:\codexTEST\card\cards-collection\tools\caddy\start-direct-gateway.ps1`
- 停止腳本：`D:\codexTEST\card\cards-collection\tools\caddy\stop-direct-gateway.ps1`
- 檢查腳本：`D:\codexTEST\card\cards-collection\tools\caddy\check-direct-gateway.ps1`

目前 Caddy 已能在本機監聽：

- `80`
- `443`

而且已經開始向 Let's Encrypt 申請 `ttneway.ddns.net` 的正式憑證。

## 12. 直連版目前卡住的地方

Let's Encrypt 的驗證目前失敗，錯誤重點是：

- `210.240.38.81: Fetching http://ttneway.ddns.net/.well-known/acme-challenge/...: Timeout during connect`

這代表外部網路還打不進來，常見原因只有兩個：

1. 路由器沒有把 `80` / `443` 轉發到這台電腦
2. Windows 防火牆還沒有放行 `80` / `443`

## 13. 直連版還需要你完成的事

### 13.1 Windows 防火牆

因為目前這個 Codex 工作階段不是系統管理員權限，所以無法直接幫你加防火牆規則。

已準備腳本：

- `D:\codexTEST\card\cards-collection\tools\caddy\setup-direct-gateway-firewall.ps1`

請用系統管理員 PowerShell 執行它。

### 13.2 路由器 Port Forward

你家裡或學校的路由器需要把以下連接埠轉到這台電腦：

- 外部 TCP `80` -> 這台電腦內部 IP 的 `80`
- 外部 TCP `443` -> 這台電腦內部 IP 的 `443`

這台電腦目前區網 IP 是：

- `10.102.3.64`

如果路由器之後改配發新 IP，轉發規則也要一起更新，或改成 DHCP 保留固定 IP。

## 14. 完成後如何驗證

當防火牆與路由器都設定完成後，可重新執行：

- `D:\codexTEST\card\cards-collection\tools\caddy\check-direct-gateway.ps1`

若成功，Caddy 會取得正式憑證，之後外部就能使用：

- `https://ttneway.ddns.net/health`

## 15. 建議回退方案：自動同步的 trycloudflare Tunnel

如果目前網路環境無法自行設定路由器轉發，建議回到 Tunnel 方案。

這個方案不保證網址永遠固定，但可以做到：

1. 本機啟動 `cloudflared quick tunnel`
2. 自動抓出新的 `https://*.trycloudflare.com`
3. 自動把 `remote_ai_settings.base_url` 更新到 Supabase
4. 教師端重新整理後就會使用新的共享生圖網址

相關腳本：

- `D:\codexTEST\card\cards-collection\tools\cloudflared\start-shared-tunnel.ps1`
- `D:\codexTEST\card\cards-collection\tools\cloudflared\check-shared-tunnel.ps1`
- `D:\codexTEST\card\cards-collection\tools\cloudflared\stop-shared-tunnel.ps1`

這個版本會強制使用 `HTTP/2`，避免目前網路對 `QUIC/7844` 的限制造成 quick tunnel 不穩。
