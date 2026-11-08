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

     Currently empty. Last released: v2026.11.08.4. -->
## [Unreleased]

Easier to read: the grey text and the ochre dates now meet the WCAG AA
contrast standard in the light theme. Faster: pages, styles and scripts are
compressed and cached longer, and pictures are sized for how wide they are
actually drawn. The footer credits Skylar.Technology. Behind the scenes, every
release is now tested in four browsers (including iPhone and Android) and with
Google's Lighthouse before it goes out, and checked again on the live site
afterwards.

A new site icon: one of the poppies from "Pink Poppies" (the drawn mark it
replaces is kept in the repository). The DEMO sash now shows in the enlarged
view too; while it does, Close sits at the top left. The footer is one line
on a computer (©, version, credit, separated by dots). Fixed for Firefox and
Safari: pictures now hold their space while they load, so the page no longer
grows under the reader and the section links land on their section.
