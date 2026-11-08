# Changelog

Versions are **generated at deploy time**, not carried in the sources: a merge
into `production` is tagged `vYYYY.MM.DD.N`, where `N` counts that day's
releases. Nothing needs bumping.

Each release's notes are assembled from the commits since the previous one,
preceded by anything written under Unreleased below. The full history lives on
the [releases page](https://github.com/klaushofrichter/christina.art/releases);
this file is where notes are written *before* a release, not an archive.

<!-- Anything under Unreleased is prepended to the next release's notes.

     CLEAR THIS AFTER A RELEASE. The release step reads this file and never
     writes it, so entries left here go out again with the next release
     (scripts/check-changelog.sh fails a PR into production that would do so).

     Leave the section genuinely empty when there is nothing to say: every
     non-blank line under the heading is published, placeholders included.

     Currently empty. Last released: v2026.11.08.3. -->
## [Unreleased]

A DEMO sash in the top right corner (as on cams.skylar.technology) marks the
biography, titles and exhibitions as placeholders. The footer now shows the
release version. Behind the scenes, the site's text lives in three files
(biography, works, exhibitions) that are checked and built in at deploy time.
