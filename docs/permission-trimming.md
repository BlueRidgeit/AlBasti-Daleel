# SharePoint permission trimming (opt-in)

Flag: `DALEEL_ENFORCE_SHAREPOINT_PERMISSIONS=true` (default off). Optional
`DALEEL_PERMISSION_CACHE_SECONDS` (default 300, 0 disables the cache).

The index is crawled app-only, so it holds every document. With the flag on, each candidate result
is verified against SharePoint with the signed-in user's Graph token (the same OBO exchange the app
already does) before its title, link or text is returned.

* `src/lib/permission-trim.ts`: `GET /drives/{drive}/items/{item}?$select=id` for each candidate,
  20 per `$batch` call, up to 200 candidates per search, stopping once enough are allowed.
  200 allows; 403/404 denies; anything else (401, 429, 5xx, timeout, no token) is "unknown" and is
  treated as denied. Definitive answers are cached per user and item.
* `searchDocuments` and `searchDocumentsAdvanced` take a `viewer` and over-fetch candidates.
  With the flag on and no viewer they return nothing.
* `readDocument`: the indexed-text fallback (used when the live read fails) now runs only after
  SharePoint confirms access; otherwise nothing from the index is returned. `validateDocumentAccess`
  does not return the indexed title or link for a denied file.
* `/api/libraries` (the library picker and its document counts): with the flag on it requires
  sign-in (no list on the login screen) and lists only libraries whose root folder the user can
  open (`GET /drives/{drive}/items/root`). A user with access to none sees an empty picker with
  "No libraries are available to your account." A user with access only to a subfolder inside a
  library will not see that library in the picker, but search still finds their documents.
* Callers: `/api/chat`, `/api/integration/chat`, `/api/search`, `/api/search-documents`,
  `/api/read-document`. Any new route that calls `searchDocuments` must pass a viewer.

Not covered: previously saved chat history, document counts of libraries the user can open (the
count is the library total), and files reachable only
through a sharing link (the item endpoint checks the user's direct or group access).
