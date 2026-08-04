---
name: ui-design-system
description: The AI Escort visual and interaction system — "field notebook" concept, color and type tokens, the status system, map markers, mobile field-mode rules, responsive breakpoints, accessibility, and Thai copy guidelines. Use when building or reviewing any screen, component, status indicator, map marker, empty/loading/error state, or user-facing Thai string, and when deciding layout for mobile, tablet, or teacher desktop.
---

# UI and design system

Source: `design/AI Escort - Design Brief.dc.html`, `CLAUDE.md` (design brief), hi-fi and form deliverables in `design/`.

## Concept — "สมุดบันทึกภาคสนาม" (field notebook)

Clean white paper surfaces on a soft green-grey canvas. Structure carries on **1px borders, not shadows** — readable in sunlight, fast on mid-range Android. Forest green marks *actions and brand identity only*; it is never the single status color for everything.

## Tokens

```text
forest #1F6B47   forest deep #14472F   forest tint #E7F0EA
ink #16211C      ink2 #4E5F56          line #DCE4DD
canvas #F3F6F2   surface #FFFFFF
```

Type — IBM Plex Sans Thai (all UI), IBM Plex Serif **Italic** (scientific names), IBM Plex Mono (coordinates, class codes, time, GPS accuracy).

```text
display 28/34·700   title 20/28·600   subtitle 17/26·600
body 15/24·400 (field 16)   label 13/18·500   caption 12/16·400
mono 12/16   sci 15/22 serif italic
```

Spacing base 4 (4·8·12·16·20·24·32·40·56), mobile gutter 16.
Radius — chip 999 · button/input 10 · card 12 · bottom sheet 20 (top only) · image 8.
Elevation — e0 1px border · e1 `0 1px 2px rgba(22,33,28,.08)` · e2 sheet `0 -4px 20px rgba(22,33,28,.14)`.

## Status system — color is never alone

Every status carries **color + shape + icon + Thai text**.

| Key | Thai | Color | Glyph | Shape |
|---|---|---|---|---|
| submitted | ส่งแล้ว · รอตรวจ | `#A15C07` | ↑ | circle |
| revision_required | ต้องแก้ไข | `#B3261E` | ! | square/triangle |
| resubmitted | ส่งใหม่แล้ว | `#1B4FA0` | ↻ | ringed circle |
| verified | ครูรับรองแล้ว | `#15803D` | ✓ | thick rounded hex |
| unable_to_verify | ตรวจสอบไม่ได้ | `#5B34A8` | ? | teardrop |
| rejected | ไม่ผ่าน | `#55605A` | × | filled square |

Group statuses (`forming · ready · approved · locked · archived`) and session-group statuses (`waiting · ready · active · paused · completed`) **each require their own colour + shape + icon + Thai text tokens** (D-053). Defining them is outstanding design work — do not invent them ad hoc per screen, and do not reuse an observation token for a non-observation meaning.

**One meaning per colour.** `#A15C07` means `submitted · รอตรวจ` and nothing else. Reusing a status colour as an identity or selection cue breaks the system.

## Map markers must carry shape, not just fill

Every plant pin currently renders as one teardrop separated only by fill colour. Put the `statusTokens` glyph inside the pin head (12–14px, white on fill) and vary the head shape per the token's `radius`. Legends show shape + glyph, never a bare colour swatch. Green/amber/red is the hardest triad for deuteranopia and protanopia, and this is the screen both roles use to read the whole activity's outcome.

## Measured minimums — enforce these, they are already decided

| Context | Rule |
|---|---|
| Any UI text | ≥ 12px; field mode ≥ 13px |
| Field-mode chips (GPS, sync, timer) | ≥ 13px on `#14472F` (white ≈ 9.6:1) |
| Secondary text token | `#5E6D64` (≈5.1:1), never `#7C8B83` (3.6:1, fails AA) |
| Touch target | ≥ 44px; field mode 56px |
| Disabled control | Must stay legible — it carries the reason. Never ~2:1 |
| Focus | A `focus-visible` token is required and currently undefined |

## Field mode rules

Field mode is a **separate navigation shell** that replaces the bottom nav with three targets: แผนที่ · เพิ่มการสังเกต · รายการของฉัน. Exit is explicit.

- Base font +1px, primary button 56px (44px minimum elsewhere).
- Text contrast ≥ 7:1. No gradients under text.
- Primary action always inside the bottom 25%.
- Persistent top status strip: GPS · sync · offline.
- Motion ≤ 180 ms, disabled under `prefers-reduced-motion`.

## Map

- Plant markers use **capture location**, always. Teardrop, tip on the coordinate.
- Active students: ringed circle. Stale position (>30 s): dashed + "อัปเดต N นาทีที่แล้ว".
- Cluster when markers overlap within 40px. Checkpoints are squares.
- Controls bottom-right, 48px, thumb reach.
- **Every map has an equivalent list view.** Map load failure falls back to the list automatically.
- Tap marker → bottom sheet at 40% (map stays visible) → drag to 90%. Desktop: map 60% left / detail 40% right, no page change.

## Responsive

| Width | Behavior |
|---|---|
| 360–430 | Single column, bottom nav, bottom sheets, full-width bottom-anchored primary, **no tables** |
| 600–768 | Max 560px centered, 2-column card lists, sheets become 480px panels |
| ≥1024 (teacher) | 240px side nav, 60/40 map+detail split, review queue with preview pane, member tables |

Students on large screens get a wider layout, never a different flow — field mode stays single-column, max 480px.

## Accessibility

Text and icon in addition to color; visible focus states; keyboard navigation on teacher desktop; no critical information hidden in tooltips; icons that carry status always paired with Thai text; no icon-only button for an important action; scientific names in italic serif, distinct but legible.

## Thai copy rules

- Buttons are short verbs, 1–3 words: "ถ่ายภาพ", "ส่งการสังเกต", "ขอให้แก้ไข".
- Address the user as "คุณ" or drop the subject. Never "ท่าน".
- Errors state **cause + way out**.
- No jargon: "สัญญาณตำแหน่งอ่อน", not "GPS accuracy ต่ำ".
- Warnings never blame: "เพื่อนบันทึกพืชชนิดนี้แล้ว — คุณบันทึกต้นของคุณต่อได้เลย".
- AI is always "ผลวิเคราะห์ชั่วคราว" — never a bare "ผลลัพธ์". AI output renders in a dashed frame with an `AI` tag, never in a teacher-verified color.
- Consistent vocabulary: ชั้นเรียน · กลุ่ม · หัวหน้ากลุ่ม · กิจกรรม · รอบสำรวจ · การสังเกต · หลักฐานภาพ.

## Irreversible actions

Delete group, reject, complete session, move leader → confirmation dialog that summarizes **who is affected**, with a button labelled with the real verb, never "ตกลง". Disabled controls always show the reason underneath — never hide a control that the user expects to be there.
