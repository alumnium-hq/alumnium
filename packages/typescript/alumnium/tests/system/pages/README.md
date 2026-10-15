# Shared browser test pages

This directory contains the local HTML fixtures used by the TypeScript, Python,
and Java system tests. Keep shared pages and their assets here.

Each suite's navigation helper resolves relative page names against this directory.
Absolute URLs continue to work for tests that need an HTTP server or an external
site. The TypeScript test setup also grants this directory in its navigation policy.

The [the-internet examples](the-internet/README.md) include their upstream licenses
and describe the adaptations made to run locally.
