# ksubn — The AI-Supercharged Knowledge Graph

Map the hidden connections between people, organizations, and events.

## Stack
- Next.js 14, TypeScript, Tailwind v4, React Flow
- Supabase (PostgreSQL + Auth + Storage + RLS)
- Vercel, Replicate FLUX (images), Anthropic Claude

## Quick start

1. Create Supabase project → run `supabase/schema.sql` in SQL editor
2. Create public Storage bucket `entity-images`
3. Enable Google OAuth in Supabase Auth → add callback URL
4. Fill in `.env.local` (copy `.env.local.example`)
5. `npm install && npm run dev`

## Seed data
```bash
npm run seed -- --entities scripts/entities.json --claims scripts/claims.json
```

## Deploy
```bash
vercel --prod
# Set env vars in Vercel dashboard
```
Cron job runs `/api/queue/process` every 5 min for image generation.

## Voting integrity
- Individual votes: `claim_votes(user_id, claim_id, vote)`
- Aggregates on `claims`: maintained by DB triggers
- Ban + undo: `SELECT public.invalidate_user_signals('user-uuid')`
