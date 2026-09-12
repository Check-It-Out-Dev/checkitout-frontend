# ADR — attestations and seeded canaries, not identity checks, for review of machine-written change

_2026-09-12. Status: accepted (design); nothing here is built. See `GOVERNING-MACHINE-WRITTEN-CHANGE.md` §9._

## Context

When an agent writes the code and the tests in one pass, the independent oracle that made a red
suite meaningful is gone, and the human reviewer becomes the backstop. The measured conditions that
backstop now works under, across the industry rather than here:

- Reviewing AI-written code is reported as _more_ effort than reviewing a colleague's, not less.
- Roughly half of developers say they always check AI-generated code before committing.
- Pull requests merged with no review at all are rising, and review latency with them.

So the failure mode is not dishonesty. It is a person under a deadline, facing a 30-file diff, whose
approval is indistinguishable — to every system that records it — from the approval of someone who
read it.

The question this ADR settles: what control makes that difference visible, without pretending to
measure something we cannot?

## Options

1. **Biometric or hardware-key confirmation at merge.** A fingerprint, passkey or security-key touch
   binding the approval to a present human.
2. **Detect whether the review text was machine-generated.** Run a classifier over review comments
   and flag or block AI-written ones.
3. **Attestations plus seeded canaries.** Approval requires answering something specific about this
   diff, and a disclosed programme occasionally plants a known defect to measure detection.

## Decision

Option 3, with a size cap on critical paths as its precondition.

The reasoning is a single distinction: **presence, identity and authorship are all cheap to fake for
the purpose that matters, and none of them is attention.** A control is worth buying here only if it
is cheap for a reviewer who read the diff and expensive for one who did not.

| Control                                   | Cost if you read it                  | Cost if you did not                              | Measures                                |
| ----------------------------------------- | ------------------------------------ | ------------------------------------------------ | --------------------------------------- |
| Specific attestation tied to diff content | Seconds; you already know the answer | You have to go and read it                       | Attention, indirectly but honestly      |
| Seeded canary defect, disclosed as policy | Zero                                 | A missed canary is recorded                      | Detection rate, per reviewer, over time |
| Size cap on critical paths                | Zero; the change was already small   | Forces the 30-file change into reviewable pieces | Reviewability, structurally             |

Attestations are questions whose answers live in the diff and nowhere else — "which endpoint changed
its required role", "what does this transition now permit that it did not". They are generated from
the diff, not written by hand, or they decay into a checkbox.

Canaries follow the aviation-security precedent: synthetic threat images are projected into X-ray
screening precisely because vigilance cannot be assumed and must be measured. The programme is
announced in advance, the canary never reaches `main`, and the measure is a rate over time rather
than a verdict on one person.

## Consequences

- A canary programme is a commitment: it needs a rota, a guaranteed revert, and a rule that the
  detection rate is discussed as a process metric and never as a performance review. Without those,
  it is entrapment and will be resented, correctly.
- Attestation text becomes an artefact in the merge record, which makes an unread approval visible
  after the fact — including to the person who gave it.
- Size caps will occasionally be inconvenient and must be overridable with a reason, or they will be
  routed around silently, which is worse than not having them.
- The prerequisite landed with this ADR rather than before it: both repositories now carry a
  ruleset on `main` that requires a pull request and a green `Merge verdict`, with no bypass for
  anyone, and a CODEOWNERS file naming the invariant surfaces. What it does **not** require is an
  approval, and that is deliberate — GitHub does not let an author approve their own pull request,
  so on a repository with one maintainer a required approval makes every pull request unmergeable.
  The gate therefore buys a rendered diff and enforced CI, not a second pair of eyes. Raising the
  count to 1 the day a second person has write access is a one-line change.
- Which means the controls in this ADR are not decoration on top of a working review process; on a
  single-maintainer repository they are the only thing that could make review mean anything at all.
  That is an argument for building them, and also an admission that their value here cannot be
  demonstrated until someone else reviews something.

## Rejected

**Biometrics at merge** (option 1). It proves a specific human was present and consented, which is
necessary and nowhere near sufficient. Worse, it produces a record that _looks_ like assurance,
which makes the gap harder to see rather than easier. Presence was never the variable in doubt.

**Detecting AI-written reviews** (option 2). Two independent reasons. It does not work reliably at
the level of an individual document, and it is documented to misfire on people writing in a second
language — a control that penalises non-native English speakers for the way they write is
indefensible regardless of its accuracy. And it targets the wrong thing: an AI-assisted review by
someone who read the diff is fine; a hand-typed "LGTM" from someone who did not is not. Authorship
is not the variable either.
