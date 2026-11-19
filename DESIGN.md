# Design — FluentUp

UI and copy rules for the mobile app. Code lives in `apps/mobile`.

## Principles

- **Clear path:** the learner always sees their level and the next step.
- **Short sessions:** one lesson, one flashcard round or one practice task fits in a few minutes.
- **Explain in the learner's language:** grammar explanations in Bengali or English, chosen at onboarding and changeable in Profile.
- **Works offline:** never block learning on the network. Show sync state quietly.

## Navigation

```
onboarding (placement test, language choice)
  └─ auth (email + password, or continue)
       └─ tabs
            ├─ Home      (index)   daily goal, streak, continue lesson
            ├─ Learn               lessons by CEFR level
            ├─ Practice            AI tutor, grammar checker, Speaking Lab, Listening Studio, IELTS
            ├─ Progress            XP, streak, mistakes, level progress
            └─ Profile             theme, explanation language, legal, sign out, delete account
stack screens: lesson/[id], legal
```

## Color tokens

Screens get colors from `useThemePalette()` (`src/theme/colors.ts`). **Never hard-code hex values in screens.**

| Token | Light | Dark | Use |
|---|---|---|---|
| `background` | `#F8FAFC` | `#0B1120` | Screen background |
| `surface` | `#FFFFFF` | `#1E293B` | Cards, sheets |
| `surfaceAlt` | `#F1F5F9` | `#334155` | Inputs, secondary cards |
| `border` | `#E2E8F0` | `#334155` | Dividers, outlines |
| `textPrimary` | `#0F172A` | `#F8FAFC` | Body and headings |
| `textSecondary` | `#475569` | `#CBD5E1` | Hints, captions |
| `primary` | `#2563EB` | `#3B82F6` | Main actions, active tab |
| `primarySoft` | `#DBEAFE` | `#1E3A8A` | Selected chips, highlights |
| `accent` | `#0D9488` | `#14B8A6` | XP, streak, secondary emphasis |
| `success` | `#15803D` | `#22C55E` | Correct answers, passed |
| `warning` | `#B45309` | `#F59E0B` | Due cards, offline notice |
| `danger` | `#DC2626` | `#EF4444` | Wrong answers, destructive actions |

Light and dark mode are both first-class. Theme follows the system by default; the user can override it in Profile.

## Copy

- User-facing strings are **bilingual**: English plus Bengali. Explanations follow the learner's chosen language; UI labels show English with Bengali where space allows.
- Use plain, encouraging language. Say what went wrong and what to try next. No blame ("Not quite — the verb needs -s here").
- Errors tell the truth: if sync or account deletion fails, say so and offer a retry. Never show success for a failed action.

## Accessibility

- Text and icon contrast meets WCAG AA (4.5:1 for body text) in both themes.
- Touch targets at least 44×44 pt (48×48 dp on Android).
- Every icon-only button has an `accessibilityLabel`; answer options expose selected/correct state to screen readers.
- Don't use color alone for right/wrong; pair it with an icon or text.
- Support system font scaling without clipping.
