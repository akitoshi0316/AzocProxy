import { createFileRoute } from "@tanstack/react-router";

const PREFIX = "/api/public/proxy?url=";

function abs(u: string, base: string) {
  try {
    if (/^(data:|javascript:|mailto:|#)/i.test(u)) return null;
    return new URL(u, base).toString();
  } catch {
    return null;
  }
}

function rewrite(html: string, base: string) {
  return html
    .replace(/(\s(?:href|src|action))=(["'])(.*?)\2/gi, (m, attr, q, val) => {
      const a = abs(val, base);
      return a ? `${attr}=${q}${PREFIX}${encodeURIComponent(a)}${q}` : m;
    })
    .replace(/\ssrcset=(["']).*?\1/gi, "")
    .replace(/<meta[^>]+http-equiv=["']?content-security-policy[^>]*>/gi, "");
}

function rewriteCss(css: string, base: string) {
  return css.replace(/url\((["']?)(.*?)\1\)/gi, (m, q, val) => {
    const a = abs(val, base);
    return a ? `url(${q}${PREFIX}${encodeURIComponent(a)}${q})` : m;
  });
}

async function handle(request: Request) {
  const target = new URL(request.url).searchParams.get("url");
  if (!target) return new Response("Missing url", { status: 400 });
  let url: URL;
  try {
    url = new URL(target.startsWith("http") ? target : `https://${target}`);
  } catch {
    return new Response("Invalid url", { status: 400 });
  }
  if (!/^https?:$/.test(url.protocol)) return new Response("Unsupported", { status: 400 });

  let res: Response;
  try {
    res = await fetch(url.toString(), {
      method: request.method,
      headers: {
        "user-agent": request.headers.get("user-agent") ?? "Mozilla/5.0 CrawdyProxy",
        accept: request.headers.get("accept") ?? "*/*",
        "accept-language": request.headers.get("accept-language") ?? "en",
      },
      body: request.method === "POST" ? await request.arrayBuffer() : undefined,
      redirect: "follow",
    });
  } catch (e) {
    return new Response(`Fetch failed: ${(e as Error).message}`, { status: 502 });
  }

  const finalUrl = res.url || url.toString();
  const type = res.headers.get("content-type") ?? "";
  const headers = new Headers();
  if (type) headers.set("content-type", type);
  headers.set("cache-control", "no-store");

  if (type.includes("text/html")) {
    return new Response(rewrite(await res.text(), finalUrl), { status: res.status, headers });
  }
  if (type.includes("text/css")) {
    return new Response(rewriteCss(await res.text(), finalUrl), { status: res.status, headers });
  }
  return new Response(res.body, { status: res.status, headers });
}

export const Route = createFileRoute("/api/public/proxy")({
  server: {
    handlers: {
      GET: ({ request }) => handle(request),
      POST: ({ request }) => handle(request),
    },
  },
});
