# Examy Worklog

---
Task ID: 1-2
Agent: Main Agent
Task: Fix duplicate notifications, notification click navigation, and avatar upload

Work Log:
- Fixed duplicate notifications: Added deduplication check using `toastedIdsRef` Set to prevent same notification from being toasted twice
- Added notification list deduplication: When INSERT event fires, check if notification ID already exists before adding
- Fixed notification click navigation: Quiz notifications without subject now open the quiz directly
- Added setTimeout(150ms) for navigation after popover closes to ensure state updates happen properly
- Avatar upload: API route looks correct with service role key available. The issue is likely Supabase Storage bucket not having proper RLS policies for public read

Stage Summary:
- Notification deduplication implemented
- Notification click navigation improved
- Avatar upload needs storage bucket policy configuration

---
Task ID: 3-4-5-6
Agent: Sub-agent (full-stack-developer)
Task: Fix file upload, quiz action buttons, quiz answer submission, prevent deleting active lectures

Work Log:
- Fixed file upload: Updated DELETE endpoint to allow both teacher and file uploader to delete
- Fixed quiz action buttons: Changed retake toggle from direct Supabase update to API endpoint
- Fixed quiz answer submission: Deferred evaluation - answers saved locally without checking correctness until final submit
- Added "Previous" button to quiz navigation
- Shuffled matching question values using Fisher-Yates algorithm
- Prevented deleting active lectures with error toast

Stage Summary:
- File upload, quiz actions, quiz flow, and lecture deletion all fixed
- Quiz now uses StoredAnswer pattern for deferred evaluation
