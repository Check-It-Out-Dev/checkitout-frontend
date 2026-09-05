# The sandbox, state by state

Generated from Neo4j namespace `DemoSandbox` — the graph is the inventory, this
file is its printout. Regenerate rather than edit by hand.

## Contents

- Tours and their steps
- Every QA state and what it is

## Tours and their steps

### `admin-2fa` (ADMIN)

| #   | step         | route           | sim  | ring | reloads |
| --- | ------------ | --------------- | ---- | ---- | ------- |
| 0   | `login`      | `/auth/sign-in` | —    | yes  | —       |
| 1   | `first-code` | `/auth/sign-in` | totp | yes  | —       |
| 2   | `fresh-code` | `/auth/sign-in` | totp | yes  | —       |

### `admin-ops` (ADMIN)

| #   | step              | route                    | sim | ring      | reloads |
| --- | ----------------- | ------------------------ | --- | --------- | ------- |
| 0   | `admin-respond`   | `/support/admin/tickets` | —   | yes       | —       |
| 1   | `cascade-delete`  | `/collaborations/502`    | —   | yes       | —       |
| 2   | `cascade-confirm` | `/collaborations/502`    | —   | yes       | —       |
| 3   | `by-the-book`     | `/collaborations/list`   | —   | no target | —       |

### `company-campaign` (COMPANY)

| #   | step               | route                            | sim | ring      | reloads |
| --- | ------------------ | -------------------------------- | --- | --------- | ------- |
| 0   | `create-campaign`  | `/collaborations/create`         | —   | yes       | —       |
| 1   | `decide-applicant` | `/collaborations/501/applicants` | —   | yes       | —       |
| 2   | `lifecycle`        | `/collaborations/in-progress`    | —   | no target | —       |

### `influencer-collab` (INFLUENCER)

| #   | step       | route                                           | sim | ring      | reloads |
| --- | ---------- | ----------------------------------------------- | --- | --------- | ------- |
| 0   | `browse`   | `/collaborations/list`                          | —   | yes       | —       |
| 1   | `apply`    | `/collaborations/list`                          | —   | yes       | —       |
| 2   | `accepted` | `/collaborations/registrations?tab=in-progress` | —   | no target | —       |

### `nip-to-ksef` (COMPANY)

| #   | step                | route            | sim          | ring      | reloads |
| --- | ------------------- | ---------------- | ------------ | --------- | ------- |
| 0   | `nip-lookup`        | `/company/setup` | —            | yes       | —       |
| 1   | `company-confirmed` | `/company/setup` | —            | yes       | —       |
| 2   | `verify-mail`       | `/company/setup` | inbox-verify | yes       | —       |
| 3   | `activated`         | `/subscription`  | —            | no target | —       |
| 4   | `upgrade`           | `/subscription`  | —            | yes       | —       |
| 5   | `upgrade-confirm`   | `/subscription`  | —            | yes       | yes     |
| 6   | `invoice-sent`      | `/subscription`  | fakturownia  | yes       | —       |
| 7   | `ksef-done`         | `/subscription`  | ksef         | yes       | —       |

### `stepup-email` (COMPANY)

| #   | step           | route                    | sim        | ring      | reloads |
| --- | -------------- | ------------------------ | ---------- | --------- | ------- |
| 0   | `change-email` | `/user/settings/account` | —          | yes       | —       |
| 1   | `enter-code`   | `/user/settings/account` | inbox-code | yes       | —       |
| 2   | `saved`        | `/user/settings/account` | —          | no target | —       |

### `support-ticket` (COMPANY)

| #   | step             | route                         | sim | ring | reloads |
| --- | ---------------- | ----------------------------- | --- | ---- | ------- |
| 0   | `ticket-created` | `/support/tickets/create`     | —   | yes  | —       |
| 1   | `read-response`  | `/support/tickets/my-tickets` | —   | yes  | —       |

## Every QA state

`#armed` = ring on its control · `#sim` = a world simulator open ·
`#dialog` / `#resumed` = the checkout's two halves · `recap` = the end card.

| state                                     | kind      | what                                                                     |
| ----------------------------------------- | --------- | ------------------------------------------------------------------------ |
| `admin-2fa/recap`                         | recap     | The recap screen at the end of the tour                                  |
| `admin-ops/recap`                         | recap     | The recap screen at the end of the tour                                  |
| `company-campaign/recap`                  | recap     | The recap screen at the end of the tour                                  |
| `influencer-collab/recap`                 | recap     | The recap screen at the end of the tour                                  |
| `nip-to-ksef/recap`                       | recap     | The recap screen at the end of the tour                                  |
| `stepup-email/recap`                      | recap     | The recap screen at the end of the tour                                  |
| `support-ticket/recap`                    | recap     | The recap screen at the end of the tour                                  |
| `admin-2fa/first-code#sim`                | sim       | World simulator open (totp)                                              |
| `admin-2fa/fresh-code#sim`                | sim       | World simulator open (totp)                                              |
| `nip-to-ksef/invoice-sent#sim`            | sim       | World simulator open (fakturownia)                                       |
| `nip-to-ksef/ksef-done#sim`               | sim       | World simulator open (ksef)                                              |
| `nip-to-ksef/verify-mail#sim`             | sim       | World simulator open (inbox-verify)                                      |
| `stepup-email/enter-code#sim`             | sim       | World simulator open (inbox-code)                                        |
| `nip-to-ksef/upgrade#dialog`              | special   | Checkout dialog open over its own button                                 |
| `nip-to-ksef/upgrade#resumed`             | special   | After the full reload, resumed on the next beat                          |
| `nip-to-ksef/upgrade-confirm#dialog`      | special   | The checkout dialog resting open, waiting for the visitor's second press |
| `nip-to-ksef/upgrade-confirm#resumed`     | special   | After the full reload, resumed on the invoice beat                       |
| `story-beat-agreement_planning`           | story     | Beat 4                                                                   |
| `story-beat-campaign_created`             | story     | Beat 1                                                                   |
| `story-beat-content_approval`             | story     | Beat 6                                                                   |
| `story-beat-content_creation`             | story     | Beat 5                                                                   |
| `story-beat-influencer_application`       | story     | Beat 2                                                                   |
| `story-beat-publication_results`          | story     | Beat 7                                                                   |
| `story-beat-review_selection`             | story     | Beat 3                                                                   |
| `story-finale`                            | story     | The success panel                                                        |
| `story-overview`                          | story     | The tableau before the presentation starts                               |
| `story-paused`                            | story     | Paused mid-run by the autoplay toggle                                    |
| `admin-2fa/first-code#armed`              | tour-step | Armed: ring on the control, panel narrating                              |
| `admin-2fa/fresh-code#armed`              | tour-step | Armed: ring on the control, panel narrating                              |
| `admin-2fa/login#armed`                   | tour-step | Armed: ring on the control, panel narrating                              |
| `admin-ops/admin-respond#armed`           | tour-step | Armed: ring on the control, panel narrating                              |
| `admin-ops/by-the-book#armed`             | tour-step | No target: the panel carries the way forward                             |
| `admin-ops/cascade-delete#armed`          | tour-step | Armed: ring on the delete control; the preview dialog opens and waits    |
| `admin-ops/cascade-confirm#armed`         | tour-step | Armed: ring on Confirm, with the breakdown of what will be destroyed     |
| `company-campaign/create-campaign#armed`  | tour-step | Armed: ring on the control, panel narrating                              |
| `company-campaign/decide-applicant#armed` | tour-step | Armed: ring on the control, panel narrating                              |
| `company-campaign/lifecycle#armed`        | tour-step | No target: the panel carries the way forward                             |
| `influencer-collab/accepted#armed`        | tour-step | No target: the panel carries the way forward                             |
| `influencer-collab/apply#armed`           | tour-step | Armed: ring on the control, panel narrating                              |
| `influencer-collab/browse#armed`          | tour-step | Armed: ring on the control, panel narrating                              |
| `nip-to-ksef/activated#armed`             | tour-step | No target: the panel carries the way forward                             |
| `nip-to-ksef/company-confirmed#armed`     | tour-step | Armed: ring on the control, panel narrating                              |
| `nip-to-ksef/invoice-sent#armed`          | tour-step | Armed: ring on the control, panel narrating                              |
| `nip-to-ksef/ksef-done#armed`             | tour-step | Armed: ring on the control, panel narrating                              |
| `nip-to-ksef/nip-lookup#armed`            | tour-step | Armed: ring on the control, panel narrating                              |
| `nip-to-ksef/upgrade#armed`               | tour-step | Armed: ring on the control, panel narrating                              |
| `nip-to-ksef/upgrade-confirm#armed`       | tour-step | Armed: ring on the checkout's confirm button while the dialog stays open |
| `nip-to-ksef/verify-mail#armed`           | tour-step | Armed: ring on the control, panel narrating                              |
| `stepup-email/change-email#armed`         | tour-step | Armed: ring on the control, panel narrating                              |
| `stepup-email/enter-code#armed`           | tour-step | Armed: ring on the control, panel narrating                              |
| `stepup-email/saved#armed`                | tour-step | No target: the panel carries the way forward                             |
| `support-ticket/read-response#armed`      | tour-step | Armed: ring on the control, panel narrating                              |
| `support-ticket/ticket-created#armed`     | tour-step | Armed: ring on the control, panel narrating                              |
