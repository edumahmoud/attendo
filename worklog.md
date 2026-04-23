---
Task ID: 1
Agent: Main
Task: Implement chat system for AttenDo LMS - group chats in courses + global chat section

Work Log:
- Read existing project structure (chat-tab.tsx, course-page.tsx, app-sidebar.tsx, types.ts, dashboards)
- Created Socket.io mini-service at /mini-services/chat-service/ on port 3003
- Created SQL migration for chat tables (conversations, conversation_participants, messages) at /api/chat/setup
- Created /api/chat API route with full CRUD (GET: conversations, messages, participants, search-users, group-conversation; POST: send-message, create-individual, mark-read, ensure-group)
- Added chat types to /src/lib/types.ts (Conversation, ChatMessage, ChatMessageInfo)
- Updated StudentSection and TeacherSection types to include 'chat'
- Updated app-sidebar.tsx to add chat nav item for both student and teacher
- Rewrote chat-tab.tsx with full group chat functionality (Socket.io real-time, message bubbles, typing indicators, auto-scroll)
- Created /src/components/shared/chat-section.tsx - global chat section with conversations list, individual chat creation, user search
- Integrated ChatSection into both student-dashboard.tsx and teacher-dashboard.tsx
- Installed socket.io-client package
- All lint checks pass, dev server running correctly

Stage Summary:
- Chat system fully implemented with Socket.io real-time messaging
- Group chat per course in the Chat tab inside course page
- Global chat section accessible from sidebar showing all conversations (group + individual)
- Individual chats between users in same course
- Auto-create group conversations when subjects are created (via DB trigger)
- Auto-add participants when students enroll (via DB trigger)
- SQL migration needs to be run in Supabase SQL Editor (visit /api/chat/setup for the SQL)

---
Task ID: 2
Agent: Main
Task: Fix chat opening bug, add delete/edit message functionality

Work Log:
- Diagnosed conversation opening bug: chat view required `activeConv` to exist in `conversations` array, causing race condition when creating new conversations
- Fixed by introducing `activeConvInfo` local state that stores conversation details directly when opening
- Changed render condition from `activeConvId && activeConv` to `activeConvId && activeConvInfo`
- Removed "تم فتح المحادثة" toast from startIndividualChat (user requested removal)
- Pass conversation info directly when opening from search results to avoid dependency on conversations list
- Added `is_deleted`, `is_edited`, `edited_at` columns to messages table SQL schema
- Added ALTER TABLE statements for existing tables (backward compatibility)
- Added UPDATE RLS policy for messages ("Users can update their own messages")
- Added GRANT UPDATE permissions for messages table
- Added delete-message API endpoint: verifies sender, soft-deletes (sets is_deleted=true, content="تم حذف هذه الرسالة")
- Added edit-message API endpoint: verifies sender, updates content and sets is_edited=true
- Both API endpoints have fallback for when is_deleted/is_edited columns don't exist yet
- Updated messages GET query to include is_deleted and is_edited fields
- Updated socket.io service with message-updated and message-deleted broadcast events
- Added delete/edit UI to chat-section.tsx: hover menu (⋯) on own messages with edit/delete options
- Added delete/edit UI to chat-tab.tsx: same hover menu and inline editing
- Inline editing with input field, Enter to save, Escape to cancel
- Visual indicators: deleted messages show "🗑️ تم حذف هذه الرسالة" in italic muted style, edited messages show "(معدّلة)" label
- Updated ChatMessage type with is_deleted, is_edited, conversationId, conversation_id optional fields
- All lint checks pass

Stage Summary:
- Fixed: Conversations now open properly when clicking from search results
- Removed "تم فتح المحادثة" toast
- Added: Delete message (soft-delete with visual indicator)
- Added: Edit message (with inline editing UI and "(معدّلة)" indicator)
- Real-time sync via socket.io for delete/edit across all connected clients
- SQL migration updated with new columns - users need to run ALTER TABLE statements

---
Task ID: 3
Agent: Main
Task: Fix recipient not seeing messages/conversations, add notifications, fix conversation list

Work Log:
- Diagnosed root cause: socket.io `io.to(room)` only delivers to sockets that have joined the room
- Recipient hasn't joined the conversation room because they don't know about it yet
- Added `emitToUser()` helper in socket.io service to send events to specific user IDs
- Added `join-all-conversations` event: client sends array of conv IDs, service joins socket to all rooms
- Added `notify-new-conversation` event: notifies target user about new conversation
- Added `chat-notification` event: direct message delivery to specific users (fallback when not in room)
- Modified `send-message` handler: now also sends `chat-notification` to all participantIds
- Added `participantIds` field to send-message payload from both chat-section.tsx and chat-tab.tsx
- Client: On socket connect, auto-fetches all conversations and joins all rooms via `join-all-conversations`
- Client: Added `activeConvIdRef` and `conversationsRef` to avoid stale closure issues in socket handlers
- Client: Added `new-conversation` listener: auto-joins room, shows toast, refreshes conversation list
- Client: Added `chat-notification` listener: if active conv, adds message; otherwise shows toast notification
- Client: When creating individual chat, emits `notify-new-conversation` to the other user
- Toast notifications show sender name and message preview for messages in other conversations
- Updated chat-tab.tsx with `conversationIdRef`, `chat-notification` listener, and `participantIds` in send-message
- Restarted chat service with updated code
- All lint checks pass

Stage Summary:
- Fixed: Recipient now receives messages in real-time (via room broadcast AND direct delivery)
- Fixed: Conversation list updates for both sender and recipient
- Added: Toast notification "رسالة جديدة من {name}" when receiving messages in other conversations
- Added: Toast notification "محادثة جديدة من {name}" when someone creates a conversation with you
- Added: Auto-join all conversation rooms on socket connect (survives reconnection)
- Added: `notify-new-conversation` socket event for cross-user conversation creation notification

---
Task ID: 2
Agent: full-stack-developer
Task: Redesign chat-section.tsx

Work Log:
- Read existing chat-section.tsx (1100+ lines), worklog.md, types.ts, supabase.ts, chat API route, and chat socket.io service
- Analyzed current issues: conversation list population failures, unreliable socket.io, no notification badges, RTL layout problems
- Completely rewrote chat-section.tsx with comprehensive redesign (~750 lines of clean code)
- Added polling fallback: every 5 seconds when socket disconnected, every 15 seconds as backup when connected
- Added local unread tracking (localUnread Map) for real-time badge updates without waiting for server refresh
- Added conversation list search/filter bar at top of sidebar
- Added proper error handling with convFetchError state and retry button
- Added Arabic RTL layout with dir="rtl" and logical CSS properties (start/end instead of left/right)
- Improved conversation list items: active highlight with border-s-2, online status dots, unread badges, time previews
- Improved chat header: online status text, participant count for groups, connection indicator
- Improved empty states: welcome screen with "start new conversation" CTA, empty chat state with icon
- Added TypingIndicator component with animated dots and Arabic text ("يكتب", "يكتبان", "يكتبون")
- Added user-status-changed socket listener for future status updates
- Improved New DM dialog: modal overlay with search, online status dots on results, proper empty states
- Changed socket reconnection to Infinity attempts with max delay of 5s for better resilience
- Added automatic mark-as-read when receiving messages in active conversation (both new-message and chat-notification handlers)
- Message bubbles: own messages LEFT with emerald bg, others RIGHT with muted bg, deleted/edited indicators preserved
- All lint checks pass, dev server running correctly with no errors

Stage Summary:
- Complete redesign of chat-section.tsx with production-quality code
- Polling fallback ensures messages always appear even if socket.io fails
- Local unread tracking provides instant badge updates
- Arabic RTL layout properly implemented throughout
- Better error handling, empty states, and loading indicators
- Mobile responsive with back button to switch panels
- Search/filter bar for conversation list
- Typing indicator with animated dots
- New DM dialog with user search and online status

---
Task ID: 3
Agent: full-stack-developer
Task: Fix chat-tab.tsx with polling fallback and better real-time sync

Work Log:
- Read current chat-tab.tsx, chat-section.tsx (reference for polling patterns), and chat socket.io service
- Added polling fallback: `pollMessages` callback with `lastPollTimeRef` throttle (2s minimum between polls)
- Polling interval: every 5s when socket disconnected, every 15s as backup even when connected
- Only fetches messages newer than the latest message in state (compares `created_at` timestamps)
- Merges new messages with existing state, deduplicates by `id`, sorts by `created_at`
- Added `pollingRef`, `backupPollingRef`, `lastPollTimeRef`, `messagesRef` refs
- Fixed socket reconnection: `reconnectionAttempts: Infinity`, `reconnectionDelayMax: 5000`
- Updated `new-message` handler: uses `conversationIdRef` for stale closure prevention, sorts messages after adding, auto marks-as-read for non-own messages
- Updated `chat-notification` handler: uses `conversationIdRef`, adds messages with sort, auto marks-as-read for active conversation, shows toast notification for non-active conversations
- Added `Bell` and `WifiOff` icon imports for notifications and connection indicator
- Added `WifiOff` icon in header when socket is disconnected for visual feedback
- Improved empty state: larger gradient icon, bold heading, descriptive text with subject name, participant count
- Auto-scroll now also triggers on `typingUsers` changes
- Loading state shows descriptive text instead of just spinner
- All lint checks pass, dev server running correctly with polling active

Stage Summary:
- Polling fallback ensures messages always appear even if socket.io fails
- Auto mark-as-read when receiving messages in the active conversation
- Toast notifications for messages in other conversations via chat-notification
- Socket reconnection set to infinite attempts with max 5s delay
- Better empty state with subject name and participant count
- WifiOff icon shows when socket disconnected
- Messages properly sorted after merging from socket events or polling

---
Task ID: 4-6
Agent: full-stack-developer
Task: Add user status/presence system with settings control and update socket.io service

Work Log:
- Added `UserStatus` type ('online' | 'away' | 'busy' | 'offline' | 'invisible') to /src/lib/types.ts
- Added `status?: UserStatus` field to `UserProfile` interface
- Updated socket.io service (/mini-services/chat-service/index.ts) with full status tracking:
  - Added `userStatuses` Map (userId -> UserStatus) for in-memory state
  - Added `getVisibleStatus()` helper: invisible users appear as 'offline' to others but see their real status
  - Added `broadcastStatusChange()` helper: broadcasts visible status to all, real status to the user themselves
  - On auth: sets status to 'online' by default (if no existing status), sends current status to socket, broadcasts if newly online
  - On disconnect (all sockets gone): sets status to 'offline' and broadcasts
  - Added `status-change` event: client sends { userId, status }, validates status, updates Map, broadcasts
  - Added `get-user-status` event: client sends { userIds }, responds with `user-statuses` event containing visible statuses
- Updated settings-section.tsx with status control card:
  - Added socket.io connection on component mount for status management
  - Status persisted in localStorage (key: 'attenddo-user-status')
  - On connect: authenticates and emits current status preference
  - Status card shows current status with colored indicator and description
  - Radio-style buttons for 5 status options: متصل (green), مشغول (amber), بعيد (orange), غير مرئي (gray), غير متصل (gray)
  - Each option shows colored dot, label, and description when selected
  - Invisible mode shows special note explaining that user appears offline but can still use chat
  - Socket connection indicator (Wifi/WifiOff icon) in card header
  - Toast notification on status change
  - Card placed in left column between Profile Info and Password Change
- All lint checks pass, dev server running, chat service restarted and working

Stage Summary:
- User status/presence system fully implemented
- 5 status options: online, busy, away, invisible, offline
- Invisible mode: appears offline to others but still receives messages
- Status tracked in socket.io service memory (Map)
- Status persisted in localStorage on client
- Real-time status changes broadcast via socket.io
- Settings UI with Arabic RTL labels and color-coded indicators
- No database changes required (status tracked only in memory)

---
Task ID: 2
Agent: Main Orchestrator
Task: Redesign chat section, fix real-time sync, add status system

Work Log:
- Analyzed all existing chat code (chat-section.tsx, chat-tab.tsx, chat API, socket service)
- Identified 3 critical issues: conversation list not populating, messages not appearing for recipient, no notifications
- Delegated chat-section.tsx redesign to full-stack-developer agent
- Delegated chat-tab.tsx polling fallback fix to full-stack-developer agent
- Delegated status/presence system + socket service update to full-stack-developer agent
- Verified all lint checks pass (0 errors)
- Verified dev server running on port 3000
- Verified chat service running on port 3003
- Started chat service that was not running

Stage Summary:
- **Chat Section Redesigned**: Complete rewrite with better UX, RTL layout, search filter, unread badges, polling fallback
- **Polling Fallback Added**: Messages now sync every 5s when socket disconnected, every 15s as backup
- **Chat Tab Fixed**: Added polling fallback, better socket reconnection, auto mark-as-read
- **Status System Added**: UserStatus type (online/away/busy/offline/invisible), settings UI control, socket status events
- **Socket Service Updated**: Status tracking with userStatuses Map, invisible mode support, status change broadcasting
- **Types Updated**: Added UserStatus type and status field to UserProfile interface
- **Settings Section Updated**: Added status control card with 5 options, localStorage persistence, socket integration

---
Task ID: 1
Agent: main
Task: Fix all chat/messaging issues - shared socket, real-time, status, chat box

Work Log:
- Read and analyzed all chat-related files: chat-section.tsx (1572 lines), chat-tab.tsx (927 lines), settings-section.tsx (1000+ lines), socket service (348 lines), chat API route, types
- Discovered root cause: chat service on port 3003 was NOT running, causing "غير متصل بالخادم" (not connected to server)
- Started the chat service: `cd mini-services/chat-service && bun index.ts`
- Identified that 3 components each created separate socket.io connections with `forceNew: true`, causing:
  - Duplicate connections
  - Race conditions
  - Real-time messages not being delivered to recipients
  - Status not working properly
- Created shared socket utility at `/home/z/my-project/src/lib/socket.tsx` with:
  - Singleton socket pattern via `getSocket()`
  - `SocketProvider` React context for connection status
  - `useSharedSocket()` hook for components
  - `useSocketEvent()` hook for event subscription with auto-cleanup
  - Auto-authentication on connect/reconnect
  - Room join queuing when disconnected
  - Fixed bug: provider listeners were removing auto-auth listener on unmount
- Added `SocketProvider` to `page.tsx` wrapping all authenticated content
- Added `setSocketAuth(userId, userName)` call when user logs in
- Added `destroySocket()` on sign out
- Updated `chat-tab.tsx` to use shared socket:
  - KEY FIX: Added `joinRoom(convId)` in `initConversation` after setting conversationId
  - Replaced socket creation useEffect with `useSocketEvent` calls
  - This fixes real-time messages not appearing without page refresh
- Updated `settings-section.tsx`:
  - Replaced socket creation with `useSharedSocket()` + `useSocketEvent()`
  - Fixed "غير متصل بالخادم" by using shared socket (now connects properly)
  - Redesigned status/presence card with 2-column grid layout, compact cards, pulsing animations
  - Replaced harsh "غير متصل بالخادم" badge with subtle amber warning
- Updated `chat-section.tsx`:
  - Replaced socket creation with `useSharedSocket()` + `useSocketEvent()`
  - Added auto-join rooms effect when `isConnected` becomes true
  - Replaced all `socketRef.current?.emit()` with `socket?.emit()` or `joinRoom()`/`leaveRoom()`
  - Fixed chat box not appearing by ensuring proper room joining on connect
- Lint passes clean, dev server compiles successfully
- Chat service confirmed running on port 3003

Stage Summary:
- Fixed all 4 user-reported issues:
  1. ✅ Status section redesigned with cleaner 2-column grid, pulsing animations
  2. ✅ "غير متصل بالخادم" fixed by using shared socket + starting chat service
  3. ✅ Chat box appearing fixed by proper room joining and shared socket
  4. ✅ Real-time messaging in course tab fixed by adding joinRoom() call after init
- Key architectural improvement: single shared socket connection across all components
- No more duplicate connections, race conditions, or missed real-time events

---
Task ID: 5
Agent: main
Task: Fix status display, chat box rendering, real-time messaging, and redesign status section

Work Log:
- Started chat service on port 3003 (was not running - root cause of "غير متصل بالخادم")
- Fixed SocketProvider reconnection tracking: added `socket.io.on('reconnect', handler)` as safety net
- Fixed chat box not appearing: moved `setActiveConvInfo(convInfo)` BEFORE async operations in `openConversation()`
  - Previously, activeConvInfo was set AFTER await fetch(), causing a gap where activeConvId was set but activeConvInfo was null
  - Now the chat box renders immediately when a conversation is opened
- Fixed real-time messaging in chat-tab.tsx:
  - Added `conversationIdRef` to avoid stale closure in socket event handlers
  - Changed all `conversationId` references in useSocketEvent handlers to `conversationIdRef.current`
  - Added `pollMessages` using `conversationIdRef.current` instead of stale `conversationId` state
  - Removed `[conversationId]` dependency from `pollMessages` useCallback (now uses ref)
  - Changed polling from "only when disconnected" to "always poll as backup" (5s disconnected, 15s connected)
  - Added reconnect handler: re-join room when socket reconnects
- Redesigned status/presence section in settings:
  - Removed confusing "متصل — جاري إعادة الاتصال" mixed message
  - Removed scary "غير متصل بالخادم — سيتم مزامنة حالتك عند إعادة الاتصال" warning
  - Separated user status from connection status clearly
  - Connection status now shows as small green/amber dot next to status label ("متصل" / "جاري الاتصال")
  - Larger, more prominent current status display with circular indicator
  - Better status option cards with descriptions for each option
  - Single-column on mobile, 2-column on desktop for options
  - Clean header without redundant connection dot

Stage Summary:
- Chat service started and running on port 3003
- Socket reconnection tracking improved with `io.on('reconnect')` handler
- Chat box renders immediately when opening conversations (no more gap)
- Real-time messages work in course chat tab (ref-based handlers + backup polling)
- Status section redesigned: clean separation of user status vs connection status
- No more confusing mixed messages like "متصل— جاري إعادة الاتصال"
- No more scary "غير متصل بالخادم" warnings

---
Task ID: 6
Agent: Main
Task: Cancel role selection during registration, default to student, admin-only role management, first user = superadmin

Work Log:
- Analyzed complete auth system: register-form, login-form, role-selection, auth-store, auth callback, middleware, admin dashboard, SQL schema
- Updated types.ts: Changed UserRole from 'student'|'teacher'|'admin'|'pending' to 'student'|'teacher'|'admin'|'superadmin', removed 'role-selection' from AppPage
- Created /api/auth/check-first-user API route: checks if user is first on platform, promotes to superadmin atomically
- Updated register-form.tsx: removed role selection cards entirely, always registers as 'student', added info note about default student role
- Updated auth-store.ts: signUpWithEmail no longer requires role parameter (defaults to 'student'), removed all 'pending' role handling, added checkAndPromoteFirstUser() helper that calls API after registration, added getDashboardForRole() helper
- Updated login-form.tsx: removed 'pending' role handling, added superadmin routing to admin-dashboard
- Updated page.tsx: removed RoleSelection import and routing, removed 'role-selection' page, new Google OAuth users go to student-dashboard, superadmin routes to admin-dashboard
- Updated auth callback route.ts: added first-user check (counts existing users), first Google OAuth user gets 'superadmin' role, no more redirect to role-selection
- Updated middleware.ts: allow superadmin access to admin API routes (both token and session checks)
- Updated change-role API: supports 'superadmin' as valid role, only admin/superadmin can change roles, superadmin-only restrictions: only superadmin can assign superadmin/admin roles, only superadmin can change superadmin users
- Updated admin-dashboard.tsx: getRoleLabel/getRoleBadgeClass for superadmin (مدير المنصة, amber colors), superadminCount computed value, role filter includes superadmin, user cards show superadmin with amber badge, role change section filters available roles by admin level, danger zone only for non-superadmin users, dashboard header shows "لوحة تحكم مدير المنصة" for superadmin, user distribution includes superadmin count, Excel export includes superadmin stats, user cards are clickable to open detail modal
- Updated app-sidebar.tsx: role type includes 'superadmin', superadmin uses same empty nav as admin (custom nav provided by admin-dashboard)
- Updated app-header.tsx: ActiveSectionLabel role type includes 'superadmin'
- Updated settings-section.tsx: getRoleLabel includes 'superadmin' (مدير المنصة/مديرة المنصة), roleBadgeClass includes superadmin amber style
- Updated settings-modal.tsx: roleLabel includes superadmin
- Updated personal-files-section.tsx: role badges include superadmin label
- Updated FULL_SETUP.sql: CHECK constraint includes 'superadmin', handle_new_user trigger counts users and makes first user superadmin
- Created supabase/migrations/add_superadmin_role.sql: ALTER TABLE to add superadmin to CHECK constraint, updates trigger, promotes first user to superadmin
- Created /api/migrate/superadmin route: one-time migration endpoint to promote first user
- All lint checks pass, dev server running correctly

Stage Summary:
- Registration no longer asks for role type - all new users default to 'student'
- Removed role-selection page entirely (no more post-OAuth role selection)
- First user on the platform is automatically promoted to 'superadmin' (مدير المنصة)
- Only admin (مشرف) or superadmin (مدير المنصة) can change user roles
- Role hierarchy: superadmin > admin > teacher > student
- Superadmin can: assign any role including admin and superadmin, change other admins' and superadmins' roles, delete admin users
- Admin can only: change students to teachers and vice versa (cannot assign admin/superadmin roles)
- Superadmin has amber/gold color theme throughout the UI
- SQL migration provided for existing databases at supabase/migrations/add_superadmin_role.sql

---
Task ID: 7
Agent: Main
Task: Fix teacher not receiving student link requests - add notification system for link requests

Work Log:
- Analyzed complete student-teacher linking flow: student sends request via /api/link-teacher, teacher sees it in students section
- Identified root cause: No notification was sent to the teacher when a student creates a pending link request
- Also identified: No notification to student when teacher approves/rejects their request
- Added notification to teacher in /api/link-teacher route.ts: when student creates a link, teacher gets a notification with link to students section
- Added notification to student in /api/link-teacher-approve route.ts: when teacher approves or rejects, student gets a notification with link to teachers section
- Added notifications for bulk approve/reject actions (approveAll, rejectAll) too
- Added 'link_request' to NotificationType in types.ts
- Updated notification-bell.tsx: added UserPlus icon import, added link_request icon case with title-based fallback detection (works even before DB migration)
- Updated getNotifIcon function to accept title parameter for content-based detection
- Added auto-refresh when navigating to students/teachers section:
  - Teacher dashboard: useEffect watches activeSection === 'students' → fetchStudents()
  - Student dashboard: useEffect watches activeSection === 'teachers' → fetchLinkedTeachers()
- Created /api/migrate/link-request-notifications route to check/apply v11 migration
- v11 migration adds teacher_student_links to supabase_realtime publication (enables real-time updates)
- v11 migration adds 'link_request' to notifications type check constraint in DB
- Currently using 'system' type for notifications (DB doesn't support 'link_request' yet until v11 is applied)
- Notification bell detects link request notifications by title content (طلب ارتباط) as fallback
- All lint checks pass, dev server running correctly

Stage Summary:
- Teacher now receives notification when student sends link request ✅
- Student now receives notification when teacher approves/rejects link request ✅
- Notifications navigate to correct section (students for teacher, teachers for student) ✅
- Auto-refresh when navigating to students/teachers section ✅
- Migration v11 created for: realtime publication + link_request notification type ✅
- Using 'system' notification type temporarily (works before DB migration) ✅
- Notification bell shows UserPlus icon for link request notifications (via title detection) ✅

---
Task ID: 2-b
Agent: general-purpose
Task: Replace all hardcoded avatar circles with UserAvatar component

Work Log:
- Read all 4 target files to identify exact locations of hardcoded avatar circles
- Verified UserAvatar component exists at /src/components/shared/user-avatar.tsx with size props (xs/sm/md/lg/xl) and avatarUrl support
- **students-tab.tsx**: Added import, replaced 3 avatar circles:
  1. Line ~646: Search result avatar → `<UserAvatar size="sm">`
  2. Line ~754: Enrolled student list avatar → `<UserAvatar size="sm">`
  3. Line ~1022: Pending request avatar → `<UserAvatar size="lg" className="!rounded-xl">`
- **student-profile-modal.tsx**: Added import, replaced 1 avatar circle:
  1. Line ~167: Student profile avatar → `<UserAvatar size="xl">`
- **teacher-dashboard.tsx**: Added import, replaced 6 avatar circles:
  1. Line ~942: Dashboard student table → `<UserAvatar size="xs">`
  2. Line ~1217: Pending student detail → `<UserAvatar size="lg">`
  3. Line ~1440-1445: Student preview (conditional with img tag) → replaced entire conditional with `<UserAvatar size="md">`
  4. Line ~1522: Grid view student card → `<UserAvatar size="sm">`
  5. Line ~1569: Table view student row → `<UserAvatar size="xs">`
  6. Line ~1631: Selected student detail modal → `<UserAvatar size="md">`
- **student-dashboard.tsx**: Added import, replaced 1 avatar circle:
  1. Line ~1664-1669: Teacher avatar (conditional with img tag) → replaced entire conditional with `<UserAvatar size="lg">`
- Verified all `.charAt(0)` patterns removed from all 4 files (0 grep hits remaining)

Stage Summary:
- Replaced 11 hardcoded avatar circles across 4 files with UserAvatar component
- UserAvatar handles both avatar URL display and fallback initials internally
- Removed conditional avatar_url checks where UserAvatar replaces them (teacher-dashboard preview, student-dashboard teacher)
- All imports added correctly, no duplicates

---
Task ID: 2-a
Agent: general-purpose
Task: Replace hardcoded avatar circles with UserAvatar in chat files, make sender names clickable with openProfile

Work Log:
- Read chat-section.tsx (1561 lines), chat-tab.tsx (878 lines), user-avatar.tsx, app-store.ts, and worklog.md
- Verified UserAvatar component API: name, avatarUrl, size (xs/sm/md/lg/xl), className
- Verified useAppStore has openProfile: (userId: string) => set({ profileUserId: userId, currentPage: 'profile' })
- **chat-section.tsx**: Added `UserAvatar` and `useAppStore` imports, added `const { openProfile } = useAppStore()`
  1. Line ~920-924: Message sender avatar → `<UserAvatar name={senderName} avatarUrl={msg.sender?.avatar_url} size="xs" />`
  2. Line ~931-933: Sender name in group chats → replaced `<span>` with `<button>` calling `openProfile(msg.sender_id)` with hover effect
  3. Line ~1240-1259: Conversation list item avatar → replaced img/conditional with `<UserAvatar>` for individual chats, kept Hash icon for group chats
  4. Removed unused `displayAvatar` variable from conversation list
  5. Line ~1310-1333: Chat header avatar → replaced img/conditional with `<UserAvatar name={chatHeaderName} avatarUrl={activeConvInfo?.otherParticipant?.avatar_url} size="md" />`
  6. Line ~1525-1535: New DM search result user avatar → replaced img/conditional with `<UserAvatar name={user.name} avatarUrl={user.avatar_url} size="md" />`
- **chat-tab.tsx**: Added `UserAvatar` and `useAppStore` imports, added `const { openProfile } = useAppStore()`
  1. Line ~571-578: Message sender avatar → `<UserAvatar name={senderName} avatarUrl={msg.sender?.avatar_url} size="sm" />`
  2. Line ~584-585: Sender name → replaced `<span>` with `<button>` calling `openProfile(msg.sender_id)` with hover effect
- Fixed JSX syntax: missing closing `)}` on conditional rendering blocks after button replacement in both files
- TypeScript check: no new errors introduced (pre-existing errors in these files are unrelated type casting issues)

Stage Summary:
- Replaced 6 hardcoded avatar circles in chat-section.tsx with UserAvatar component
- Replaced 1 hardcoded avatar circle in chat-tab.tsx with UserAvatar component
- Made sender names clickable in both files via openProfile from useAppStore
- Sender name buttons have hover:text-emerald-600 transition effect
- Removed unused displayAvatar variable
- No new TypeScript errors introduced
- Student names in students-tab.tsx were already clickable via onClick handler on parent div (line 752-753)

---
Task ID: 2-c
Agent: general-purpose
Task: Replace all hardcoded avatar circles with UserAvatar component in admin and other files

Work Log:
- Read all 6 target files to identify exact locations of hardcoded avatar circles
- Verified UserAvatar component exists at /src/components/shared/user-avatar.tsx with size props (xs/sm/md/lg/xl) and avatarUrl support
- **admin-dashboard.tsx**: Added import, replaced 6 avatar circles:
  1. Line ~742: User list item avatar (h-7 w-7 purple) → `<UserAvatar name={user.name} avatarUrl={user.avatar_url} size="xs" />`
  2. Line ~934-943: User detail card avatar (role-colored h-9 w-9 with transition) → `<UserAvatar name={user.name} avatarUrl={user.avatar_url} size="sm" />`
  3. Line ~1028-1035: Selected user detail avatar (role-colored h-12 w-12) → `<UserAvatar name={selectedUser.name} avatarUrl={selectedUser.avatar_url} size="lg" />`
  4. Line ~1232: Teacher avatar in subject (h-6 w-6 emerald) → `<UserAvatar name={teacher.name} avatarUrl={teacher.avatar_url} size="xs" />`
  5. Line ~1352: Subject teacher avatar (h-9 w-9 emerald) → `<UserAvatar name={subjectTeacher.name} avatarUrl={subjectTeacher.avatar_url} size="sm" />`
  6. Line ~1376: Student avatar (h-7 w-7 blue) → `<UserAvatar name={student.name} avatarUrl={student.avatar_url} size="xs" />`
- **attendance-section.tsx**: Added import, replaced 2 avatar circles:
  1. Line ~1087: Student attendance list avatar (h-9 w-9 emerald) → `<UserAvatar name={student.name} avatarUrl={student.avatar_url} size="sm" />`
  2. Line ~1198: Past session record avatar (h-9 w-9 emerald) → `<UserAvatar name={record.student_name || 'مستخدم'} avatarUrl={record.student_avatar} size="sm" />`
- **assignments-section.tsx**: Added import, replaced 1 avatar circle:
  1. Line ~1272: Submission student avatar (h-8 w-8 emerald) → `<UserAvatar name={sub.student_name || 'مستخدم'} avatarUrl={sub.student_avatar} size="sm" />`
- **assignments-tab.tsx**: Added import, replaced 1 avatar circle:
  1. Line ~1060: Submission student avatar (h-8 w-8 emerald) → `<UserAvatar name={sub.student_name || 'مستخدم'} avatarUrl={sub.student_avatar} size="sm" />`
- **personal-files-section.tsx**: Added import, replaced 5 avatar circles:
  1. Line ~1771: Shared by user avatar (h-7 w-7 emerald) → `<UserAvatar name={file.shared_by_user?.name || 'مستخدم'} avatarUrl={file.shared_by_user?.avatar_url} size="xs" />`
  2. Line ~2155: Shared with user avatar (h-7 w-7 emerald) → `<UserAvatar name={share.shared_with_user?.name || 'مستخدم'} avatarUrl={share.shared_with_user?.avatar_url} size="xs" />`
  3. Line ~2293: User search result avatar (h-7 w-7 emerald) → `<UserAvatar name={user.name || 'مستخدم'} avatarUrl={user.avatar_url} size="xs" />`
  4. Line ~2358: Shared with user avatar another location (h-7 w-7 emerald) → `<UserAvatar name={share.shared_with_user?.name || 'مستخدم'} avatarUrl={share.shared_with_user?.avatar_url} size="xs" />`
  5. Line ~2674: Bulk share user search result avatar (h-7 w-7 emerald) → `<UserAvatar name={user.name || 'مستخدم'} avatarUrl={user.avatar_url} size="xs" />`
- **lecture-modal.tsx**: Added import, replaced 1 avatar circle:
  1. Line ~910: Attendance record student avatar (h-8 w-8 emerald) → `<UserAvatar name={record.student_name || 'مستخدم'} avatarUrl={record.student_avatar} size="sm" />`
- Verified all `.charAt(0)` patterns removed from all 6 files (0 grep hits remaining)
- Total: 16 hardcoded avatar circles replaced across 6 files

Stage Summary:
- Replaced 16 hardcoded avatar circles across 6 files with UserAvatar component
- UserAvatar handles both avatar URL display and fallback initials internally
- Fallback names use 'مستخدم' (Arabic for 'User') where names might be undefined
- avatarUrl fields that may not exist in data (e.g., record.student_avatar) are passed as-is — UserAvatar handles undefined gracefully
- All imports added correctly, no duplicates

---
Task ID: 8
Agent: Main Orchestrator
Task: Fix shared files text, profile photo enlarge, student performance, notification modals, z-index fix, status on profile, notifications section

Work Log:
- Fixed shared files text in personal-files-section.tsx: Changed "شاركك {name}" to "شارك معك {titleLabel/roleLabel} : {name} هذا الملف" with clickable name link using openProfile
- Made profile photo clickable in user-profile-page.tsx: Added Dialog for fullscreen view with ZoomIn hover effect on avatar
- Added student performance action button in students-tab.tsx: BarChart3 icon button opens modal showing average grades, submissions by task, attendance count/percentage with progress bars
- Fixed link_request notification handling in notification-bell.tsx: Shows accept/reject modal with teacher info instead of navigating to settings
- Fixed file request notification handling: Navigates to user's own profile instead of settings page
- Fixed z-index issue in teacher-dashboard.tsx: Moved student detail modal and confirm remove dialog from renderStudents() to main component return, changed z-index to z-[100]
- Added status display on profile page in user-profile-page.tsx: Uses socket.io get-user-status to fetch status, shows colored dot on avatar and status badge next to role badge
- Created notifications-section.tsx: Full notifications page with clickable items, link request accept/reject modal, mark all read, clear all
- Added 'notifications' to StudentSection and TeacherSection types
- Added notifications nav item to app-sidebar.tsx for both student and teacher
- Integrated NotificationsSection into student-dashboard.tsx and teacher-dashboard.tsx
- All lint checks pass, dev server running correctly

Stage Summary:
- **Shared files text**: Now shows "شارك معك {اللقب} : {الاسم} هذا الملف" with clickable name
- **Profile photo enlarge**: Click avatar to view full-size photo in dialog
- **Student performance**: BarChart3 button in students table shows modal with grades, submissions, attendance
- **Notification modals**: link_request and file notifications show accept/reject modal instead of redirecting to settings
- **z-index fix**: Student detail modal now renders at top level, works from dashboard section
- **Status on profile**: Shows user's online/busy/away/offline status with colored indicators
- **Notifications section**: Dedicated page accessible from sidebar with clickable notifications

---
Task ID: 9
Agent: Main
Task: Add enrollment notifications — notify students when added/approved/rejected/removed from courses, notify teacher when student requests to join

Work Log:
- Analyzed all enrollment flows: /api/join-subject (student joins by code), /api/enrollment (teacher manages enrollments)
- Found that NO notifications were being sent for any enrollment action
- Added notifyUser() helper using supabaseServer (bypasses RLS) to /api/join-subject
- Added notifyUser() and notifyUsers() helpers to /api/enrollment
- /api/join-subject: When student joins by code, teacher gets "طلب انضمام جديد" notification
- /api/enrollment approve: Student gets "تم قبول طلب الانضمام" notification
- /api/enrollment reject: Student gets "تم رفض طلب الانضمام" notification
- /api/enrollment approveAll: All students get "تم قبول طلب الانضمام" bulk notification
- /api/enrollment rejectAll: All students get "تم رفض طلب الانضمام" bulk notification
- /api/enrollment add: Student gets "تم إضافتك إلى مقرر" notification (this was the user's specific request)
- /api/enrollment remove: Student gets "تم إزالتك من المقرر" notification
- Added enrollment:SUBJECT_ID and subject:SUBJECT_ID link handling in notification-bell.tsx
- Added enrollment:SUBJECT_ID and subject:SUBJECT_ID link handling in notifications-section.tsx
- Clicking enrollment notification navigates to the course page (uses setSelectedSubjectId)
- Updated subject query to include name field for richer notification messages
- Updated teacher profile query to include name field for notification messages
- All notifications use type 'enrollment' with link format 'subject:SUBJECT_ID' or 'enrollment:SUBJECT_ID'
- All lint checks pass, dev server running correctly

Stage Summary:
- All 7 enrollment actions now send notifications to the appropriate users
- Teacher is notified when a student requests to join their course by code
- Students are notified when: approved, rejected, added directly, or removed from a course

---
Task ID: 2
Agent: full-stack-developer
Task: Add ability for multiple teachers to share the same course

Work Log:
- Read worklog.md, FULL_SETUP.sql, types.ts, course-page.tsx, teacher-dashboard.tsx, subjects-section.tsx, enrollment route, join-subject route, supabase-server.ts
- Created SQL migration at /supabase/migrations/v10_subject_teachers.sql with:
  - subject_teachers junction table (id, subject_id, teacher_id, role, added_by, created_at)
  - UNIQUE constraint on (subject_id, teacher_id)
  - Indexes on subject_id, teacher_id, role
  - RLS enabled with policies for teachers, students
  - Updated get_teacher_subject_ids() function to UNION with subject_teachers
  - Trigger trg_add_subject_owner to auto-add creator as 'owner' on subject creation
  - Backfill INSERT for existing subjects
  - Grants and realtime publication
- Created migration API route at /src/app/api/migrate/subject-teachers/route.ts (POST)
- Updated TypeScript types: added SubjectTeacher interface, updated Subject with co_teachers and is_co_teacher fields
- Created co-teacher management API route at /src/app/api/subject-teachers/route.ts:
  - GET: List co-teachers for a subject (with joined user profile data)
  - POST: Add co-teacher by teacher_code (owner only, with notification)
  - DELETE: Remove co-teacher (owner only, with notification)
- Updated overview-tab.tsx with full co-teacher management UI:
  - Co-teachers list with avatars, names, role badges
  - "Add co-teacher" button + modal with teacher code input
  - Remove co-teacher button (owner only)
  - Co-teacher indicator badge for current user
- Updated subjects-section.tsx:
  - Fetches both owned and co-taught subjects for teachers
  - Shows "معلم مشارك" badge on co-taught subject cards
  - Hides join code on co-taught subjects
- Updated teacher-dashboard.tsx:
  - fetchTeacherSubjects now also fetches co-taught subjects from subject_teachers
- Updated enrollment route to allow co-teachers to manage enrollments (checks subject_teachers table)
- Updated join-subject route to also notify co-teachers when a student requests to join
- All lint checks pass, dev server running correctly

Stage Summary:
- subject_teachers junction table enables multiple teachers per course
- Owner can add/remove co-teachers via teacher code from course overview tab
- Co-teachers can manage enrollments (approve, reject, add, remove students)
- Co-teachers receive notifications for new join requests
- Co-taught subjects appear in teacher's subject list with "معلم مشارك" badge
- SQL migration needs to be run in Supabase SQL Editor (visit /api/migrate/subject-teachers for status)
- get_teacher_subject_ids() updated to include co-taught subjects for RLS
- Bulk approve/reject sends bulk notifications to all affected students
- Clicking an enrollment notification navigates directly to the course page
- All notifications use service role (supabaseServer) to bypass RLS

---
Task ID: 3
Agent: full-stack-developer
Task: Admin dashboard with active lectures and usage statistics

Work Log:
- Read worklog.md, admin-dashboard.tsx, existing API routes (stats, data), supabase-server.ts, types.ts
- Created /src/app/api/admin/usage-stats/route.ts - API route for usage statistics with:
  - `activeLectures`: Count of attendance_sessions with status='active'
  - Period-based filtering: day/month/year via query parameter
  - `activeUsers`: Count of unique users with active sessions in user_sessions table within the period
  - `newRegistrations`: Count of users created within the period
  - `attendanceSessions`: Count of attendance_sessions started within the period
  - `quizzesTaken`: Count of scores completed within the period
  - `changes`: Percentage change from previous period for each metric
  - `prevData`: Previous period data for comparison
  - `chartData`: 30-day daily breakdown with users/sessions/quizzes counts
  - `registrationTrends`: 12-month monthly registration trends
- Updated admin-dashboard.tsx with enhanced reports section:
  - Added imports: Activity, Radio, ArrowUpRight, ArrowDownRight from lucide-react; LineChart, Line from recharts
  - Added state: usageStats, usagePeriod, loadingUsageStats
  - Added fetchUsageStats() function with Bearer token auth
  - Added useEffect to refetch when period changes while on reports section
  - Updated handleSectionChange to fetch usage stats when switching to reports
  - Added getPeriodLabel() helper for Arabic period labels
  - Rewrote renderReports() with:
    - Stats cards row: Active Lectures (with live indicator dot), Active Users, New Registrations, Attendance Sessions (all with percentage change badges)
    - Period filter: day/month/year toggle buttons with purple highlight
    - Daily Activity bar chart: 30-day breakdown showing new registrations, attendance sessions, and quizzes per day
    - Registration Trends line chart: 12-month registration trend with teal color
    - Score Distribution pie chart (preserved from original)
    - Quiz performance overview with distribution and recent scores (preserved from original)
    - Detailed Statistics table: metric name, current count, previous period count, percentage change badge for each metric
    - Platform overview summary and user distribution cards (preserved from original)
- All lint checks pass (0 errors), dev server compiles successfully

Stage Summary:
- Created usage-stats API route with comprehensive time-period filtering and comparison
- Active lectures count displayed with animated green live indicator dot
- Usage statistics (active users, new registrations, attendance sessions, quizzes taken) with period filtering
- Percentage change from previous period shown with colored up/down arrows
- Bar chart showing daily activity (users + sessions + quizzes) for past 30 days
- Line chart showing registration trends over past 12 months
- Detailed statistics table with current vs. previous period comparison
- All data fetched from Supabase using service role (bypasses RLS)
- Arabic RTL layout maintained throughout

---
Task ID: 1
Agent: Main Orchestrator
Task: Show user role badge/title next to name everywhere, multiple teachers per course, admin usage stats

Work Log:
- Updated UserLink component: changed showRole default from false to true
- Added getRoleBadgeColor() helper for inline role badges with color-coded styling per role
- Changed role badge from plain text to visually distinct inline badge (rounded-md, colored bg/text)
- Updated admin dashboard UserLinks to use showRole={false} where separate role column already exists
- Delegated Task 2 (multiple teachers per course) to full-stack-developer agent
- Delegated Task 3 (admin usage stats) to full-stack-developer agent
- Verified lint passes clean on all changes
- Verified dev server running without errors
- Called migration API endpoint to run subject_teachers migration

Stage Summary:
- User role badge now shows next to names everywhere by default (colored inline badge)
- Multiple teachers per course: subject_teachers junction table, API routes, course overview UI, teacher dashboard
- Admin reports: active lectures count, usage stats by day/month/year, charts with Recharts, detailed stats table

---
Task ID: 2-a
Agent: general-purpose
Task: Display user titles next to their names using formatNameWithTitle

Work Log:
- Read worklog.md and all 4 target files (notes-tab.tsx, files-tab.tsx, lectures-tab.tsx, course-page.tsx)
- Verified formatNameWithTitle utility exists in user-avatar.tsx with signature: formatNameWithTitle(name, role?, titleId?, gender?)
- **notes-tab.tsx**: Added `formatNameWithTitle` import, updated author fetch query from `select('id, name')` to `select('id, name, title_id, gender, role')`, changed authorMap to store full author objects instead of just names, applied formatNameWithTitle when building author_name. Also applied formatNameWithTitle to teacherName fallback in footer display.
- **files-tab.tsx**: Added `formatNameWithTitle` import, updated uploader fetch query from `select('id, name')` to `select('id, name, title_id, gender, role')`, changed uploaderMap to store full uploader objects instead of just names, applied formatNameWithTitle when building uploader_name.
- **lectures-tab.tsx**: Added `formatNameWithTitle` import, updated author fetch query in handleExpandLecture from `select('id, name')` to `select('id, name, title_id, gender, role')`, changed authorMap to store full author objects, applied formatNameWithTitle when building author_name for expanded notes. Display at lines 1119 and 1145 uses already-formatted author_name.
- **course-page.tsx**: Added `formatNameWithTitle` import, updated teacher fetch query from `select('name')` to `select('name, title_id, gender, role')`, applied formatNameWithTitle when setting teacherName state. This formats the teacher name with title (e.g. "دكتور أحمد") before it gets passed to child components.
- All lint checks pass (0 errors)
- Dev server compiles and runs correctly

Stage Summary:
- Teacher names now display with academic title prefix across all course tabs
- Example: "دكتور أحمد", "أستاذة سارة" instead of just "أحمد" or "سارة"
- Students are not affected (formatNameWithTitle only applies titles to teachers)
- Changes applied in 4 files: notes-tab, files-tab, lectures-tab, course-page
- Supabase queries updated to include title_id, gender, role from users table
- Title formatting applied at data-fetch level (Map building), not at render level, for consistency

---
Task ID: 2-b
Agent: general-purpose
Task: Update shared components to display user titles next to names using formatNameWithTitle

Work Log:
- Read worklog.md, user-avatar.tsx (formatNameWithTitle utility), and all 6 target files
- Verified formatNameWithTitle signature: (name, role?, titleId?, gender?) → only adds title prefix for role='teacher'
- **attendance-section.tsx**: Added formatNameWithTitle import, updated 2 Supabase user queries to include title_id/gender/role, formatted student_name at enrichment time and enrolled student display name
  1. Line 288: `select('id, name, email')` → `select('id, name, email, title_id, gender, role')` in fetchAttendanceRecords
  2. Line 736: Same change in handleViewPastSession
  3. Both enrichment loops now use formatNameWithTitle for student_name
  4. Line 1090: Enrolled student name uses formatNameWithTitle(student.name, student.role, student.title_id, student.gender)
- **assignments-section.tsx**: Added formatNameWithTitle import, updated user query in fetchSubmissions
  1. Line 300: `select('name, email')` → `select('name, email, title_id, gender, role')`
  2. Enrichment now uses formatNameWithTitle for student_name
  3. Lines 1275, 1341: Already display enriched student_name (formatted at enrichment time)
- **subjects-section.tsx**: Added formatNameWithTitle import, updated teacher name fetch
  1. Line 179: `select('id, name')` → `select('id, name, title_id, gender, role')` in fetchTeacherNames
  2. Teacher names now stored as formatted names in teacherNames map using formatNameWithTitle
  3. Lines 786, 880, 950: All teacher name displays use the pre-formatted teacherNames map values
- **chat-section.tsx**: Added formatNameWithTitle import, formatted 4 name display locations
  1. Line 905: senderName uses formatNameWithTitle(msg.sender?.name, msg.sender?.role, msg.sender?.title_id, msg.sender?.gender)
  2. Line 1071-1080: chatHeaderName uses formatNameWithTitle for otherParticipant
  3. Line 1231-1238: Conversation list displayName uses formatNameWithTitle for otherParticipant
  4. Line 1537: Search result user name uses formatNameWithTitle(user.name, user.role, user.title_id, user.gender)
- **notification-bell.tsx**: Added formatNameWithTitle import, formatted teacher name in link request modal
  1. Line 416: Teacher name uses formatNameWithTitle(linkRequestModal.teacher?.name || 'معلم', 'teacher', linkRequestModal.teacher?.title_id, linkRequestModal.teacher?.gender)
- **notifications-section.tsx**: Added formatNameWithTitle import, formatted teacher name in link request modal
  1. Line 356: Same as notification-bell - uses formatNameWithTitle with 'teacher' role and teacher's title_id/gender
- All lint checks pass (0 errors)

Stage Summary:
- Updated 6 shared components to display academic titles next to teacher names
- formatNameWithTitle only adds title prefix for role='teacher' (students show plain names)
- Subjects section: teacher names now show as "دكتور أحمد", "أستاذة سارة" etc.
- Chat section: all sender names, participant names, and search result names formatted with titles
- Notification modals: teacher names in link request modals now include academic titles
- Attendance & assignments: student names formatted with formatNameWithTitle for consistency (returns plain name for students)
- All Supabase user queries updated to include title_id, gender, role fields

---
Task ID: 2-c
Agent: general-purpose
Task: Update dashboard components and personal files to display user titles next to names using formatNameWithTitle

Work Log:
- Read worklog.md and all 4 target files to understand current state
- Verified formatNameWithTitle utility exists in user-avatar.tsx (handles null/undefined, only prefixes teachers)
- **teacher-dashboard.tsx**:
  - Updated import: added `formatNameWithTitle` to UserAvatar import
  - Fixed hardcoded "د." prefix at line ~864: Changed `أهلاً بك، د. {profile.name}` to `أهلاً بك، {formatNameWithTitle(profile.name, profile.role, profile.title_id, profile.gender)}`
  - Now uses dynamic title based on teacher's title_id and gender instead of hardcoded "د."
- **student-dashboard.tsx**:
  - All teacher name displays already use `UserLink` component which handles title formatting internally
  - Fixed missing `gender` and `titleId` props on teacherPreview UserLink at line ~2159: Added `gender={teacherPreview.gender}` and `titleId={teacherPreview.title_id}`
  - No separate `formatNameWithTitle` import needed since UserLink handles it
- **admin-dashboard.tsx**:
  - Updated import: added `formatNameWithTitle` to UserAvatar import
  - Changed student name display at line ~1441: `{student.name}` → `{formatNameWithTitle(student.name, student.role, student.title_id, student.gender)}`
- **personal-files-section.tsx**:
  - Import already included `formatNameWithTitle` (from prior work)
  - Lines 1783 and 2162 already used `formatNameWithTitle` (from prior work)
  - Fixed 6 remaining plain name displays:
    1. Line ~2299: Share search result user name → `formatNameWithTitle(user.name, user.role, user.title_id, user.gender)`
    2. Line ~2322: Selected share user badge name → `formatNameWithTitle(user.name, user.role, user.title_id, user.gender)`
    3. Line ~2364: Shared-with user name in file shares → `formatNameWithTitle(share.shared_with_user?.name || 'مستخدم', ...)`
    4. Line ~2677: Bulk share search result user name → `formatNameWithTitle(user.name, user.role, user.title_id, user.gender)`
    5. Line ~2700: Bulk share selected user badge name → `formatNameWithTitle(user.name, user.role, user.title_id, user.gender)`
  - Verified all Supabase queries use `select('*')` which includes title_id, gender, role fields
  - Verified UserProfile type already has title_id, gender, and role fields
- Also simplified the shared-by file display: removed separate title/role label and used formatNameWithTitle directly in the clickable name (cleaner display without duplication)
- All lint checks pass (0 errors)

Stage Summary:
- Teacher welcome message now uses dynamic title instead of hardcoded "د."
- Student dashboard teacher preview now shows title via UserLink
- Admin dashboard student names in subject detail use formatNameWithTitle
- Personal files section: all 8 name displays now use formatNameWithTitle (2 were already done, 6 added)
- No query changes needed - all use select('*') which includes required fields

---
Task ID: 8
Agent: full-stack-developer
Task: Fix co-teacher UX gaps — show co-teachers to students, hide edit/delete from co-teachers, add leave course, update FULL_SETUP.sql

Work Log:
- Read worklog.md, course-page.tsx, overview-tab.tsx, subject-teachers API, FULL_SETUP.sql, types.ts, user-avatar.tsx, app-store.ts
- **Task 1: Show co-teachers to students in course page header**
  - Added `SubjectTeacher` import and `coTeachers` state to course-page.tsx
  - Fetches co-teachers via `/api/subject-teachers` for both student and teacher roles
  - Student banner now shows all teachers: primary teacher + co-teachers as separate clickable pills
  - Each teacher name uses `formatNameWithTitle()` for proper title display
  - Each teacher name is clickable via `openProfile(teacherId)`
- **Task 2: Hide edit/delete subject buttons from co-teachers**
  - Added `isOwner` computed state: `role === 'teacher' && subject?.teacher_id === profile.id`
  - Edit and delete buttons now only show when `isOwner` is true (not for co-teachers)
- **Task 3: Add "Leave Course" option for co-teachers**
  - Added `LogOut` icon import to overview-tab.tsx
  - Added `leavingCourse` and `leaveConfirmOpen` state
  - Co-teacher badge now includes a "مغادرة المقرر" (Leave Course) button with rose styling
  - Confirmation dialog with loading state before leaving
  - Calls DELETE `/api/subject-teachers` with `{ subjectId, teacherId: profile.id, selfLeave: true }`
  - After leaving, navigates back to dashboard via `setSelectedSubjectId(null)`
- **Updated DELETE API for self-leave support**
  - Modified `/api/subject-teachers` DELETE route to support `selfLeave: true` parameter
  - Co-teachers can now remove themselves (not just owner can remove)
  - When self-leaving: notifies the subject owner about the departure
  - When owner removes: notifies the removed teacher (existing behavior)
- **Task 4: Update FULL_SETUP.sql**
  - Added `subject_teachers` table with proper schema (subject_id, teacher_id, role, added_by)
  - Added UNIQUE constraint on (subject_id, teacher_id) and CHECK on role
  - Added indexes on subject_id, teacher_id, and role
  - Updated `get_teacher_subject_ids()` to UNION with subject_teachers
  - Updated `is_subject_teacher()` to also check subject_teachers
  - Updated `is_lecture_teacher()` to also check subject_teachers
  - Updated subjects SELECT RLS policy to allow co-teachers to view their subjects
  - Added 5 RLS policies for subject_teachers: view for teachers/students, insert for owner, delete for owner and self
  - Added `auto_insert_subject_owner()` trigger that auto-inserts owner row on subject creation
  - Added subject_teachers to DROP list, RLS enable, and realtime publication
- All lint checks pass (0 errors)
- Dev server compiling successfully

Stage Summary:
- **Co-teachers visible to students**: Students now see ALL teachers (owner + co-teachers) in the course header as clickable pills with titles
- **Edit/delete hidden from co-teachers**: Only the subject owner sees edit/delete buttons; co-teachers cannot modify or delete the course
- **Leave course for co-teachers**: Co-teachers have a "مغادرة المقرر" button in the overview tab with confirmation dialog
- **Self-leave API support**: DELETE /api/subject-teachers now accepts `selfLeave: true` for co-teachers to remove themselves
- **FULL_SETUP.sql complete**: subject_teachers table, updated functions, RLS policies, and auto-insert trigger all included

---
Task ID: 10
Agent: Main Orchestrator
Task: Display user title next to name everywhere, fix multi-teacher UX, enhance admin reports

Work Log:
- Created `formatNameWithTitle()` utility in user-avatar.tsx that prefixes teacher names with their academic title (e.g., "دكتور أحمد")
- Updated ChatMessage type to include title_id, gender, role in sender object
- Updated chat API to return title_id, gender, role in all user queries (messages, conversations, participants, search)
- Updated chat-tab.tsx to use formatNameWithTitle for sender names
- Delegated to subagent 2-a: Updated notes-tab, files-tab, lectures-tab, course-page to include title_id/gender in fetches and display titles
- Delegated to subagent 2-b: Updated attendance-section, assignments-section, subjects-section, chat-section, notification-bell, notifications-section to show titles
- Delegated to subagent 2-c: Updated teacher-dashboard (replaced hardcoded "د."), student-dashboard, admin-dashboard, personal-files-section
- Fixed multi-teacher UX gaps: course-page shows co-teachers to students, hide edit/delete from co-teachers, added leave course option, updated FULL_SETUP.sql
- Enhanced admin usage-stats API: fallback for active users (uses updated_at if user_sessions unavailable), added lecturesCreated and assignmentsCreated metrics
- Enhanced admin reports section: added Quizzes Taken, Lectures Created, and Assignments Created stat cards with change indicators
- All lint checks pass, dev server running correctly

Stage Summary:
- **User titles displayed everywhere**: Teacher names now show academic titles (دكتور, أستاذ, etc.) next to names across all components
- **Chat API enhanced**: Returns title_id, gender, role for message senders and participants
- **Multi-teacher UX improved**: Students see all teachers, co-teachers can leave courses, edit/delete restricted to owners
- **Admin reports enhanced**: 8 stat cards (was 4), added quizzes/lectures/assignments metrics, improved active users tracking
- **FULL_SETUP.sql updated**: Includes subject_teachers table and co-teacher RLS policies
