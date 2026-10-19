import { describe, expect, it } from "vitest";
import { decodeTarget, encodeTarget, publicTarget, proxyUrl, rewriteCss, rewriteHtml } from "@/lib/proxy-rewrite";

describe("Server-mediated browsing", () => {
  it("routes unquoted image and link addresses through the server", () => {
    const result = rewriteHtml('<img src=/photo.jpg><a href=https://example.org/next>Next</a>', "https://example.com/");
    expect(result).toContain(proxyUrl("/photo.jpg", "https://example.com/"));
    expect(result).toContain(proxyUrl("https://example.org/next", "https://example.com/"));
  });
  it("routes inline styles and CSS imports through the server", () => {
    const result = rewriteCss('@import "theme.css"; body{background:url(/photo.jpg)}', "https://example.com/path/");
    expect(result).toContain(proxyUrl("theme.css", "https://example.com/path/"));
    expect(result).toContain(proxyUrl("/photo.jpg", "https://example.com/"));
  });
  it("uses the upstream base rather than the proxy origin", () => {
    expect(rewriteHtml('<base href="https://example.org/assets/"><img src="x.jpg">', "https://example.com/")).toContain(proxyUrl("x.jpg", "https://example.org/assets/"));
  });
  it("sandboxes third-party scripts and injects the request interceptor", () => {
    const result = rewriteHtml('<script>fetch("/api")</script><img onerror="alert(1)" src="x.jpg"><iframe src="https://example.org"></iframe>', "https://example.com/");
    // Scripts are kept (sandboxed by CSP), but the interceptor loads first.
    expect(result).toContain('src="/proxy-interceptor.js"');
    expect(result).toContain('name="azoc-base" content="https://example.com/"');
    expect(result.indexOf("/proxy-interceptor.js")).toBeLessThan(result.indexOf('fetch("/api")'));
    expect(result).not.toContain("onerror");
    expect(result).not.toContain("<iframe");
  });
  it("never routes the interceptor script itself upstream", () => {
    expect(proxyUrl("/proxy-interceptor.js", "https://example.com/")).toBe("/proxy-interceptor.js");
  });
  it("preserves GET search parameters via the proxy form", () => {
    const result = rewriteHtml('<form action="/search"><input name="q"></form>', "https://example.com/");
    expect(result).toContain('action="/public/proxy"');
    expect(result).toContain('name="url" value="https://example.com/search"');
  });
  it("encodes destinations as binary digits and decodes them back", () => {
    const target = "https://example.com/検索?q=テスト";
    const encoded = encodeTarget(target);
    expect(encoded).toMatch(/^[01]+$/);
    expect(encoded).not.toContain("example.com");
    expect(decodeTarget(encoded)).toBe(target);
    expect(() => decodeTarget("0123")).toThrow();
  });
  it("hides the literal destination inside generated proxy links", () => {
    const link = proxyUrl("https://example.org/next page", "https://example.com/");
    expect(link.startsWith("/public/proxy?url=")).toBe(true);
    expect(link).not.toContain("example.org");
  });
  it.each(["http://127.0.0.1", "http://169.254.169.254", "http://localhost", "http://[::1]", "https://user:password@example.com", "https://example.com:8080"])("rejects nonpublic destination %s", (url) => {
    expect(() => publicTarget(url)).toThrow();
  });
});