# Task: PersonalFilesSection Component

## Summary
Created the `PersonalFilesSection` component and its supporting backend API routes for the Examy educational platform.

## Files Created

### Frontend
- **`/src/components/shared/personal-files-section.tsx`** — Main component with all features

### Backend API Routes
- **`/src/app/api/user-files/route.ts`** — GET (list files by type), POST (upload with storage), DELETE (remove file + cleanup)
- **`/src/app/api/user-files/share/route.ts`** — POST (share file with user by email, creates file_shares record + notification)
- **`/src/app/api/users/lookup/route.ts`** — GET (lookup user by email for sharing)

## Component Features

1. **Two Sub-Tabs** (خاصة/عامة):
   - Private: Shows user's own private files
   - Public: Shows user's public files + files shared with them by others

2. **Upload Personal File Dialog**:
   - File picker with drag-area styling
   - Auto-filled file name
   - Description and notes fields
   - Visibility toggle (private/public) with visual buttons
   - XHR-based upload with progress bar and percentage
   - Resets form on success

3. **File Cards**:
   - File icon based on type (PDF=rose, image=purple, spreadsheet=emerald, etc.)
   - File name with visibility badge (private=amber, public=emerald)
   - Description and notes display
   - File size and date
   - Actions: Preview, Download, Share, Delete (own files only)

4. **Share Dialog with Email Lookup**:
   - Email input with search icon
   - 500ms debounced lookup via `/api/users/lookup`
   - Shows found user card with name, email, role badge
   - "Not found" hint for invalid emails
   - Share confirmation with success toast showing shared user's name

5. **Shared Files Display** (Public tab):
   - Files shared WITH the current user
   - Shows who shared it (shared_by_name)
   - Blue accent styling to differentiate from own files
   - Preview and download only (no edit/delete)

6. **Preview Dialog**:
   - Images: inline `<img>` display
   - PDFs: `<iframe>` embed
   - Others: icon + metadata + download button
   - Shows description, notes, size, visibility

7. **Delete Confirmation Dialog**:
   - Explicit confirmation before delete
   - Loading spinner during deletion

## Style
- Emerald/teal color scheme throughout
- Cards with shadows, hover transitions
- Responsive grid (1/2/3 columns)
- RTL layout with `dir="rtl"`
- Framer Motion animations (containerVariants, itemVariants)
- Arabic text for all labels
- Custom scrollbar styling ready

## API Endpoints
- `GET /api/user-files?type=private` — List own private files
- `GET /api/user-files?type=public` — List own public files
- `GET /api/user-files?type=shared` — List files shared with me
- `POST /api/user-files` — Upload personal file (FormData)
- `DELETE /api/user-files?fileId=xxx` — Delete personal file
- `POST /api/user-files/share` — Share file with user
- `GET /api/users/lookup?email=xxx` — User lookup by email

## Lint Status
✅ Passes with 0 errors (2 pre-existing warnings unrelated to this task)
