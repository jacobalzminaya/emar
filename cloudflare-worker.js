// =====================================================
// CMD DETECTOR — Cloudflare Worker Proxy
// Despliega en: https://workers.cloudflare.com
// Gratis hasta 100,000 requests/dia
//
// PASOS:
// 1. Ve a https://workers.cloudflare.com
// 2. Crea cuenta gratuita
// 3. "Create Worker"
// 4. Pega este codigo completo
// 5. En "Settings > Variables" agrega:
//    ANTHROPIC_API_KEY = tu-api-key-aqui
// 6. Copia la URL del worker (ej: cmd-proxy.tuuser.workers.dev)
// 7. En index.html cambia PROXY_URL por esa URL
// =====================================================

export default {
  async fetch(request, env) {

    // Allow CORS from anywhere (or restringe a tu dominio)
    const corsHeaders = {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'POST, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type',
    };

    // Handle preflight
    if (request.method === 'OPTIONS') {
      return new Response(null, { headers: corsHeaders });
    }

    if (request.method !== 'POST') {
      return new Response('Method not allowed', { status: 405 });
    }

    try {
      const body = await request.json();

      // Forward to Anthropic
      const response = await fetch('https://api.anthropic.com/v1/messages', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-api-key': env.ANTHROPIC_API_KEY,
          'anthropic-version': '2023-06-01',
        },
        body: JSON.stringify(body),
      });

      const data = await response.json();

      return new Response(JSON.stringify(data), {
        headers: {
          ...corsHeaders,
          'Content-Type': 'application/json',
        },
      });

    } catch (err) {
      return new Response(JSON.stringify({ error: err.message }), {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }
  }
};
