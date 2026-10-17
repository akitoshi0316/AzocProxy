import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "Crawdy Proxy — 自由にWebを見る" },
      { name: "description", content: "Crawdy Proxy: ブラウザだけで使えるシンプルなWebプロキシ。" },
      { property: "og:title", content: "Crawdy Proxy" },
      { property: "og:description", content: "ブラウザだけで使えるシンプルなWebプロキシ。" },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: Index,
});

function Index() {
  const [url, setUrl] = useState("");
  const go = (e: React.FormEvent) => {
    e.preventDefault();
    if (!url.trim()) return;
    window.location.href = `/api/public/proxy?url=${encodeURIComponent(url.trim())}`;
  };
  return (
    <main className="crawdy-bg flex min-h-screen flex-col items-center justify-center px-4">
      <div className="w-full max-w-xl text-center">
        <div className="text-6xl">🦞</div>
        <h1 className="mt-4 font-display text-5xl font-bold tracking-tight text-foreground">
          Crawdy <span className="text-primary">Proxy</span>
        </h1>
        <p className="mt-3 text-muted-foreground">URLを入力して、ブロックされたサイトへアクセス。</p>
        <form onSubmit={go} className="mt-8 flex gap-2 rounded-2xl border border-border bg-card p-2 shadow-glow">
          <input
            value={url}
            onChange={(e) => setUrl(e.target.value)}
            placeholder="example.com"
            className="flex-1 bg-transparent px-3 py-3 text-foreground outline-none placeholder:text-muted-foreground"
          />
          <button className="rounded-xl bg-primary px-6 font-semibold text-primary-foreground transition hover:opacity-90">
            GO
          </button>
        </form>
        <p className="mt-6 text-xs text-muted-foreground">
          ※ JavaScriptの多い一部サイト（YouTube等）は正しく動かない場合があります。
        </p>
      </div>
    </main>
  );
}
