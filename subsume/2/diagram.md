```mermaid
flowchart LR
  subgraph n0["guide-hint"]
    direction LR
    n1["E-PROMISE — what the guide may promise about a…"]:::demoted
    n2["E-PROMISE — what the guide may promise about a…"]
    n1 -- "26 probes · 7 kills" --> n2
    n3["E-PROMISE — what the guide may promise about a…"]:::demoted
    n3 -- "26 probes · 7 kills" --> n2
    n4["E-PROMISE — what the guide may promise about a…"]:::demoted
    n4 -- "26 probes · 7 kills" --> n2
    n5["E-PROMISE — what the guide may promise about a…"]:::demoted
    n5 -- "26 probes · 7 kills" --> n2
    n6["… 35 more"]:::demoted
  end
  subgraph n7["sandbox-director.service"]
    direction LR
    n8["SandboxDirectorService a full load on an app ro…"]:::demoted
    n9["SandboxDirectorService a full load on the landi…"]
    n8 -- "70 probes · 19 kills" --> n9
    n10["SandboxDirectorService a tour ends when the vis…"]:::demoted
    n11["SandboxDirectorService a tour ends when the vis…"]
    n10 -- "181 probes · 40 kills" --> n11
    n12["SandboxDirectorService advance() walks every st…"]:::demoted
    n13["SandboxDirectorService next() — #quot;Dalej#quot; perform…"]
    n12 -- "195 probes · 40 kills" --> n13
    n14["SandboxDirectorService next() — #quot;Dalej#quot; perform…"]:::demoted
    n15["SandboxDirectorService next() — #quot;Dalej#quot; perform…"]
    n14 -- "244 probes · 67 kills" --> n15
    n16["… 13 more"]:::demoted
  end
  subgraph n17["error.interceptor"]
    direction LR
    n18["errorInterceptor on 401 from /auth/refresh-sess…"]:::demoted
    n19["errorInterceptor on 401 from /auth/firebase/log…"]
    n18 -- "24 probes · 7 kills" --> n19
    n20["errorInterceptor on 401 from /support/ticket/ac…"]:::demoted
    n20 -- "24 probes · 10 kills" --> n19
    n21["errorInterceptor on 401 from a /assets/ static…"]:::demoted
    n21 -- "24 probes · 11 kills" --> n19
    n22["errorInterceptor on 419 from /auth/refresh-sess…"]:::demoted
    n22 -- "24 probes · 7 kills" --> n19
    n23["… 4 more"]:::demoted
  end
  subgraph n24["shell-status.service"]
    direction LR
    n25["ShellStatusService clearConsent / clearEmailVer…"]:::demoted
    n25 -- "27 probes · 8 kills" --> n26
    n27["ShellStatusService initial state starts with no…"]:::demoted
    n28["ShellStatusService trialOffer the nudge is not…"]
    n27 -- "22 probes · 8 kills" --> n28
    n29["ShellStatusService noteResponseHeaders does not…"]:::demoted
    n29 -- "21 probes · 6 kills" --> n30
    n31["ShellStatusService noteResponseHeaders does not…"]:::demoted
    n31 -- "21 probes · 3 kills" --> n30
    n32["… 4 more"]:::demoted
  end
  subgraph n33["demo-fixtures"]
    direction LR
    n34["demo fixtures answers /subscription/status with…"]:::demoted
    n35["demo fixtures plays the whole upgrade beat — co…"]
    n34 -- "56 probes · 15 kills" --> n35
    n36["demo fixtures answers /users/me with null while…"]:::demoted
    n37["demo fixtures sign-up takes the role from the f…"]
    n36 -- "54 probes · 9 kills" --> n37
    n38["demo fixtures company accept/decline round-trip…"]:::demoted
    n39["demo fixtures company accept/decline round-trip…"]
    n38 -- "99 probes · 40 kills" --> n39
    n40["demo fixtures pages campaigns through the share…"]:::demoted
    n40 -- "55 probes · 13 kills" --> n41
    n42["… 3 more"]:::demoted
  end
  subgraph n43["step-up-context"]
    direction LR
    n44["step-up-context helpers withStepUpToken() accep…"]:::demoted
    n44 -- "2 probes · 1 kills" --> n45
    n46["step-up-context helpers withStepUpToken() prese…"]:::demoted
    n46 -- "2 probes · 1 kills" --> n45
    n47["step-up-context helpers withStepUpToken() retur…"]:::demoted
    n47 -- "2 probes · 1 kills" --> n45
    n48["step-up-context helpers withStepUpToken() retur…"]:::demoted
    n48 -- "2 probes · 1 kills" --> n45
  end
  n26["shell-banners.component :: ShellBannersComponen…"]
  n30["shell-headers.interceptor :: shellHeadersInterc…"]
  n41["demo-fixtures.account :: demo fixtures — accoun…"]
  n45["step-up.interceptor :: stepUpInterceptor does n…"]
  classDef demoted stroke-dasharray: 4 3
```

| Class | Demoted | Carried by |
| --- | --- | --- |
| `theme.service` | 4 | 4 tests |
| `consent.service` | 3 | 5 tests |
| `seo-title.strategy` | 3 | 2 tests |
| `rate-limit-cache.interceptor` | 3 | 3 tests |
| `set-to-array.interceptor` | 3 | 1 tests |
| `shell-headers.interceptor` | 3 | 3 tests |
| `step-up.interceptor` | 3 | 1 tests |
| `applied-opportunity.service` | 2 | 3 tests |
| `auth.guards` | 2 | 3 tests |
| `social-platform-config.service` | 2 | 1 tests |
| `transloco-loader` | 2 | 1 tests |
| `opportunity.service` | 2 | 1 tests |
| `rate-limit-state.service` | 2 | 3 tests |
| `user.service` | 2 | 1 tests |
| `process-map` | 1 | 1 tests |
| `address.service` | 1 | 1 tests |
| `cascade-delete.service` | 1 | 1 tests |
| `location-redirect.service` | 1 | 1 tests |
| `sandbox-auth.service` | 1 | 1 tests |
| `demo-fixtures.account` | 1 | 1 tests |
| `localized-date.pipe` | 1 | 1 tests |
| `paginator-intl` | 1 | 2 tests |
| `language.interceptor` | 1 | 1 tests |
| `legal-api.service` | 1 | 1 tests |
| `preferences.service` | 1 | 1 tests |
| `registry.service` | 1 | 1 tests |
| `step-up.service` | 1 | 1 tests |
| `upload.service` | 1 | 2 tests |
| `demo-export-zip` | 1 | 1 tests |
