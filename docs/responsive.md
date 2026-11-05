# Phones and tablets

Below 1024 px wide (phones, tablets in portrait) the layout switches to a single column:

* The left menu and the Assistant panel (library picker, Advanced Search) become drawers. Header
  buttons open them (menu on the left, filters on the right; mirrored in Arabic); tapping the dimmed
  page, the close button or Esc closes them, and choosing something (new chat, a chat, Projects,
  Find) closes them too. A closed drawer is `inert`, so it cannot be focused off-screen.
* The page uses the full screen (`dvh`, no outer margin, no rounded frame), the header is more
  compact and list views use smaller padding.
* From 1024 px up nothing changes: the desktop classes are untouched. Checked by comparing screenshots
  of the old and new code at 1024, 1360 and 1600 px, in English and Arabic (pixel-identical).

Implementation: `useIsDesktop()` (a `matchMedia` hook) and a `drawer` state in `legal-workspace.tsx`;
`PanelSlot`, `PrimaryNav` and `SupportPanel` use `absolute` drawers below `lg` and their previous
static layout from `lg` up.
