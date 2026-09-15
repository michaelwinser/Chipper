# Frozen exports

Each file here is a real export, written by the app at the version in its name, and
committed unchanged. They exist so that a schema change which breaks files people already
have fails the build.

**Do not regenerate one to make a test pass.** The moment a file here fails is the moment
it is doing its job: something about the format changed, and the answer is a migration plus
a *new* file at the new version — never new bytes under an old name. A regenerated fixture
is a deleted guard.

The only legitimate reason to rewrite one is that it never recorded a valid document in the
first place. That happened once, at M8: `v1-m6.json` carried timestamps like
`00:00:100.000Z`, produced by a fixture helper that padded a counter to two digits and ran
past ninety-nine. The schema had never been run against the file, so nothing caught it.

`v1-m6.json` deliberately contains the awkward shapes, not just the ordinary ones: done
work, notes, tags, an archived goal, priorities and pile items.

`synthetic-v1-m7-archived-star.json` is the document M8 was written for: two stars pointing
inside a goal that was archived after they were set. M7 accepted it and called it clean; M8
refuses it, which is why the v1 → v2 migration exists. It carries the `synthetic-` prefix
because it is hand-written to the shape M7 produced rather than exported — the bug it
records was found by review rather than by hitting it. It was briefly named `v1-m7-…`,
which is the prefix reserved below for real exports; the convention was invented in this
file and broken by the first file added under it.

## `synthetic-*.json` — hand-written, and named so

A file whose name starts with `synthetic-` was **written by hand**, not exported by any
version of the app. The rules above do not apply to it: it may be edited freely, because
it is evidence of nothing.

It exists for shapes the app can produce but no real export happened to contain. Keeping
them in separate files is the point. `g-orphan` — an archived goal whose swimlane has been
deleted, the one place a reference is allowed to dangle (`DESIGN.md` §3.3, invariant 1) —
was briefly inserted into `v1-m6.json` instead, which quietly converted a frozen guard into
a hand-edited fixture while its docstring still claimed it was committed unchanged. That is
the failure this naming convention exists to prevent: a file that says "a real export wrote
this" has to be true, or it is worse than having no fixture at all.
