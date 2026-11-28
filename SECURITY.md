# Security policy

## Reporting a vulnerability

Use the private GitHub Security Advisory form at [Report a vulnerability](https://github.com/draarivpatel-ui/fusering-compass/security/advisories/new). Do not open a public issue, pull request or discussion with exploit details.

Never include a live secret, token, cookie, private key, victim hostname or proprietary payload in a report. Use synthetic values and redacted transcripts.

## Supported versions

| Version | Status |
| --- | --- |
| latest `main` | Supported |

Security fixes are applied to the latest state of the default branch.

## Scope

This policy covers the static FuseRing Compass browser inspector, the design-for-manufacture lab, model geometry processing, digest-checked exports, bookmark links, bundled viewer assets and the CAD generation scripts in this repository.

In scope:

- A cross-site scripting or HTML injection path through model data, lab state, bookmark input, verification input, rendered charts or exported reports.
- A digest, canonicalization or bookmark-decoding flaw that causes corrupted or attacker-controlled state to be presented as verified.
- A CSV, JSON or Markdown export flaw that makes generated output execute a formula or script when opened.
- A CAD generation or inspection script flaw that writes outside the requested output path or executes attacker-controlled input as code.

Out of scope:

- Manufacturing advice, material certification, structural use of a printed or machined keyring, and third-party CAD or slicing software.
- Browser vulnerabilities, operating system compromise or physical access to the machine.
- The documented approximate geometry and stress model, unless a report shows a specific validation or output integrity failure.

## Coordinated disclosure

- Acknowledgment: within 3 business days.
- Initial triage: within 14 calendar days.
- Fix or mitigation target: within 90 calendar days for confirmed reports.
- Coordinated public disclosure: up to 90 days by default, adjusted by mutual agreement when exploitation or user risk requires a different date.
