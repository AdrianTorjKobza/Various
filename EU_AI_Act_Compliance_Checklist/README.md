# EU AI Act Compliance Checklist

An interactive HTML checklist covering all risk tiers of the **EU AI Act (Regulation 2024/1689)**. No dependencies, just open the `compliance_checklist_extended.html` file in a browser.

---

## What is the EU AI Act?

The EU AI Act is the world's first comprehensive AI regulation. It applies to any organisation that builds, deploys, imports, or distributes AI systems in the EU (or whose AI outputs affect people in the EU), regardless of where the organisation is based.

This checklist helps developers, legal teams, and executives work through their obligations in plain language, track progress with a live compliance score, and export a summary report for stakeholders.

## Features

- **Live compliance score** (0–100%) with a progress ring that updates as you tick items
- **8 sections, 43 checklist items** covering all risk tiers and roles
- **Audience filter** - toggle between Developer, Legal, and Executive views
- **N/A toggle** on every item - marks it out of scope without affecting your score
- **Per-section progress bars** so you can see where the gaps are at a glance
- **Progress saved to localStorage** - survives page refreshes
- **Copy summary report** - one click to copy a plain-text snapshot of your status
- **Print / Save as PDF** - clean print stylesheet hides interactive controls
- **Links to official documentation** - EUR-Lex full text and EC AI Policy Hub
- **Single HTML file** - no npm, no bundler, no server required

---

## Getting started

1. Download `eu-ai-act-checklist.html` from this repository
2. Open it in any modern browser (Chrome, Firefox, Safari, Edge)
3. Start ticking items; your progress is saved automatically in your browser

---

## Key EU AI Act dates

| Date | What happens |
|------|-------------|
| **1 Aug 2024** | Act enters into force |
| **2 Feb 2025** | Prohibited AI practices banned |
| **2 Aug 2025** | GPAI model obligations apply; governance rules apply |
| **2 Aug 2026** | High-risk system requirements fully enforced |
| **2 Aug 2027** | High-risk systems in regulated sectors (Annex I) must comply |

---

## Who should use this

| Role | How to use it |
|------|--------------|
| **Developers** | Filter to the Developer view to see technical build requirements: data governance, logging, robustness, documentation |
| **Legal teams** | Filter to the Legal view to track conformity assessments, registrations, and reporting obligations |
| **Executives** | Filter to the Executive view to understand strategic obligations: risk classification, governance, incident reporting |
| **All** | Use the default All view for a complete picture before assigning ownership of individual items |

---

## Risk tiers at a glance

```
🚫  Unacceptable risk  →  Prohibited outright (e.g. social scoring, live biometric ID in public)
⚠️  High risk          →  Heavy obligations: risk mgmt, documentation, conformity, registration
ℹ️  Limited risk       →  Transparency only: disclose AI to users, label synthetic content
✅  Minimal risk       →  No specific obligations; voluntary codes of conduct encouraged
🔷  GPAI models        →  Separate track: documentation, training data summary, copyright policy
```

---

## Official documentation

- [EU AI Act full text — EUR-Lex](https://eur-lex.europa.eu/legal-content/EN/TXT/?uri=CELEX:32024R1689)
- [European Commission AI Policy Hub](https://digital-strategy.ec.europa.eu/en/policies/regulatory-framework-ai)
- [EU AI Act implementation timeline](https://artificialintelligenceact.eu/implementation-timeline/)
- [EU AI Office](https://digital-strategy.ec.europa.eu/en/policies/ai-office)

---

## License

MIT — free to use, adapt, and distribute with attribution.
