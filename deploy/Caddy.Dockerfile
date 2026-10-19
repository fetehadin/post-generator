# Caddy serving the built React app. The frontend is built here, so the server needs no Node.
# VITE_ values are public by design (Supabase URL and publishable key); never put secrets here.
FROM node:24-alpine AS frontend
WORKDIR /src/frontend
COPY frontend/package.json frontend/package-lock.json ./
RUN npm ci
COPY frontend/ ./
# The shared X counter cases, imported by a test file that tsc type-checks.
COPY samples/x_counter_cases.json /src/samples/x_counter_cases.json
ARG VITE_SUPABASE_URL
ARG VITE_SUPABASE_PUBLISHABLE_KEY
ENV VITE_SUPABASE_URL=$VITE_SUPABASE_URL VITE_SUPABASE_PUBLISHABLE_KEY=$VITE_SUPABASE_PUBLISHABLE_KEY
RUN npm run build

FROM caddy:2
COPY deploy/Caddyfile /etc/caddy/Caddyfile
COPY --from=frontend /src/frontend/dist /srv/frontend
