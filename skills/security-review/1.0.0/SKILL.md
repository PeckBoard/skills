---
name: security-review
description: Review code changes for common security flaws (injection, authz gaps, secrets, unsafe deserialization, SSRF) and report exploitable findings.
version: 1.0.0
tags: [security, review]
groups: [pr-review]
---

# Security Review

Use this when asked for a security review of a diff, a pull request, or a
module. Focus on flaws an attacker could actually reach; skip theoretical
issues with no path from untrusted input.

## 1. Map the Trust Boundaries

List where untrusted data enters the changed code: HTTP parameters,
headers, cookies, uploaded files, message queues, environment the user
controls, data read back from a database that users write to, and
responses from third-party services. Every check below starts from one
of these entry points.

## 2. Check Each Class of Flaw

- **Injection** — SQL, shell, template, LDAP, XPath, and log injection.
  Is untrusted data ever concatenated into a query or command instead of
  passed as a parameter or argv element?
- **Authentication and authorization** — Does every new route or action
  check *who* the caller is and *whether* they may touch *this* object
  (not just any object of that type)? Look for IDs taken from the
  request and used without an ownership check.
- **Secrets** — Credentials, tokens, or keys committed in code, tests,
  fixtures, or logs. Secrets echoed in error messages.
- **Path traversal** — File paths built from user input without
  normalizing and confirming they stay inside the intended directory.
- **SSRF** — Server-side fetches of user-supplied URLs without an
  allowlist; watch for redirects and DNS rebinding to private ranges.
- **Deserialization** — Native object deserialization (pickle, Java
  serialization, YAML with object tags) of untrusted bytes.
- **Cross-site scripting** — User data rendered as HTML without
  escaping; `innerHTML`, `dangerouslySetInnerHTML`, `v-html`.
- **CSRF** — State-changing requests authenticated by cookies without a
  token or same-site protection.
- **Crypto misuse** — Home-made crypto, ECB mode, static IVs, MD5/SHA-1
  for passwords, non-constant-time comparison of secrets.
- **Resource exhaustion** — Unbounded uploads, regexes with catastrophic
  backtracking, loops driven by user-controlled counts.

## 3. Report

For each finding give:

```
[critical|high|medium|low] path:LINE — flaw class
  Attack: who sends what, and what they gain
  Fix: the specific change (parameterize, add ownership check, ...)
```

Only report findings with a concrete attack path. If the change has no
security-relevant surface, say so in one line.
