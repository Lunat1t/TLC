# Account onboarding

## Overview

Runs the Russian or Kazakh registration and profile completion flow.

## Interface

- `RegisterPage` at `/register` collects role, identity and password, plus age and selected disciplines for students and teachers. `page.tsx:RegisterPage`
- `next` advances validated steps and either signs up through `registerStudentWithSupabase` or finishes onboarding for an existing authenticated user. `page.tsx:next`

## Invariants

- Supports `student`, `teacher` and `parent`. Parents skip the courses and age steps and go to `/settings` after success. Students and teachers go to `/dashboard`. Names and passwords go through the credential validators, and a supplied age must be 1–120. `page.tsx:RegisterPage`, `page.tsx:next`

## Side Effects

- Updates Supabase Auth and calls `complete_tlc_onboarding` for an existing session, or invokes the signup helper for a new account. Saves `tlc.learning-interests` for students and teachers and can stage a student token in session storage. `page.tsx:RegisterPage`, `page.tsx:next`

## Verification

Run `npm test` from the repository root.
