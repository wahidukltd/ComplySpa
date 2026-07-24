# AGENTS.md

**Ponytail MUST be active at `full` for every task. No exceptions.**

ComplySpa — Med Spa Compliance SaaS. US-first.

## 3 Core Features

1. **Credential Tracker** — staff licenses, certifications, insurance, agreements
2. **Expiration Alerts** — email-only via Resend (no SMS)
3. **Audit Report PDF** — downloadable compliance report per clinic

## Commands (run in order: typecheck → lint → build)

```
npm run typecheck                    # tsc --noEmit
npm run lint                         # ESLint
npm run build                        # next build
npm run test:unit                    # vitest run tests/unit
npm run test:integration             # requires `supabase start` + .env.local
npm run test:e2e                     # playwright
```

**Security: Never push `.env*`, secrets, API keys, or credentials to GitHub.**  
Everything sensitive stays in `.env.local` (gitignored) or Vercel/Supabase environment variables.

## 3 Colors

```
Background:  #FFFFFF
Primary:     #6E97A7
Text:        #000000
```

No other brand colors. Status colors (green/amber/red) are functional only.

## Tooling (always active)

- **Ponytail** — active at `full`. Laziest working solution ladder. Must be on for every task.
- **Graphify** — knowledge graph. Query it for any project knowledge. No assumptions ask Graphify first.

### MCPs + CLI

| Tool | Purpose |
|------|---------|
| Vercel MCP | Deploy, domains, env vars |
| Supabase MCP + CLI | Auth, DB, Edge Functions, Storage, migrations |
| GitHub MCP | Repos, PRs, issues, actions |
| Resend MCP | Transactional email |
| Sentry MCP | Error monitoring |
| Cloudflare MCP | DNS, registrar |
| Cloudflare-blog MCP | Cloudflare blog search |
| Cloudflare-docs MCP | Cloudflare documentation |
| Firecrawl MCP | Web scraping |
| Exa MCP | Web search |
| Context7 MCP | Library/framework docs |
| Zoho CLI | `zmail-cli.jar` — email admin (support@complyspa.com) |

### Specialist Review Agents

Use these for quality gates. Delegate when needed — do not skip.

| Agent | When to use |
|-------|-------------|
| Code Reviewer | PR review, code quality, logic checks |
| Security Reviewer | Auth, secrets, input validation, RLS |
| Database Reviewer | Migrations, schema changes, RLS policies, queries |

## Stack

| Layer | Tool | Purpose |
|-------|------|---------|
| Frontend | Next.js 16 (App Router) | React framework, SSR, routing |
| Language | TypeScript (strict) | Type safety |
| Styling | Tailwind CSS v4 + shadcn/ui | Utility-first CSS + component library |
| Animation | Framer Motion | UI animations |
| Auth | Supabase Auth | Email/password + Google OAuth, RLS |
| Database | Supabase PostgreSQL | Primary data store |
| Backend | Supabase Edge Functions | Serverless compute |
| Storage | Supabase Storage | File uploads (documents) |
| Cron | Supabase pg_cron | Scheduled jobs (expiration checks) |
| Email | Resend | Transactional emails (alerts, welcome) |
| Email Admin | Zoho Mail | support@, hello@, alerts@ |
| Payments | Polar.sh | Subscription billing |
| Monitoring | Sentry | Error tracking |
| Hosting | Vercel | Deployment + auto-deploy from GitHub |
| DNS | Cloudflare | Registrar + DNS management |

Domain: complyspa.com (Cloudflare Registrar, Vercel deploy).  
Push to `main` → auto-deployed to production.

## Email

- **support@complyspa.com** — support mailbox
- **hello@complyspa.com** — general mailbox  
- **alerts@complyspa.com** — alias → hello@ (credential expiration alerts)

## Rules

- Before commit: `npm run typecheck` → `npm run lint` → `npm run build`
- All error classes in `src/lib/utils/errors.ts` — single source.
- Use `{ data, error }` sentinel pattern, never return null.

## Lessons

- **Never change DNS records unless absolutely necessary.** Each change causes propagation delays that take the site down temporarily. The default Cloudflare + Vercel setup (proxied A record → 76.76.21.21) is correct and stable. CNAME flattening at the apex introduces risk for zero benefit.

### Known Technical Debt

These are acknowledged gaps that don't warrant fixing at their current risk level. Revisit if the related code area is being actively developed:

- **Sentinel pattern inconsistency** — `addCredential()` returns `{success, error}`, but `updateCredential()`/`deleteCredential()`/`verifyCredentialNow()` return `{error}` without `success`. Standardize if touching these actions.
- **Edge Function code duplication** — `send-credential-alert/index.ts` duplicates `htmlEscape`, `sleep`, and retry logic from `src/lib/email/send.ts`. Deno vs Node runtime prevents shared imports. Update both if changing retry behavior.
- **Webhook rate limiter in-memory** — Resend webhook rate limiter uses a `Map` that resets on Vercel deploy. Resend controls the caller IPs, Svix validates signatures. Add persistent storage if throughput exceeds 100 req/min.
