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
- Keep destination encoding/decoding in that shared module and derive navigation, rewritten resource URLs and server CSP paths from its proxy path constant so all entry points use the same address format.
- Serve proxied pages as sandboxed, script-free, read-only documents; third-party code must never gain access to the application's origin or user sessions.
