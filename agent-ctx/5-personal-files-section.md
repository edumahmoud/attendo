# Task 5: PersonalFilesSection Multi-file Upload + Subject Linking

## Summary
Updated PersonalFilesSection component to support multi-file upload with custom naming per file and optional subject linking.

## File Changed
- `/home/z/my-project/src/components/shared/personal-files-section.tsx` — Complete rewrite

## Key Changes

### 1. Multi-file upload
- Hidden `<input>` now has `multiple` attribute
- State changed from `uploadFile: File | null` + `uploadName: string` to `uploadItems: UploadItem[]`
- Each UploadItem tracks: file, customName, originalExtension, status, progress, errorMessage

### 2. Custom naming per file
- `splitFileName()` helper extracts name-without-extension and extension
- Each file gets its own name input pre-filled with original name (without extension)
- Upload sends `customName.originalExtension` as the file name

### 3. Subject linking
- Fetched subjects on mount based on user role (teacher: owned subjects, student: enrolled subjects)
- Subject selector dropdown using shadcn/ui Select component
- Optional — "بدون مقرر" is the default
- subjectId sent in FormData when a subject is selected

### 4. Upload dialog redesign
- Always-visible "add files" area
- Scrollable file list (max-h-60) with per-file cards showing: status icon, original name, size, custom name input, extension, progress, remove button
- Card color changes by status (pending/uploading/done/error)
- Shared fields: visibility, subject, description, notes
- Upload button: "رفع N ملفات"

### 5. Sequential upload with progress
- Files uploaded one at a time
- Per-file XHR progress tracking
- Overall progress: "(2/5 ملفات)"
- Summary toast after all uploads
- Auto-close on full success

### 6. Subject badge in file cards
- Teal badge with BookOpen icon shows subject name
- Also shown in preview dialog metadata

## Lint
- 0 errors (2 pre-existing warnings in unrelated files)

## API
- No API changes needed — `/api/user-files` already accepts `subjectId` in FormData
