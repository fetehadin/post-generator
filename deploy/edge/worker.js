// Cloudflare Worker: serves Voxlace at voxlace.fetehadin.com (Cloudflare holds that DNS zone).
// It forwards every request, unchanged, to the server's own HTTPS name (ORIGIN), where the
// shared Caddy answers. Why a Worker and not a plain DNS record: attaching a Worker to a custom
// domain makes Cloudflare create the record itself, so no DNS-edit key is needed.
// Swap it for an A record (DNS only) to 169.58.96.52 any time; see deploy/README.md.
//
// Login requests (/auth/v1/...) go to Supabase (SUPABASE_HOST) instead. Some networks can't
// resolve *.supabase.co, which showed up as "Failed to fetch" on sign-up; through our own
// domain the browser never needs that name. Supabase then sees Cloudflare's address, not the
// user's, so its per-IP limits (e.g. 30 sign-ins per 5 minutes) are shared by everyone.
export default {
  async fetch(request, env) {
    const url = new URL(request.url)
    url.hostname = url.pathname.startsWith('/auth/v1/') ? env.SUPABASE_HOST : env.ORIGIN
    url.port = ''
    // Same method, headers and body; redirects are passed back to the browser untouched.
    return fetch(new Request(url, request))
  },
}
