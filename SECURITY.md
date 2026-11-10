# Security

NZ Redact runs entirely in the browser. The page's Content Security Policy sets `connect-src 'none'` and `form-action 'none'`, so the page cannot send text anywhere. The service worker only caches the site's own files for offline use.

If you find a way for pasted text to leave the page, or a way to make the page load code from elsewhere, please report it privately through GitHub's "Report a vulnerability" button on the Security tab of this repository, rather than in a public issue.

A detail the rules miss is not a security issue. Please report those as normal issues, with made-up examples.
