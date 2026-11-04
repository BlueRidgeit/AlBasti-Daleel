# Advanced Search: highlighted passages and Copy phrase (opt-in)

Flag: `DALEEL_HIGHLIGHT_MATCHES=true` (default off; with it off nothing changes).

SharePoint and Office for the web cannot link to a position inside a file, so Advanced Search shows
where the match is instead:

* `searchDocumentsAdvanced` asks Azure AI Search for highlighted fragments of `content` and
  `contentAr` (up to 3 per field, wrapped in the markers U+27E6 and U+27E7), keeps up to 3 distinct
  passages per file across its matching chunks, and returns them as `highlights`. Files with no
  passage (for example a match only in the title) fall back to the usual snippet.
* The response also carries `matchPhrase` (exact phrase, else all words, any words, part words) for
  the **Copy phrase** button, which copies it so the user can press Ctrl+F in the opened file.
* The client renders the markers as highlighted text, so no HTML from the index is ever inserted.
* Highlights are only attached to files that pass SharePoint permission trimming.

Limits: Azure returns fragments of about 100 characters. For Arabic, highlighting follows the
search analyzer, so it may mark single words instead of the whole phrase.
