/**
 * Cabeçalhos de segurança do site, numa fonte só.
 * `node seguranca.mjs` regrava public/_headers (Netlify, Cloudflare Pages) e
 * vercel.json. O vite preview usa os mesmos, para testar antes de publicar.
 *
 * A CSP só deixa o navegador falar com o próprio site e com o Supabase.
 * style-src tem 'unsafe-inline' por causa dos atributos style do React;
 * script-src não tem: nenhum script embutido roda.
 */
export function cabecalhos(conexoesExtras = []) {
  const conexoes = ["'self'", 'https://*.supabase.co', 'wss://*.supabase.co', ...conexoesExtras].join(' ');
  return {
    'Content-Security-Policy': [
      "default-src 'self'",
      "script-src 'self'",
      "style-src 'self' 'unsafe-inline'",
      // Fotos da medição: link assinado do Storage do Supabase (balde privado).
      "img-src 'self' data: blob: https://*.supabase.co",
      "font-src 'self' data:",
      `connect-src ${conexoes}`,
      "worker-src 'self' blob:",
      "object-src 'none'",
      "base-uri 'self'",
      "form-action 'self'",
      "frame-ancestors 'none'",
    ].join('; '),
    'Strict-Transport-Security': 'max-age=63072000; includeSubDomains; preload',
    'X-Content-Type-Options': 'nosniff',
    'X-Frame-Options': 'DENY',
    'Referrer-Policy': 'strict-origin-when-cross-origin',
    'Permissions-Policy': 'camera=(), microphone=(self), geolocation=(), payment=(), xr-spatial-tracking=(self), gyroscope=(self), accelerometer=(self), magnetometer=(self)',
  };
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const { writeFileSync } = await import('node:fs');
  const h = cabecalhos();
  writeFileSync(
    new URL('./public/_headers', import.meta.url),
    `/*\n${Object.entries(h).map(([k, v]) => `  ${k}: ${v}`).join('\n')}\n\n/assets/*\n  Cache-Control: public, max-age=31536000, immutable\n`,
  );
  writeFileSync(new URL('./public/_redirects', import.meta.url), '/*  /index.html  200\n');
  writeFileSync(
    new URL('./vercel.json', import.meta.url),
    JSON.stringify(
      {
        rewrites: [{ source: '/(.*)', destination: '/index.html' }],
        headers: [
          { source: '/(.*)', headers: Object.entries(h).map(([key, value]) => ({ key, value })) },
          { source: '/assets/(.*)', headers: [{ key: 'Cache-Control', value: 'public, max-age=31536000, immutable' }] },
        ],
      },
      null,
      2,
    ) + '\n',
  );
  console.log('Cabeçalhos gravados em public/_headers, public/_redirects e vercel.json.');
}
