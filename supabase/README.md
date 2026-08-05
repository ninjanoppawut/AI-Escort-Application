# Supabase development workflow

The committed local stack uses ports `54620`–`54629` to avoid collisions
with other Supabase projects on shared development machines.

## Local

```powershell
npm run supabase:start
npm run supabase:status
npm run supabase:reset
npm run supabase:stop
npx supabase test db --local
npx supabase db advisors --local --type all --level warn --fail-on error
```

Studio is available at `http://127.0.0.1:54623` and Mailpit at
`http://127.0.0.1:54624`. Copy the browser-safe URL and publishable key shown
by `npm run supabase:status` into the ignored `.env.local`; never copy its
secret/service-role key into a `NEXT_PUBLIC_` variable.

## Hosted development project

The intended hosted project reference is `rhntelxdmuvldrxyceqx`
(`https://rhntelxdmuvldrxyceqx.supabase.co`). Each developer links the CLI
locally after authenticating:

```powershell
npx supabase login
npx supabase link --project-ref rhntelxdmuvldrxyceqx
```

The generated `supabase/.temp` link state is intentionally ignored. Before any
remote schema operation, confirm this project is a dedicated AI Escort
development environment and inspect pending migrations. Never reset a linked
staging or production database.

The CLI link was verified on 2026-08-05. Local migrations remain the source of
truth and are not pushed merely because the project is linked. Inspect and test
the exact migration set locally before an authorized `db push`.

Create every migration through the installed CLI after checking its help:

```powershell
npx supabase migration new <descriptive_name>
```
