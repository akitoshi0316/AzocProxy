import { parse, serialize, html as htmlConstants, type DefaultTreeAdapterTypes } from "parse5";
import postcss from "postcss";
import valueParser from "postcss-value-parser";

export const PROXY_PATH = "/public/proxy";

// The destination is carried as UTF-8 binary digits so the literal URL never
// appears in proxy links. This is reversible encoding, not secret-key encryption.
export function encodeTarget(value: string): string {
  const bytes = new TextEncoder().encode(value);
  let out = "";
  for (const byte of bytes) out += byte.toString(2).padStart(8, "0");
  return out;
}

export function decodeTarget(encoded: string): string {
  const cleaned = encoded.replace(/\s+/g, "");
  if (!cleaned || cleaned.length % 8 !== 0 || /[^01]/.test(cleaned)) {
    throw new Error("Invalid encoded url");
  }
  const bytes = new Uint8Array(cleaned.length / 8);
  for (let i = 0; i < bytes.length; i++) bytes[i] = parseInt(cleaned.slice(i * 8, i * 8 + 8), 2);
  return new TextDecoder().decode(bytes);
}

export function publicTarget(value: string, base?: string): URL {
  const url = new URL(base ? value : (/^https?:\/\//i.test(value) ? value : `https://${value}`), base);
  const host = url.hostname.toLowerCase().replace(/\.$/, "");
  // Literal addresses and local names are never destinations for the public proxy.
  if (!/^https?:$/.test(url.protocol) || url.username || url.password ||
    (url.port && !["80", "443"].includes(url.port)) ||
    !host.includes(".") || /[:\[\]]/.test(host) || /^\d+\.\d+\.\d+\.\d+$/.test(host) ||
    /(^|\.)(localhost|local|internal|test|invalid)$/.test(host)) {
    throw new Error("公開WebサイトのHTTP/HTTPSアドレスを指定してください。");
  }
  return url;
}

export function proxyUrl(value: string, base: string): string {
  const trimmed = value.trim();
  if (/^(?:#|data:|mailto:|tel:)/i.test(trimmed)) return value;
  if (trimmed.startsWith(`${PROXY_PATH}?`)) return trimmed;
  try {
    const url = publicTarget(trimmed, base);
    const hash = url.hash;
    url.hash = "";
    return `${PROXY_PATH}?url=${encodeTarget(url.toString())}${hash}`;
  } catch {
    return "about:blank";
  }
}

export function rewriteCss(css: string, base: string): string {
  try {
    const root = postcss.parse(css);
    const rewriteValue = (value: string, isImport = false) => {
      const parsed = valueParser(value);
      let importDone = false;
      parsed.walk((node) => {
        if (node.type === "function" && node.value.toLowerCase() === "url") {
          const raw = valueParser.stringify(node.nodes).trim().replace(/^(["'])(.*)\1$/, "$2");
          node.nodes = [{ type: "string", quote: '"', value: proxyUrl(raw, base), sourceIndex: 0, sourceEndIndex: 0 }];
          importDone = true;
          return false;
        }
        if (isImport && !importDone && node.type === "string") {
          node.value = proxyUrl(node.value, base);
          importDone = true;
        }
        return undefined;
      });
      return parsed.toString();
    };
    root.walkDecls((decl) => { decl.value = rewriteValue(decl.value); });
    root.walkAtRules("import", (rule) => { rule.params = rewriteValue(rule.params, true); });
    return root.toString();
  } catch {
    // Never return an unparsed stylesheet that could make direct requests.
    return "";
  }
}

export function rewriteHtml(html: string, finalUrl: string): string {
  const document = parse(html);
  let base = finalUrl;
  const findBase = (node: DefaultTreeAdapterTypes.Node) => {
    if ("tagName" in node && node.tagName === "base") {
      const href = node.attrs.find((attr) => attr.name === "href");
      if (href) { try { base = publicTarget(href.value, finalUrl).toString(); } catch { /* use final URL */ } }
    }
    if ("childNodes" in node) node.childNodes.forEach(findBase);
  };
  findBase(document);
  const walk = (node: DefaultTreeAdapterTypes.Node) => {
    if ("childNodes" in node) {
      node.childNodes = node.childNodes.filter((child) => {
        if (!("tagName" in child)) return true;
        if (["script", "base", "iframe", "object", "embed"].includes(child.tagName)) return false;
        if (child.tagName === "meta" && child.attrs.some((attr) => attr.name === "http-equiv")) return false;
        if (child.tagName === "link" && child.attrs.some((attr) => attr.name === "rel" && /preconnect|dns-prefetch|modulepreload|manifest/i.test(attr.value))) return false;
        return true;
      });
      node.childNodes.forEach(walk);
    }
    if (!("tagName" in node)) return;
    const action = node.attrs.find((attr) => attr.name === "action")?.value ?? finalUrl;
    node.attrs = node.attrs.filter((attr) => !attr.name.startsWith("on") && !["srcset", "imagesrcset", "integrity", "crossorigin", "ping", "srcdoc", "formaction"].includes(attr.name));
    for (const attr of node.attrs) {
      if (["href", "src", "poster", "background", "xlink:href"].includes(attr.name)) attr.value = proxyUrl(attr.value, base);
      if (attr.name === "style") attr.value = rewriteCss(`x{${attr.value}}`, base).replace(/^x\{([\s\S]*)\}$/, "$1");
    }
    if (node.tagName === "style") {
      node.childNodes.forEach((child) => { if ("value" in child) child.value = rewriteCss(child.value, base); });
    }
    if (node.tagName === "form") {
      const method = node.attrs.find((attr) => attr.name === "method")?.value.toLowerCase() ?? "get";
      node.attrs = node.attrs.filter((attr) => !["action", "method", "target"].includes(attr.name));
      node.attrs.push({ name: "action", value: method === "get" ? PROXY_PATH : "about:blank" }, { name: "method", value: "get" });
      if (method === "get") {
        const input: DefaultTreeAdapterTypes.Element = { nodeName: "input", tagName: "input", namespaceURI: htmlConstants.NS.HTML, attrs: [{ name: "type", value: "hidden" }, { name: "name", value: "url" }, { name: "value", value: new URL(action, base).toString() }], childNodes: [], parentNode: node };
        node.childNodes.unshift(input);
      } else {
        node.attrs.push({ name: "inert", value: "" });
      }
    }
  };
  walk(document);
  return serialize(document);
}