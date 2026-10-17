import { describe, expect, it } from "vitest";
import { decodeProxyTarget, encodeProxyTarget, publicTarget, proxyUrl, rewriteCss, rewriteHtml } from "@/lib/proxy-rewrite";

describe("Binary proxy destinations", () => {
  it("encodes UTF-8 bytes as eight binary digits each", () => {
    expect(encodeProxyTarget("https://example.com")).toBe("01101000011101000111010001110000011100110011101000101111001011110110010101111000011000010110110101110000011011000110010100101110011000110110111101101101");
  });
  it("decodes destinations including Unicode and query strings", () => {
    const url = "https://example.com/日本語?q=hello&x=1#見出し";
    expect(decodeProxyTarget(encodeProxyTarget(url))).toBe(url);
  });
  it("uses the requested path without a literal destination or fragment", () => {
    const result = proxyUrl("/next?q=1#heading", "https://example.com/");
    expect(result).toMatch(/^\/public\/proxy\?url=[01]+$/);
    expect(decodeProxyTarget(result.split("url=")[1])).toBe("https://example.com/next?q=1#heading");
  });
  it.each(["", "010", "https://example.com", "00000002", "11111111", "0".repeat(65544)])("rejects malformed or oversized binary input", (value) => {
    expect(() => decodeProxyTarget(value)).toThrow();
  });
  it("still rejects local destinations after decoding", () => {
    expect(() => publicTarget(decodeProxyTarget(encodeProxyTarget("http://127.0.0.1")))).toThrow();
  });
});

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
  it("prevents third-party executable code and nested documents", () => {
    const result = rewriteHtml('<script>fetch("https://example.org")</script><img onerror="alert(1)" src="x.jpg"><iframe src="https://example.org"></iframe>', "https://example.com/");
    expect(result).not.toContain("<script");
    expect(result).not.toContain("onerror");
    expect(result).not.toContain("<iframe");
  });
  it("preserves GET search parameters via the proxy form", () => {
    const result = rewriteHtml('<form action="/search"><input name="q"></form>', "https://example.com/");
    expect(result).toContain('action="/public/proxy"');
    expect(result).toContain(`name="url" value="${encodeProxyTarget("https://example.com/search")}"`);
  });
  it.each(["http://127.0.0.1", "http://169.254.169.254", "http://localhost", "http://[::1]", "https://user:password@example.com", "https://example.com:8080"])("rejects nonpublic destination %s", (url) => {
    expect(() => publicTarget(url)).toThrow();
  });
});