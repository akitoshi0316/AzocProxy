import { createFileRoute } from "@tanstack/react-router";
import { publicTarget, rewriteHtml, rewriteCss } from "@/lib/proxy-rewrite";

async function handle(request: Request) {
  const incoming = new URL(request.url);
  const target = incoming.searchParams.get("url");
  if (!target) return new Response("Missing url", { status: 400 });
  let url: URL;
  try {
    if (target.length > 8192) throw new Error("URL too long");
    url = publicTarget(target);
    incoming.searchParams.forEach((value, key) => {
      if (key !== "url") url.searchParams.append(key, value);
    });
  } catch {
    return new Response("Invalid url", { status: 400 });
  }

  let res: Response;
  try {
    const options: RequestInit = {
      method: "GET",
      headers: {
        "user-agent": request.headers.get("user-agent") ?? "Mozilla/5.0 Azoc Proxy",
        accept: request.headers.get("accept") ?? "*/*",
        "accept-language": request.headers.get("accept-language") ?? "en",
      },
      redirect: "manual",
      signal: AbortSignal.timeout(20000),
    };
    res = await fetch(url.toString(), options);
    let redirects = 0;
    while ([301, 302, 303, 307, 308].includes(res.status)) {
      const location = res.headers.get("location");
      if (!location || redirects++ >= 5) throw new Error("Redirect limit exceeded");
      await res.body?.cancel();
      url = publicTarget(location, url.toString());
      res = await fetch(url.toString(), options);
    }
  } catch (e) {
    return new Response(`Fetch failed: ${(e as Error).message}`, { status: 502 });
  }

  const finalUrl = res.url || url.toString();
  const type = res.headers.get("content-type") ?? "";
  const headers = new Headers();
  if (type) headers.set("content-type", type);
  headers.set("cache-control", "no-store");
  headers.set("referrer-policy", "no-referrer");
  headers.set("x-content-type-options", "nosniff");
  headers.set(
    "content-security-policy",
    `sandbox allow-forms allow-popups; default-src 'none'; img-src ${incoming.origin}/api/public/proxy data:; style-src ${incoming.origin}/api/public/proxy 'unsafe-inline'; font-src ${incoming.origin}/api/public/proxy data:; media-src ${incoming.origin}/api/public/proxy; form-action ${incoming.origin}/api/public/proxy; script-src 'none'; connect-src 'none'; frame-src 'none'; base-uri 'none'`,
  );

  if (type.includes("text/html")) {
    return new Response(rewriteHtml(await res.text(), finalUrl), { status: res.status, headers });
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
      POST: () =>
        new Response("このプロキシは閲覧専用です。ログインや送信には対応していません。", {
          status: 405,
          headers: { allow: "GET" },
        }),
    },
  },
});
