# Task 2-a: Display user titles next to names using formatNameWithTitle

## Summary
Updated 4 files to display academic titles (e.g., "دكتور", "أستاذة") next to teacher names using the `formatNameWithTitle` utility function.

## Files Modified
1. **notes-tab.tsx** - Import, updated Supabase query to include title_id/gender/role, applied formatNameWithTitle when building author_name
2. **files-tab.tsx** - Import, updated Supabase query to include title_id/gender/role, applied formatNameWithTitle when building uploader_name
3. **lectures-tab.tsx** - Import, updated Supabase query in handleExpandLecture to include title_id/gender/role, applied formatNameWithTitle when building author_name
4. **course-page.tsx** - Import, updated teacher fetch query to include title_id/gender/role, applied formatNameWithTitle when setting teacherName

## Approach
- Title formatting is applied at the data-fetch/map-building level, not at render time
- This ensures consistency: the `author_name` and `uploader_name` fields already contain the formatted name
- Only teachers get title prefixes; students are unaffected (formatNameWithTitle checks role === 'teacher')

## Lint & Build
- All lint checks pass with 0 errors
- Dev server compiles and runs correctly
