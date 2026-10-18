import { createFileRoute } from "@tanstack/react-router";
import { decodeTarget } from "@/lib/proxy-rewrite";
import { handleProxy, methodNotAllowed } from "@/lib/proxy-handler";

async function handle(request: Request) {
  const incoming = new URL(request.url);
  const encoded = incoming.searchParams.get("url");
  if (!encoded) return new Response("Missing url", { status: 400 });
  let decoded: string;
  try {
    decoded = decodeTarget(encoded);
  } catch {
    return new Response("Invalid url", { status: 400 });
  }
  const rewritten = new URL(incoming.toString());
  rewritten.searchParams.set("url", decoded);
  return handleProxy(new Request(rewritten.toString(), request));
}

export const Route = createFileRoute("/public/proxy")({
  server: {
    handlers: {
      GET: ({ request }) => handle(request),
      POST: () => methodNotAllowed(),
    },
  },
});
