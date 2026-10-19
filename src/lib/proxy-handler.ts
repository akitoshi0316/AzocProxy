import { PROXY_PATH, publicTarget, rewriteHtml, rewriteCss } from "@/lib/proxy-rewrite";
import { clientKey, checkGuard, guardResponse, recordOutcome } from "@/lib/proxy-guard";

export async function handleProxy(request: Request) {
  const key = clientKey(request);
  const verdict = checkGuard(key);
  if (!verdict.allowed) return guardResponse(verdict.retryAfter ?? 300);
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
        "user-agent": request.headers.get("user-agent") ?? "Mozilla/5.0 AzocProxy",
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
    recordOutcome(key, 502);
    return new Response(`Fetch failed: ${(e as Error).message}`, { status: 502 });
  }
  recordOutcome(key, res.status);

  const finalUrl = res.url || url.toString();
  const type = res.headers.get("content-type") ?? "";
  const headers = new Headers();
  if (type) headers.set("content-type", type);
  headers.set("cache-control", "no-store");
  headers.set("referrer-policy", "no-referrer");
  headers.set("x-content-type-options", "nosniff");
  // The interceptor fetches from an opaque (sandboxed) origin, so allow
  // cross-origin reads of proxied content. No credentials are ever sent.
  headers.set("access-control-allow-origin", "*");
  // Scripts run, but only inside a sandbox without same-origin access: the
  // page can never touch this app's storage or session. Every network
  // direction is pinned to this origin, so the interceptor (or the CSP
  // backstop) forces all traffic through the proxy.
  headers.set(
    "content-security-policy",
    `sandbox allow-forms allow-popups allow-scripts; default-src 'none'; script-src ${incoming.origin} 'unsafe-inline'; connect-src ${incoming.origin}; img-src ${incoming.origin} data:; style-src ${incoming.origin} 'unsafe-inline'; font-src ${incoming.origin} data:; media-src ${incoming.origin}; form-action ${incoming.origin}${PROXY_PATH}; frame-src 'none'; worker-src 'none'; base-uri 'none'`,
  );

  if (type.includes("text/html")) {
    return new Response(rewriteHtml(await res.text(), finalUrl), { status: res.status, headers });
  }
  if (type.includes("text/css")) {
    return new Response(rewriteCss(await res.text(), finalUrl), { status: res.status, headers });
  }
  return new Response(res.body, { status: res.status, headers });
}

export function methodNotAllowed() {
  return new Response("このプロキシは閲覧専用です。ログインや送信には対応していません。", {
    status: 405,
    headers: { allow: "GET" },
  });
}
