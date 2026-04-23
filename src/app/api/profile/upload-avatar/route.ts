// =====================================================
// /api/profile/upload-avatar — Avatar Upload
// =====================================================
// Uploads a user's profile picture to Supabase Storage (avatars bucket).
// Strategy:
//   - Uses the SERVICE ROLE key for storage operations (bypasses RLS)
//   - Uses the USER'S JWT for database operations (respects RLS)
// This split is necessary because the service_role key may not have
// schema-level permissions on the public schema for DB operations.

import { NextRequest, NextResponse } from 'next/server';
import { supabaseServer, isSupabaseServerConfigured } from '@/lib/supabase-server';
import { getAuthenticatedUser } from '@/lib/supabase-auth';

const AVATAR_BUCKET = 'avatars';
const MAX_FILE_SIZE = 2 * 1024 * 1024; // 2MB

/**
 * Ensure the avatars storage bucket exists and is public.
 */
async function ensureAvatarBucketExists(): Promise<{ success: boolean; error?: string; detail?: string }> {
  try {
    const { data: buckets, error: listError } = await supabaseServer.storage.listBuckets();
    if (listError) {
      return {
        success: false,
        error: 'فشل في التحقق من التخزين',
        detail: `Supabase listBuckets() failed: ${listError.message}`,
      };
    }

    const bucketExists = buckets?.some((b) => b.name === AVATAR_BUCKET);

    if (!bucketExists) {
      console.log(`[AVATAR] Creating storage bucket: ${AVATAR_BUCKET}`);
      const { error: createError } = await supabaseServer.storage.createBucket(AVATAR_BUCKET, {
        public: true,
        fileSizeLimit: MAX_FILE_SIZE,
      });

      if (createError) {
        const { data: recheckBuckets } = await supabaseServer.storage.listBuckets();
        if (!recheckBuckets?.some((b) => b.name === AVATAR_BUCKET)) {
          return {
            success: false,
            error: 'فشل في إنشاء حاوية التخزين',
            detail: `Could not create "${AVATAR_BUCKET}" bucket: ${createError.message}. Please create it manually in the Supabase Dashboard.`,
          };
        }
      }
      console.log(`[AVATAR] Storage bucket "${AVATAR_BUCKET}" created successfully`);
    }

    // Ensure bucket is public
    try {
      const { data: bucketData } = await supabaseServer.storage.getBucket(AVATAR_BUCKET);
      if (bucketData && !bucketData.public) {
        await supabaseServer.storage.updateBucket(AVATAR_BUCKET, { public: true });
      }
    } catch {
      // non-critical
    }

    return { success: true };
  } catch (err) {
    return {
      success: false,
      error: 'خطأ في إعداد التخزين',
      detail: `Unexpected error: ${err instanceof Error ? err.message : String(err)}`,
    };
  }
}

/**
 * Remove old avatar files for a user before uploading a new one.
 */
async function cleanupOldAvatars(userId: string): Promise<void> {
  try {
    const { data: files } = await supabaseServer.storage
      .from(AVATAR_BUCKET)
      .list(userId, { limit: 100 });

    if (!files || files.length === 0) return;

    const pathsToRemove = files.filter((f) => f.id).map((f) => `${userId}/${f.name}`);
    if (pathsToRemove.length > 0) {
      await supabaseServer.storage.from(AVATAR_BUCKET).remove(pathsToRemove);
    }
  } catch {
    // non-critical
  }
}

export async function POST(request: NextRequest) {
  try {
    if (!isSupabaseServerConfigured) {
      return NextResponse.json(
        { success: false, error: 'خدمة التخزين غير مُعدة. يرجى إضافة SUPABASE_SERVICE_ROLE_KEY في ملف .env' },
        { status: 500 }
      );
    }

    // Authenticate the user via JWT token
    const authResult = await getAuthenticatedUser(request);

    let userId: string;
    let userSupabase: typeof authResult extends null ? never : NonNullable<typeof authResult>['supabase'];

    if (authResult) {
      // Authenticated request — use the user's identity
      userId = authResult.user.id;
      userSupabase = authResult.supabase;
    } else {
      // Fallback: extract userId from form data (legacy support)
      // This path is less secure and may fail for DB operations due to RLS
      console.warn('[AVATAR] No auth token provided, falling back to form data userId');

      let formData: FormData;
      try {
        formData = await request.formData();
      } catch {
        return NextResponse.json({ success: false, error: 'فشل في قراءة بيانات الطلب' }, { status: 400 });
      }

      const formUserId = formData.get('userId') as string | null;
      if (!formUserId) {
        return NextResponse.json({ success: false, error: 'يرجى تسجيل الدخول أولاً' }, { status: 401 });
      }
      userId = formUserId;
      userSupabase = null as unknown as typeof userSupabase;
    }

    // Parse form data (may already be parsed if auth path didn't consume it)
    let file: File | null = null;
    try {
      // Need to re-parse form data since getAuthenticatedUser doesn't consume it
      const formData = await request.formData();
      file = formData.get('avatar') as File | null;
      // Also check for userId in form data if auth wasn't available
      if (!authResult) {
        const formUserId = formData.get('userId') as string | null;
        if (formUserId) userId = formUserId;
      }
    } catch {
      return NextResponse.json({ success: false, error: 'فشل في قراءة بيانات الطلب' }, { status: 400 });
    }

    if (!file) {
      return NextResponse.json({ success: false, error: 'الصورة مطلوبة' }, { status: 400 });
    }

    console.log('[AVATAR] Upload request - userId:', userId, 'file:', file.name, 'size:', file.size, 'type:', file.type);

    // Validate file size
    if (file.size > MAX_FILE_SIZE) {
      return NextResponse.json({ success: false, error: 'حجم الصورة يجب أن يكون أقل من 2 ميجابايت' }, { status: 400 });
    }

    // Validate file type (with extension fallback)
    const allowedTypes = ['image/jpeg', 'image/png', 'image/webp', 'image/gif'];
    const detectedType = file.type || (
      file.name.toLowerCase().endsWith('.png') ? 'image/png'
        : file.name.toLowerCase().endsWith('.gif') ? 'image/gif'
          : file.name.toLowerCase().endsWith('.webp') ? 'image/webp'
            : 'image/jpeg'
    );

    if (!allowedTypes.includes(detectedType)) {
      return NextResponse.json({ success: false, error: 'نوع الصورة غير مدعوم. استخدم JPG أو PNG أو WebP' }, { status: 400 });
    }

    // Ensure bucket exists
    const bucketResult = await ensureAvatarBucketExists();
    if (!bucketResult.success) {
      return NextResponse.json(
        { success: false, error: bucketResult.error || 'فشل في إعداد حاوية التخزين', detail: bucketResult.detail },
        { status: 500 }
      );
    }

    // Clean up old avatars
    await cleanupOldAvatars(userId);

    const originalExt = file.name.split('.').pop() || '';
    const isAsciiExt = /^[a-zA-Z0-9]+$/.test(originalExt);
    const safeExt = isAsciiExt ? originalExt : 'jpg';
    const storagePath = `${userId}/${Date.now()}.${safeExt}`;

    // Convert file to Buffer
    let fileBuffer: Buffer;
    try {
      fileBuffer = Buffer.from(await file.arrayBuffer());
    } catch {
      return NextResponse.json({ success: false, error: 'فشل في قراءة بيانات الصورة' }, { status: 400 });
    }

    // Upload to Supabase Storage using SERVICE ROLE (bypasses storage RLS)
    console.log('[AVATAR] Uploading to storage path:', storagePath);
    const { data: uploadData, error: uploadError } = await supabaseServer.storage
      .from(AVATAR_BUCKET)
      .upload(storagePath, fileBuffer, {
        contentType: detectedType,
        upsert: true,
      });

    if (uploadError) {
      console.error('[AVATAR] Storage upload error:', uploadError.message);

      let detail = uploadError.message;
      if (uploadError.message?.includes('not found') || uploadError.message?.includes('does not exist')) {
        detail = `The "${AVATAR_BUCKET}" bucket may not exist. Please create it in the Supabase Dashboard or run /api/storage/setup.`;
      }

      return NextResponse.json(
        { success: false, error: `فشل في رفع الصورة: ${uploadError.message}`, detail },
        { status: 500 }
      );
    }

    console.log('[AVATAR] Storage upload successful, path:', uploadData?.path);

    // Get public URL
    const { data: urlData } = supabaseServer.storage
      .from(AVATAR_BUCKET)
      .getPublicUrl(storagePath);

    const publicUrl = urlData?.publicUrl ? `${urlData.publicUrl}?t=${Date.now()}` : '';

    if (!publicUrl) {
      return NextResponse.json({ success: false, error: 'فشل في الحصول على رابط الصورة' }, { status: 500 });
    }

    // Update user profile using the USER'S JWT client (respects RLS)
    console.log('[AVATAR] Updating user profile with avatar URL:', publicUrl);

    let profileUpdated = false;
    let profileWarning = '';

    if (userSupabase) {
      // Use the user's authenticated client for DB operations
      const { data: updateData, error: updateError } = await userSupabase
        .from('users')
        .update({ avatar_url: publicUrl })
        .eq('id', userId)
        .select('id, avatar_url');

      if (updateError) {
        console.error('[AVATAR] User JWT profile update failed:', updateError.message);
        profileWarning = `تم رفع الصورة لكن فشل تحديث الملف الشخصي: ${updateError.message}`;
      } else if (!updateData || updateData.length === 0) {
        console.warn('[AVATAR] Profile update returned no rows. User may not exist in users table.');
        profileWarning = 'تم رفع الصورة لكن المستخدم غير موجود في جدول المستخدمين';
      } else {
        profileUpdated = true;
        console.log('[AVATAR] Profile updated via user JWT');
      }
    } else {
      // Fallback: try service role (may fail with permission denied)
      const { data: updateData, error: updateError } = await supabaseServer
        .from('users')
        .update({ avatar_url: publicUrl })
        .eq('id', userId)
        .select('id, avatar_url');

      if (updateError) {
        console.error('[AVATAR] Service role profile update failed:', updateError.message);
        profileWarning = 'تم رفع الصورة لكن فشل تحديث الملف الشخصي. يرجى إعادة تحميل الصفحة.';
      } else if (!updateData || updateData.length === 0) {
        profileWarning = 'تم رفع الصورة لكن المستخدم غير موجود في جدول المستخدمين';
      } else {
        profileUpdated = true;
      }
    }

    if (profileWarning) {
      return NextResponse.json({
        success: true,
        avatarUrl: publicUrl,
        warning: profileWarning,
      });
    }

    console.log('[AVATAR] Avatar uploaded and profile updated successfully for user:', userId);
    return NextResponse.json({ success: true, avatarUrl: publicUrl });
  } catch (err) {
    console.error('[AVATAR] Unexpected error:', err instanceof Error ? err.message : err);
    return NextResponse.json(
      { success: false, error: `خطأ في الخادم: ${err instanceof Error ? err.message : 'خطأ غير معروف'}` },
      { status: 500 }
    );
  }
}
