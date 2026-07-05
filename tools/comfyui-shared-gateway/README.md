# ComfyUI Shared Gateway

這個小型 Gateway 讓 GitHub Pages 上的卡牌網站，透過固定網址安全地呼叫你目前這台電腦上的 `ComfyUI`。

## 環境變數

- `PORT`
- `COMFYUI_BASE_URL`
- `GATEWAY_SHARED_SECRET`
- `ALLOWED_ORIGIN`
- `GENERATE_TIMEOUT_MS`

範例：

```powershell
$env:PORT="8787"
$env:COMFYUI_BASE_URL="http://127.0.0.1:8188"
$env:GATEWAY_SHARED_SECRET="replace-with-your-secret"
$env:ALLOWED_ORIGIN="https://ttneway.github.io"
node server.mjs
```

## API

- `GET /health`
- `POST /generate`

`POST /generate` 需要帶：

- header: `x-shared-secret`
- body:

```json
{
  "workflow": "{ ... ComfyUI API JSON ... }",
  "placeholders": {
    "full_prompt": "..."
  },
  "timeoutMs": 120000
}
```
