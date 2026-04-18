# Worklog - EduAI (Examy) Security & Code Quality Improvements

## Date: 2025-03-05

---

## Task 1: Improve Auth Store Security ✅

**File:** `src/stores/auth-store.ts`

### Changes Made:
1. **Input Validation & Sanitization**
   - Added `sanitizeInput()` — strips HTML tags and trims whitespace to prevent XSS
   - Added `isValidEmail()` — validates email format and max length (254 chars)
   - Added `isValidName()` — validates name length (1-100 chars) after sanitization
   - Applied sanitization in `signInWithEmail`, `signUpWithEmail`, and `updateProfile`
   - All emails are lowercased after sanitization

2. **Rate Limiting for Sign-In**
   - Added client-side rate limiting: max 5 attempts per 15-minute window
   - `checkRateLimit()` tracks attempts with timestamps
   - Rate limit resets on successful login
   - Displays remaining wait time in Arabic when blocked

3. **Safe Error Messages**
   - Added `getSafeErrorMessage()` that maps Supabase error codes to user-friendly Arabic messages
   - Handles: invalid credentials, email not confirmed, user already registered, weak password, rate limits, network errors
   - Falls back to generic Arabic message — never exposes internal error details

4. **signUpWithEmail Improvements**
   - Return type now includes `needsConfirmation?: boolean`
   - Detects if Supabase auto-confirms emails (session available immediately) vs requires email confirmation (user exists but no session)
   - When confirmation needed, returns `{ error: null, needsConfirmation: true }`
   - When auto-confirmed, creates profile in users table and returns `{ error: null, needsConfirmation: false }`

---

## Task 2: Improve API Routes Security ✅

**Files:**
- `src/lib/api-security.ts` (NEW — shared security utilities)
- `src/app/api/gemini/summary/route.ts`
- `src/app/api/gemini/quiz/route.ts`
- `src/app/api/gemini/evaluate/route.ts`

### Changes Made:

1. **New Shared Module: `src/lib/api-security.ts`**
   - `checkRateLimit()` — IP-based in-memory rate limiting (10 requests/minute per IP)
   - `getRateLimitHeaders()` — generates `X-RateLimit-Remaining`, `X-RateLimit-Limit`, `Retry-After` headers
   - `validateRequest()` — validates Content-Type must be `application/json`, validates Content-Length <= 1MB
   - `sanitizeString()` — strips HTML tags, trims whitespace, enforces max length
   - `safeErrorResponse()` — returns error JSON without exposing internals

2. **All 3 API Routes Updated:**
   - Content-Type validation (415 if not JSON)
   - Request body size limit (413 if too large)
   - Rate limiting with proper headers (429 if exceeded)
   - Input sanitization with `sanitizeString()` before sending to AI
   - Rate limit headers included in all responses
   - Removed `raw` field from quiz route error response (was leaking AI output)
   - Better type checking (e.g., evaluate route now validates all fields are strings)
   - Generic error responses that don't expose internal details

---

## Task 3: Fix Register Form ✅

**File:** `src/components/auth/register-form.tsx`

### Changes Made:
1. **Added `onSwitchToLogin` prop** — allows parent component to control auth mode switching
2. **Fixed Google Sign-In** — added comment clarifying that Google OAuth redirects away; the auth state change listener handles navigation after redirect (no incorrect `setCurrentPage` call)
3. **Fixed "Login Link"** — now uses `onSwitchToLogin` prop instead of `setCurrentPage('role-selection')` which was incorrect
4. **Added Password Strength Indicator:**
   - Visual bar with 5 segments showing strength level
   - Color-coded: red (weak), yellow (medium), blue (good), emerald (strong)
   - Criteria: length >= 6, length >= 8, uppercase letter, number, special character
   - Shows Arabic label: ضعيفة / متوسطة / جيدة / قوية
5. **Added `maxLength` attributes** — name (100), email (254) to match backend validation
6. **Handle `needsConfirmation`** — shows appropriate toast message when email confirmation is required

---

## Task 4: Fix Login Form ✅

**File:** `src/components/auth/login-form.tsx`

### Changes Made:
1. **Added `onSwitchToRegister` prop** — allows parent to control mode switching
2. **Fixed "Register Link"** — now uses `onSwitchToRegister` prop instead of `setCurrentPage('role-selection')` which was wrong
3. **Google Sign-In comment** — clarified that auth state listener handles post-OAuth navigation
4. **Added `maxLength` attribute** — email input limited to 254 characters
5. **Conditional rendering** — register link only shows when `onSwitchToRegister` prop is provided

---

## Task 5: Update page.tsx for Auth Mode Switching ✅

**File:** `src/app/page.tsx`

### Changes Made:
1. **Passed props to LoginForm:** `onSwitchToRegister={() => setAuthMode('register')}`
2. **Passed props to RegisterForm:** `onSwitchToLogin={() => setAuthMode('login')}`
3. **Removed duplicate external links** — the "Override the register/login link" sections that were rendered below the forms have been removed since the forms now handle switching internally via props

---

## Task 6: Update Supabase Client ✅

**File:** `src/lib/supabase.ts`

### Changes Made:
1. **Added `supabasePublishableKey`** — reads from `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` env variable with fallback to `sb_publishable_zOn0U6HWMiINle9g7IshIw_bOOYNtRm`
2. **Exported `supabasePublishableKey`** — available for use throughout the application

---

## Lint Verification ✅

- Ran `bun run lint` — **passed with no errors**
- Dev server compiles successfully

---

## Task 7: Fix Registration Error - "حدث خطأ غير متوقع. يرجى المحاولة مرة أخرى" ✅

### Root Cause Analysis (3 issues found):

**Issue 1: Email Signups Disabled in Supabase (PRIMARY CAUSE)**
- Tested the Supabase API directly and discovered: `{"error_code": "email_provider_disabled", "msg": "Email signups are disabled"}`
- This is the **main reason** registration fails — the Supabase project has email/password signup disabled
- The error wasn't caught by `getSafeErrorMessage()` because `email_provider_disabled` wasn't in the error pattern list
- Result: fell through to generic Arabic message "حدث خطأ غير متوقع"

**Issue 2: Missing INSERT RLS Policy on `users` Table**
- The `users` table had RLS enabled with SELECT and UPDATE policies, but **NO INSERT policy**
- After `supabase.auth.signUp()` succeeds, the code tries `supabase.from('users').insert()` to create the profile
- RLS blocks the insert → error message doesn't match known patterns → generic Arabic error
- This would have been the next blocker after enabling email signups

**Issue 3: Missing Schema Permissions (`permission denied for schema public`)**
- API test showed: `{"code":"42501","message":"permission denied for schema public"}`
- The `anon` role doesn't have `USAGE` permission on the `public` schema
- Without this, the Supabase client can't access ANY tables
- Common in newer Supabase projects where permissions need to be explicitly granted

### Files Modified:

1. **`src/stores/auth-store.ts`** — Comprehensive auth flow fixes:
   - Added `email_provider_disabled` pattern to `getSafeErrorMessage()` with clear Arabic message
   - Added `error_code` property check alongside `code` and `message`
   - Added `msg` property fallback for different Supabase error formats
   - Added RLS policy violation pattern (`row-level security`, code `42501`)
   - Added duplicate key pattern (code `23505`) — handles trigger race conditions
   - Added `signup is disabled` / `signups not allowed` patterns
   - **signUpWithEmail**: Now checks if profile already exists (created by auth trigger) before inserting
   - **signUpWithEmail**: Handles duplicate key errors gracefully (trigger already created profile)
   - **signInWithEmail**: Now auto-creates missing profile from auth metadata (handles email confirmation flow)
   - **initialize**: Now auto-creates missing profile on app load (handles session restoration)
   - **onAuthStateChange**: Now auto-creates missing profile on auth state change (handles OAuth)

2. **`supabase/schema.sql`** — Critical database fixes:
   - Added `GRANT USAGE ON SCHEMA public TO anon/authenticated`
   - Added `GRANT SELECT, INSERT, UPDATE ON ALL TABLES IN SCHEMA public TO anon/authenticated`
   - Added `GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public TO anon/authenticated`
   - Added `ALTER DEFAULT PRIVILEGES` for future tables
   - Added INSERT RLS policy: `CREATE POLICY "Users can insert own profile" ON public.users FOR INSERT WITH CHECK (auth.uid() = id)`
   - Added auth trigger `handle_new_user()` with `EXCEPTION WHEN OTHERS` — auto-creates profile in `public.users` when new auth user signs up
   - Trigger uses `SECURITY DEFINER` to bypass RLS
   - Trigger extracts name/role from `raw_user_meta_data` with fallbacks

3. **`src/app/api/setup-db/route.ts`** — NEW setup API route:
   - GET: Returns setup instructions, steps, and SQL to apply
   - POST: Attempts to apply SQL automatically (requires service role key)
   - Returns comprehensive JSON with steps, SQL, and instructions

### Required User Actions:

**Step 1 (CRITICAL): Enable Email Signups**
- Go to: Supabase Dashboard → Authentication → Providers → Email
- Enable: "Enable Email Signup"
- This is the PRIMARY cause of the registration error

**Step 2 (CRITICAL): Run Database Schema**
- Go to: Supabase Dashboard → SQL Editor
- Copy and run the FULL content of `supabase/schema.sql`
- This creates tables, RLS policies, GRANT permissions, triggers, and functions

### Lint Verification ✅
- Ran `bun run lint` — **passed with no errors**
