# Multi-Library Search — Production Deployment Guide

This describes promoting the **multi-library search + filter + admin Library Management**
feature to production. There are **two deployables**:

| Component | Repo | Target | Deploy trigger |
| --- | --- | --- | --- |
| App (chat UI + APIs) | `AlBastiSearch` | Azure **Container Apps** | push to `main` (GitHub Actions) |
| Indexer (crawler) | `albasti-spo-indexer` | Azure **Functions** | manual `func publish` or the new CI workflow |

> ⚠️ Pushing the app to `main` **auto-deploys to production**. Set the new configuration
> (below) **before** that push, or the new features will fail in prod.

The Azure AI Search index schema (`library`, `driveId`, `itemId` fields) is **already live** —
it was added additively, so the currently-deployed app keeps working until you ship the new one.

---

## Order of operations

1. Deploy the **indexer** (producer) and get its reindex **function key**.
2. Set the **app's** new env vars/secrets on the Container App.
3. Merge `feature/multi-library` → `main` and push → app auto-deploys.
4. Verify in prod.
5. **Index the libraries** (backfill) — deliberately, after a quota bump.

---

## Part 1 — Deploy the indexer (Azure Functions)

The indexer already runs in Azure (it populated the existing index). You're updating it.

### 1a. App settings (Functions app → Settings → Environment variables)
Confirm/add these (the **bold** ones are new for multi-library):

| Setting | Value |
| --- | --- |
| `AzureWebJobsStorage` | the real Storage account connection string (NOT `UseDevelopmentStorage`) |
| `CLIENT_ID` / `CLIENT_SECRET` / `TENANT_ID` | Entra app with **Application** Graph `Files.Read.All` + `Sites.Read.All` |
| `DRIVE_ID` | the Docs library drive id (legacy/default) |
| **`INDEX_LIBRARIES`** | JSON seed, e.g. `[{"driveId":"<docs>","label":"Docs"},{"driveId":"<books>","label":"Albasti Books"}]` |
| `EMBEDDING_ENDPOINT` / `EMBEDDING_MODEL` / `EMBEDDING_KEY` | Azure OpenAI embeddings (`text-embedding-3-small`) |
| `SEARCH_SERVICE` / `SEARCH_INDEX` | `https://albasti-search-dev.search.windows.net` / `docs-index` |
| `SEARCH_KEY` | the Search **ADMIN** key (must write) |

> The local-only timer-disable flags (`AzureWebJobs.SharePointCrawler.Disabled`, `…RetryWorker…`)
> live in `local.settings.json` and are **not** deployed — so in prod the scheduled delta
> crawler (every 10 min) and the retry worker correctly run.

### 1b. Deploy the code
Option A — CLI:
```bash
cd albasti-spo-indexer
func azure functionapp publish <your-indexer-functionapp-name>
```
Option B — CI: push this repo to GitHub and use `.github/workflows/deploy-functions.yml`
(configure the `AZURE_FUNCTIONAPP_NAME` + OIDC secrets it references).

### 1c. Get the reindex function key
Functions app → **Functions → FullReindex → Function Keys** → copy the `default` key.
You'll paste it into the app as `INDEXER_FUNCTION_KEY`.

---

## Part 2 — Configure the app (Azure Container Apps)

Container App `albasti-search-chat` → **Settings**. Add these (new for multi-library):

| App env var | Value | Type |
| --- | --- | --- |
| `SHAREPOINT_SITE_ID` | `albasti.sharepoint.com,41ff214b-26a2-4d89-bde5-d64b39d536be,8e1eaea3-122c-4102-8f8f-a74028ef48de` | plain |
| `INDEXER_BASE_URL` | the deployed indexer base URL, e.g. `https://<indexer>.azurewebsites.net` | plain |
| `INDEXER_FUNCTION_KEY` | the FullReindex function key from 1c | **Secret** (`secretref:`) |
| `ADMIN_UPNS` | `bladmin@albasti.onmicrosoft.com` (comma/space separated) | plain |

> Why `ADMIN_UPNS`: this tenant issues **v1 access tokens that omit the `wids` role claim**,
> so role-only detection can't see Global Admins. The gate is **Global-Admin-by-claim OR
> UPN-in-`ADMIN_UPNS`**. List the admins' UPNs here.

---

## Part 3 — Deploy the app

```bash
cd AlBastiSearch
git checkout main
git merge --no-ff feature/multi-library
git push origin main        # ← triggers the Container Apps deploy workflow
```
The Docker build runs in a clean Linux container, so the local Turbopack/lockfile quirk does
not occur there.

---

## Part 4 — Verify in production

1. Sign in. Search works as before (no library filter selected = all libraries).
2. The **Search libraries** filter lists the indexed libraries with counts.
3. As a Global Admin (or an `ADMIN_UPNS` user), **Manage libraries** appears and lists all
   SharePoint libraries; **Index** enables + ingests one.
4. Open a known doc → confirms multi-drive live reads use each result's own `driveId`.

---

## Part 5 — Index the libraries (the backfill)

This is the slow, **rate-limited** step. See "When to index all libraries" below.

---

## When do we index ALL selected libraries on Live?

**Last — after the indexer is deployed/configured, and after raising the Azure OpenAI quota.**
It is an **operational** step, separate from shipping code.

How it runs:
- The **scheduled crawler** (every 10 min, delta) keeps enabled libraries in sync. The **first**
  crawl of a brand-new library does a **full** enumeration (ingests everything), then deltas are cheap.
- Or an admin clicks **Index** per library to force a full reindex.

The constraint is the **Azure OpenAI embedding rate limit**. On the current **S0** tier it throttles
hard (we observed ~70% of chunks 429'd on a large library). In prod the retry worker absorbs throttles,
but it's slow and burns calls. So:

1. **Raise the Azure OpenAI quota first** (`https://aka.ms/oai/quotaincrease`) — biggest lever.
2. **Stage it** — enable a **few libraries at a time**, let each finish, then the next. Don't enable
   all (especially the big ones: Lawyers, Judgement, Albasti Books, الجريدة الرسمية) at once.
3. **Run off-hours** — the initial bulk index is large; deltas afterward are incremental/cheap.
4. **Backfill Docs** too (its ~15k existing chunks have no `library` yet → re-index to stamp `Docs`).
   Idempotent — re-running only overwrites/fills gaps.
5. Note: scanned/image-only PDFs are skipped (no text layer) — they need OCR (future work).

**Recommended:** ship the code first (Parts 1–4) so the *filter + admin UI* are live against whatever
is already indexed (Albasti Books today), then run the staged backfill (Part 5) once quota is raised.
