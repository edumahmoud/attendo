import { NextResponse } from 'next/server';
import { supabaseServer, isSupabaseServerConfigured } from '@/lib/supabase-server';

const AVATAR_BUCKET = 'avatars';
const MAX_FILE_SIZE = 2 * 1024 * 1024; // 2MB

/**
 * Ensure the avatars storage bucket exists, creating it if necessary.
 * Uses the service role key for admin operations.
 */
async function ensureAvatarBucketExists(): Promise<{ success: boolean; error?: string }> {
  try {
    const { data: buckets, error: listError } = await supabaseServer.storage.listBuckets();
    if (listError) {
      console.error('[AVATAR] List buckets error:', listError);
      return { success: false, error: 'فشل في التحقق من التخزين' };
    }

    const bucketExists = buckets?.some((b) => b.name === AVATAR_BUCKET);

    if (!bucketExists) {
      console.log(`[AVATAR] Creating storage bucket: ${AVATAR_BUCKET}`);
      const { error: createError } = await supabaseServer.storage.createBucket(AVATAR_BUCKET, {
        public: true,
        fileSizeLimit: MAX_FILE_SIZE,
      });

      if (createError) {
        console.error('[AVATAR] Bucket creation error:', createError);
        // Bucket might have been created by another request in the meantime
        const { data: recheckBuckets } = await supabaseServer.storage.listBuckets();
        if (!recheckBuckets?.some((b) => b.name === AVATAR_BUCKET)) {
          return { success: false, error: 'فشل في إنشاء حاوية التخزين' };
        }
      }
      console.log(`[AVATAR] Storage bucket "${AVATAR_BUCKET}" created successfully`);
    }

    // Ensure bucket is public
    try {
      const { data: bucketData } = await supabaseServer.storage.getBucket(AVATAR_BUCKET);
      if (bucketData && !bucketData.public) {
        await supabaseServer.storage.updateBucket(AVATAR_BUCKET, { public: true });
        console.log(`[AVATAR] Updated bucket "${AVATAR_BUCKET}" to public`);
      }
    } catch (policyErr) {
      console.warn('[AVATAR] Could not verify/update bucket visibility:', policyErr);
    }

    return { success: true };
  } catch (err) {
    console.error('[AVATAR] ensureAvatarBucketExists error:', err);
    return { success: false, error: 'خطأ في إعداد التخزين' };
  }
}

export async function POST(request: Request) {
  try {
    if (!isSupabaseServerConfigured) {
      console.error('[AVATAR] Server not configured - missing SUPABASE_SERVICE_ROLE_KEY');
      return NextResponse.json({ success: false, error: 'Service key not configured' }, { status: 400 });
    }

    const formData = await request.formData();
    const file = formData.get('avatar') as File;
    const userId = formData.get('userId') as string;

    if (!file || !userId) {
      return NextResponse.json({ success: false, error: 'Missing required fields' }, { status: 400 });
    }

    console.log('[AVATAR] Upload request - userId:', userId, 'file:', file.name, 'size:', file.size, 'type:', file.type);

    // Validate file size (2MB max)
    if (file.size > MAX_FILE_SIZE) {
      return NextResponse.json({ success: false, error: 'حجم الصورة يجب أن يكون أقل من 2 ميجابايت' }, { status: 400 });
    }

    // Validate file type
    const allowedTypes = ['image/jpeg', 'image/png', 'image/webp', 'image/gif'];
    if (!allowedTypes.includes(file.type)) {
      return NextResponse.json({ success: false, error: 'نوع الصورة غير مدعوم. استخدم JPG أو PNG أو WebP' }, { status: 400 });
    }

    // Ensure bucket exists before upload
    const bucketResult = await ensureAvatarBucketExists();
    if (!bucketResult.success) {
      console.error('[AVATAR] Bucket check failed:', bucketResult.error);
      return NextResponse.json({ success: false, error: bucketResult.error || 'فشل في إعداد حاوية التخزين' }, { status: 500 });
    }

    const fileExt = file.name.split('.').pop() || 'jpg';
    const storagePath = `${userId}/${Date.now()}.${fileExt}`;

    // Convert file to Buffer for server-side upload
    const fileBuffer = Buffer.from(await file.arrayBuffer());

    // Upload to Supabase Storage using service role (bypasses RLS)
    const { error: uploadError } = await supabaseServer.storage
      .from(AVATAR_BUCKET)
      .upload(storagePath, fileBuffer, {
        contentType: file.type,
        upsert: true,
      });

    if (uploadError) {
      console.error('[AVATAR] Storage upload error:', uploadError);
      return NextResponse.json({ success: false, error: `فشل في رفع الصورة: ${uploadError.message}` }, { status: 500 });
    }

    // Get public URL
    const { data: urlData } = supabaseServer.storage
      .from(AVATAR_BUCKET)
      .getPublicUrl(storagePath);

    const publicUrl = urlData?.publicUrl ? `${urlData.publicUrl}?t=${Date.now()}` : '';

    // Update user profile
    const { error: updateError } = await supabaseServer
      .from('users')
      .update({ avatar_url: publicUrl })
      .eq('id', userId);

    if (updateError) {
      console.error('[AVATAR] Profile update error:', updateError);
      return NextResponse.json({ success: false, error: 'فشل في تحديث الملف الشخصي' }, { status: 500 });
    }

    console.log('[AVATAR] Avatar uploaded successfully for user:', userId);
    return NextResponse.json({ success: true, avatarUrl: publicUrl });
  } catch (err) {
    console.error('[AVATAR] Unexpected error:', err);
    return NextResponse.json({ success: false, error: 'Server error' }, { status: 500 });
  }
}
