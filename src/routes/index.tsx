import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { encodeTarget } from "@/lib/proxy-rewrite";
import logo from "@/assets/azoc-icon.png.asset.json";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "AzocProxy — 自由にWebを見る" },
      { name: "description", content: "AzocProxy: ブラウザだけで使えるシンプルなWebプロキシ。" },
      { property: "og:title", content: "AzocProxy" },
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
    window.location.href = `/public/proxy?url=${encodeTarget(url.trim())}`;
  };
  return (
    <main className="flex min-h-screen flex-col items-center justify-center px-4">
      <div className="w-full max-w-xl text-center">
        <img src={logo.url} alt="AzocProxy" className="mx-auto h-28 w-28 rounded-3xl shadow-glow" />
        <h1 className="mt-4 font-display text-5xl font-bold tracking-tight text-foreground">
          Azoc<span className="text-gradient-primary">Proxy</span>
        </h1>
        <p className="mt-3 text-muted-foreground">これまでにない自由のWEB閲覧</p>
        <form onSubmit={go} className="mt-8 flex gap-2 rounded-2xl border border-border bg-card p-2 shadow-glow">
          <input
            value={url}
            onChange={(e) => setUrl(e.target.value)}
            placeholder="example.com"
            className="flex-1 bg-transparent px-3 py-3 text-foreground outline-none placeholder:text-muted-foreground"
          />
          <button className="rounded-xl bg-gradient-primary px-6 font-semibold text-primary-foreground transition hover:opacity-90">
            GO
          </button>
        </form>
        <p className="mt-6 text-xs text-muted-foreground">※ 閲覧専用です。すべての制限の解除は保証できません。</p>
      </div>
    </main>
  );
}
