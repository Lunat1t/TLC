# Trial lesson request

## Overview

Builds a WhatsApp message for a trial lesson request in Russian or Kazakh.

## Interface

- `TrialPage` at `/trial` collects the student's name, age, courses and desired date, then builds a `wa.me` link containing the message. `page.tsx:TrialPage`

## Invariants

- Requires a trimmed name of at least two characters, an age from 4 through 18, at least one course and a selected date. The calendar disables past dates and dates outside the displayed month. `page.tsx:TrialPage`

## Side Effects

- Reads `tlc.site-language` from local storage. Following the final link opens WhatsApp with the prepared message for the user to send. `page.tsx:TrialPage`

## Verification

Run `npm test` from the repository root.
