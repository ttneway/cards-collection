update public.remote_ai_settings
set base_url = 'https://types-sees-config-heel.trycloudflare.com',
    is_enabled = true,
    updated_at = now()
where provider = 'comfyui_gateway';

select provider, base_url, is_enabled
from public.remote_ai_settings
where provider = 'comfyui_gateway';
