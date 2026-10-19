<!-- LOVABLE:BEGIN -->
> [!IMPORTANT]
> This project is connected to [Lovable](https://lovable.dev). Avoid rewriting
> published git history — force pushing, or rebasing/amending/squashing commits
> that are already pushed — as it rewrites history on Lovable's side and the
> user will likely lose their project history.
>
> Commits you push to the connected branch sync back to Lovable and show up in
> the editor, so keep the branch in a working state.
<!-- LOVABLE:END -->

- Keep proxy URL validation and HTML/CSS rewriting in the browser-safe proxy-rewrite module so routing and tests share one implementation.
- Serve proxied pages sandboxed: third-party scripts may run only under the CSP sandbox (no same-origin access) with public/proxy-interceptor.js forcing dynamic requests back through the proxy; third-party code must never gain access to the application's origin or user sessions.
- Guard the proxy with src/lib/proxy-guard.ts: on anomalous request/failure rates it severs the connection and serves a 503 maintenance page for the lockout period. Never disable this to "fix" errors.
