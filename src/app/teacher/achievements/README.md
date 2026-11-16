# Teacher achievement page

## Overview

Lets authorized teachers create competition or event achievements and award them to students. Administrators can also use the retained Mix and Match award flow.

## Interface

- `TeacherAchievementsPage` at `/teacher/achievements` renders award controls. Administrators use `StudentAwardsAdmin` to create and issue event achievements; the retained Mix and Match form uses `search_students_for_mix_match_award` and `award_mix_match_achievement`. `page.tsx:TeacherAchievementsPage`, `student-awards-admin.tsx:StudentAwardsAdmin`, `page.tsx:search`, `page.tsx:award`

## Invariants

- The page accepts a teacher role or instruction administrator. Achievement search requires at least two trimmed characters; each student can receive a given achievement only once. `page.tsx:TeacherAchievementsPage`, `student-awards-admin.tsx:StudentAwardsAdmin`

## Side Effects

- Calls the achievement search, creation, and award RPCs. Mix and Match retains its separate confirmation and award flow. `student-awards-admin.tsx`, `page.tsx:search`, `page.tsx:award`

## Verification

Run `npm test` from the repository root.
