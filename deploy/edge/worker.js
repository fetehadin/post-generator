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
//
// Requests to our own server carry the visitor's address (X-Voxlace-Client-IP) and a secret
// (X-Voxlace-Edge, the Worker secret EDGE_SECRET) that vouches for it. The API counts guest
// drafts per address (FR-47) and trusts that header only when the secret matches, so a caller
// can't dodge the limit by sending a made-up address. Supabase never gets the secret.
export default {
  async fetch(request, env) {
    const url = new URL(request.url)
    const toSupabase = url.pathname.startsWith('/auth/v1/')
    url.hostname = toSupabase ? env.SUPABASE_HOST : env.ORIGIN
    url.port = ''
    // Same method, headers and body; redirects are passed back to the browser untouched.
    const forwarded = new Request(url, request)
    forwarded.headers.delete('x-voxlace-edge')
    forwarded.headers.delete('x-voxlace-client-ip')
    if (!toSupabase && env.EDGE_SECRET) {
      forwarded.headers.set('x-voxlace-edge', env.EDGE_SECRET)
      forwarded.headers.set('x-voxlace-client-ip', request.headers.get('cf-connecting-ip') ?? '')
    }
    return fetch(forwarded)
  },
}
