# Sonar's 67 unlabelled inputs, and why 66 of them stay open

Status: accepted, 2026-09-10.

## What Sonar reports

`Web:InputWithoutLabelCheck`, 67 findings across 24 templates, every one saying the same thing:

> Add an "id" attribute to this input field and associate it with a label.

At 67 findings it is the single largest rule in either repository, and the obvious move is to add
`aria-label` to 67 inputs and watch the count go to zero.

That would be the wrong change, and it would make the application worse.

## What the templates actually do

Every one of the 66 looks like this:

```html
<mat-form-field appearance="outline">
  <mat-label>{{ 'opportunities.form.field.name' | transloco }}</mat-label>
  <input matInput formControlName="name" />
</mat-form-field>
```

Angular Material generates an id for the `<mat-label>` and points the input's `aria-labelledby` at
it when the component initialises. The association is real, it is what a screen reader uses, and it
exists only at runtime. Sonar's HTML checker reads the template as a file. It cannot see it, and no
amount of correctness in the template will make it visible.

Adding `aria-label` on top would not remove the `<mat-label>` — the visible label has to stay. The
input would then have both an `aria-label` and an `aria-labelledby`, `aria-label` wins, and the
result is a control announced from an attribute that no longer has to agree with the text on screen.
Two sources of truth for one label, kept in step by nobody. That is a regression, bought to make a
number smaller.

## What was done instead

**One finding was real** and is fixed: a `type="file"` input in `opportunity-form.component.html`,
hidden behind a styled button. It is `display:none` and assistive technology never reaches it, so it
was not a live defect either — but that is a property of a CSS class, and classes change. It carries
an `aria-label` now, which renders nothing.

**The rule the code follows is now enforced**, by `tools/check-input-labels.mjs`, wired into
`check:static` and the pre-commit hook as `check:input-labels`. A control is named when:

1. it carries `aria-label` or `aria-labelledby`, static or bound; or
2. it is inside a `<mat-form-field>` that contains a `<mat-label>`; or
3. it has an `id` with a matching `<label for="...">` in the same template; or
4. a `<label>` wraps it; or
5. it is `type="hidden"`, which is not a control.

Current result: **68 form controls across 53 templates, every one with an accessible name.**

The check was mutation-tested in both directions before it landed — remove the `aria-label` from the
file input and it fails naming that line; remove a `<mat-label>` from the sign-in form and it fails
naming that line; restore either and it passes.

## Why this is the better trade

A static checker that does not understand the framework will keep being wrong about it. There are
two possible responses: contort the code until the checker is happy, or state the rule the code
actually follows and enforce that. The second one is enforced on every commit, in under a second,
against the whole template tree — which is more than the 67 findings were ever going to give us,
and it fails on the next unlabelled input rather than reporting it a day later.

The 66 findings stay open in SonarCloud, marked against this document. Reliability rating is
affected and that is accepted: the rating is a summary of findings, and a finding that is wrong does
not become right because it costs a letter grade.

## What would change this

If Sonar teaches this rule about `mat-form-field`, or if the project moves off Angular Material,
re-run the numbers. If a template ever needs an input outside a form field, `check:input-labels` will
demand a label for it at commit time, which is the outcome the Sonar rule was reaching for.
