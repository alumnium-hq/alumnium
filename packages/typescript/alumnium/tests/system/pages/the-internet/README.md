# Local the-internet examples

These pages are adapted from [Sauce Labs' the-internet](https://github.com/saucelabs/the-internet)
for the TypeScript, Python, and Java test suites. The upstream Apache 2.0 license
and legacy MIT notice are preserved in `LICENSE` and `license.txt`.

Open `index.html` directly or use the existing test navigation helpers. All links,
frames, styles, and images are local. The adaptations remove the shared external
layout, analytics, jQuery, and Dropzone dependencies:

- Tables keep the original data and independent sorting, using browser JavaScript
  and keyboard-accessible header buttons.
- Nested frames keep the original frame hierarchy and names.
- The large page builds its 50 levels and 50-by-50 table in JavaScript.
- Dynamic content inserts three bundled profile images after 500 ms.
- File upload reads the selected file locally and displays its name and confirmation.
- Navigation includes only the examples used by these tests and a fixed typo.
- Password recovery uses a local HTTP server supplied by the waiter tests. It
  posts to `/password-reset` and displays the response after a 500 ms server delay;
  no email is sent. This page needs HTTP to exercise request synchronization.

Historical accessibility-tree fixtures and snapshots still contain upstream
URLs as recorded data. They do not make requests to the hosted site.
