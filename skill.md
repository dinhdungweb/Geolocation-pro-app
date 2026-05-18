---
name: design-system-edmin
description: Creates implementation-ready design-system guidance with tokens, component behavior, and accessibility standards. Use when creating or updating UI rules, component specifications, or design-system documentation.
---

<!-- TYPEUI_SH_MANAGED_START -->

# Edmin

## Mission
Deliver implementation-ready design-system guidance for Edmin that can be applied consistently across dashboard web app interfaces.

## Brand
- Product/brand: Edmin
- URL: https://angular.pixelstrap.net/edmin/dashboard/default
- Audience: authenticated users and operators
- Product surface: dashboard web app

## Style Foundations
- Visual style: structured, accessible, implementation-first
- Main font style: `font.family.primary=Outfit`, `font.family.stack=Outfit, sans-serif`, `font.size.base=14px`, `font.weight.base=400`, `font.lineHeight.base=21px`
- Typography scale: `font.size.xs=12px`, `font.size.sm=13px`, `font.size.md=14px`, `font.size.lg=15px`, `font.size.xl=16px`, `font.size.2xl=20px`, `font.size.3xl=22px`, `font.size.4xl=26px`
- Color palette: `color.text.primary=#3d3d47`, `color.border.muted=#43b9b2`, `color.text.tertiary=#767676`, `color.surface.base=#000000`, `color.surface.muted=#f4f5f8`, `color.surface.strong=#ffffff`
- Spacing scale: `space.1=1px`, `space.2=2px`, `space.3=3px`, `space.4=3.5px`, `space.5=3.75px`, `space.6=4px`, `space.7=4.2px`, `space.8=5px`
- Radius/shadow/motion tokens: `radius.xs=3.5px`, `radius.sm=3.75px`, `radius.md=5px`, `radius.lg=6px`, `radius.xl=10px`, `radius.2xl=50px`, `radius.step7=60px`, `radius.step8=100px` | `shadow.1=rgba(0, 0, 0, 0.1) 0px 36px 35px 0px`, `shadow.2=rgba(10, 75, 85, 0.05) 0px 4px 34px 0px` | `motion.duration.instant=300ms`, `motion.duration.fast=500ms`, `motion.duration.normal=1000ms`

## Accessibility
- Target: WCAG 2.2 AA
- Keyboard-first interactions required.
- Focus-visible rules required.
- Contrast constraints required.

## Writing Tone
concise, confident, implementation-focused

## Rules: Do
- Use semantic tokens, not raw hex values in component guidance.
- Every component must define required states: default, hover, focus-visible, active, disabled, loading, error.
- Responsive behavior and edge-case handling should be specified for every component family.
- Accessibility acceptance criteria must be testable in implementation.

## Rules: Don't
- Do not allow low-contrast text or hidden focus indicators.
- Do not introduce one-off spacing or typography exceptions.
- Do not use ambiguous labels or non-descriptive actions.

## Guideline Authoring Workflow
1. Restate design intent in one sentence.
2. Define foundations and tokens.
3. Define component anatomy, variants, and interactions.
4. Add accessibility acceptance criteria.
5. Add anti-patterns and migration notes.
6. End with QA checklist.

## Required Output Structure
- Context and goals
- Design tokens and foundations
- Component-level rules (anatomy, variants, states, responsive behavior)
- Accessibility requirements and testable acceptance criteria
- Content and tone standards with examples
- Anti-patterns and prohibited implementations
- QA checklist

## Component Rule Expectations
- Include keyboard, pointer, and touch behavior.
- Include spacing and typography token requirements.
- Include long-content, overflow, and empty-state handling.

## Quality Gates
- Every non-negotiable rule must use "must".
- Every recommendation should use "should".
- Every accessibility rule must be testable in implementation.
- Prefer system consistency over local visual exceptions.

<!-- TYPEUI_SH_MANAGED_END -->
