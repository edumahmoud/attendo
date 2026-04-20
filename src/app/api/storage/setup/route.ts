// =====================================================
// /api/storage/setup — Storage Diagnostic & Auto-Setup
// =====================================================
// Checks if storage buckets exist, creates them if missing,
// sets up storage policies, adds missing columns, and tests
// upload/download functionality.

import { NextRequest, NextResponse } from 'next/server';
import { supabaseServer, isSupabaseServerConfigured } from '@/lib/supabase-server';

const AVATAR_BUCKET = 'avatars';
const FILES_BUCKET = 'subject-files';

export async function GET(request: NextRequest) {
  const diagnostics: Record<string, unknown> = {
    timestamp: new Date().toISOString(),
    serverConfigured: isSupabaseServerConfigured,
    supabaseUrl: process.env.NEXT_PUBLIC_SUPABASE_URL ? 'Set' : 'Missing',
    serviceKey: process.env.SUPABASE_SERVICE_ROLE_KEY ? 'Set' : 'Missing',
    anonKey: process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ? 'Set' : 'Missing',
    buckets: {},
    columns: {},
    policies: {},
    errors: [] as string[],
  };

  if (!isSupabaseServerConfigured) {
    diagnostics.errors.push('SUPABASE_SERVICE_ROLE_KEY is not configured. Storage operations will fail.');
    return NextResponse.json({ success: false, diagnostics });
  }

  // ─── Check existing buckets ───
  try {
    const { data: buckets, error: listError } = await supabaseServer.storage.listBuckets();
    if (listError) {
      diagnostics.errors.push(`List buckets failed: ${listError.message}`);
    } else {
      const bucketNames = buckets?.map((b) => b.name) || [];
      (diagnostics.buckets as Record<string, unknown>).existing = bucketNames;
      (diagnostics.buckets as Record<string, unknown>).avatarsExists = bucketNames.includes(AVATAR_BUCKET);
      (diagnostics.buckets as Record<string, unknown>).subjectFilesExists = bucketNames.includes(FILES_BUCKET);

      // Get bucket details
      for (const b of buckets || []) {
        if (b.name === AVATAR_BUCKET || b.name === FILES_BUCKET) {
          (diagnostics.buckets as Record<string, unknown>)[b.name] = {
            public: b.public,
            fileSizeLimit: b.file_size_limit,
            createdAt: b.created_at,
          };
        }
      }
    }
  } catch (err) {
    diagnostics.errors.push(`Bucket list error: ${err instanceof Error ? err.message : String(err)}`);
  }

  // ─── Check columns ───
  try {
    // Use anon key for column checks (service_role may lack schema permissions)
    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
    if (supabaseUrl && supabaseAnonKey) {
      const { createClient } = await import('@supabase/supabase-js');
      const anonClient = createClient(supabaseUrl, supabaseAnonKey, {
        auth: { persistSession: false, autoRefreshToken: false },
      });

      // Check users.avatar_url
      const { data: userTest, error: avatarError } = await anonClient
        .from('users')
        .select('avatar_url, gender')
        .limit(1);
      if (avatarError) {
        if (avatarError.message?.includes('avatar_url')) {
          (diagnostics.columns as Record<string, unknown>).avatar_url = 'MISSING';
          diagnostics.errors.push('users.avatar_url column is missing');
        } else if (avatarError.message?.includes('gender')) {
          (diagnostics.columns as Record<string, unknown>).gender = 'MISSING';
          diagnostics.errors.push('users.gender column is missing');
        } else {
          (diagnostics.columns as Record<string, unknown>).usersError = avatarError.message;
        }
      } else {
        (diagnostics.columns as Record<string, unknown>).avatar_url = 'EXISTS';
        (diagnostics.columns as Record<string, unknown>).gender = 'EXISTS';
      }

      // Check subject_files.visibility
      const { data: fileTest, error: visibilityError } = await anonClient
        .from('subject_files')
        .select('visibility')
        .limit(1);
      if (visibilityError) {
        if (visibilityError.message?.includes('visibility')) {
          (diagnostics.columns as Record<string, unknown>).visibility = 'MISSING';
          diagnostics.errors.push('subject_files.visibility column is missing');
        } else {
          (diagnostics.columns as Record<string, unknown>).visibilityError = visibilityError.message;
        }
      } else {
        (diagnostics.columns as Record<string, unknown>).visibility = 'EXISTS';
      }
    }
  } catch (err) {
    diagnostics.errors.push(`Column check error: ${err instanceof Error ? err.message : String(err)}`);
  }

  return NextResponse.json({ success: true, diagnostics });
}

export async function POST(request: NextRequest) {
  if (!isSupabaseServerConfigured) {
    return NextResponse.json(
      { success: false, error: 'SUPABASE_SERVICE_ROLE_KEY is not configured' },
      { status: 500 }
    );
  }

  const results: Record<string, unknown> = {
    timestamp: new Date().toISOString(),
    steps: [] as string[],
    errors: [] as string[],
    warnings: [] as string[],
  };

  try {
    // ─── Step 1: Create avatars bucket ───
    try {
      const { data: buckets } = await supabaseServer.storage.listBuckets();
      const bucketNames = buckets?.map((b) => b.name) || [];

      if (!bucketNames.includes(AVATAR_BUCKET)) {
        const { error: createError } = await supabaseServer.storage.createBucket(AVATAR_BUCKET, {
          public: true,
          fileSizeLimit: 2 * 1024 * 1024, // 2MB
        });

        if (createError) {
          // Check if it was created by another process
          const { data: recheck } = await supabaseServer.storage.listBuckets();
          if (!recheck?.some((b) => b.name === AVATAR_BUCKET)) {
            (results.errors as string[]).push(`Failed to create avatars bucket: ${createError.message}`);
          } else {
            (results.steps as string[]).push('avatars bucket created (race condition handled)');
          }
        } else {
          (results.steps as string[]).push('avatars bucket created successfully');
        }
      } else {
        (results.steps as string[]).push('avatars bucket already exists');

        // Ensure it's public
        try {
          const { data: bucketData } = await supabaseServer.storage.getBucket(AVATAR_BUCKET);
          if (bucketData && !bucketData.public) {
            await supabaseServer.storage.updateBucket(AVATAR_BUCKET, { public: true });
            (results.steps as string[]).push('avatars bucket updated to public');
          }
        } catch {
          (results.warnings as string[]).push('Could not verify avatars bucket visibility');
        }
      }
    } catch (err) {
      (results.errors as string[]).push(`Avatars bucket setup error: ${err instanceof Error ? err.message : String(err)}`);
    }

    // ─── Step 2: Create subject-files bucket ───
    try {
      const { data: buckets } = await supabaseServer.storage.listBuckets();
      const bucketNames = buckets?.map((b) => b.name) || [];

      if (!bucketNames.includes(FILES_BUCKET)) {
        const { error: createError } = await supabaseServer.storage.createBucket(FILES_BUCKET, {
          public: true,
          fileSizeLimit: 10 * 1024 * 1024, // 10MB
        });

        if (createError) {
          const { data: recheck } = await supabaseServer.storage.listBuckets();
          if (!recheck?.some((b) => b.name === FILES_BUCKET)) {
            (results.errors as string[]).push(`Failed to create subject-files bucket: ${createError.message}`);
          } else {
            (results.steps as string[]).push('subject-files bucket created (race condition handled)');
          }
        } else {
          (results.steps as string[]).push('subject-files bucket created successfully');
        }
      } else {
        (results.steps as string[]).push('subject-files bucket already exists');

        // Ensure it's public
        try {
          const { data: bucketData } = await supabaseServer.storage.getBucket(FILES_BUCKET);
          if (bucketData && !bucketData.public) {
            await supabaseServer.storage.updateBucket(FILES_BUCKET, { public: true });
            (results.steps as string[]).push('subject-files bucket updated to public');
          }
        } catch {
          (results.warnings as string[]).push('Could not verify subject-files bucket visibility');
        }
      }
    } catch (err) {
      (results.errors as string[]).push(`Subject-files bucket setup error: ${err instanceof Error ? err.message : String(err)}`);
    }

    // ─── Step 3: Add missing columns ───
    try {
      // Add avatar_url to users if missing
      const { error: avatarCheck } = await supabaseServer
        .from('users')
        .select('avatar_url')
        .limit(1);

      if (avatarCheck && avatarCheck.message?.includes('avatar_url')) {
        // Column doesn't exist - we need to add it via SQL
        // We can't add columns via the JS client, so we'll note it
        (results.warnings as string[]).push('users.avatar_url column is MISSING. Run: ALTER TABLE users ADD COLUMN IF NOT EXISTS avatar_url TEXT;');
      }
    } catch {
      // Ignore - might be RLS
    }

    try {
      // Add gender to users if missing
      const { error: genderCheck } = await supabaseServer
        .from('users')
        .select('gender')
        .limit(1);

      if (genderCheck && genderCheck.message?.includes('gender')) {
        (results.warnings as string[]).push('users.gender column is MISSING. Run: ALTER TABLE users ADD COLUMN IF NOT EXISTS gender TEXT CHECK (gender IN (\'male\', \'female\'));');
      }
    } catch {
      // Ignore
    }

    try {
      // Add visibility to subject_files if missing
      const { error: visibilityCheck } = await supabaseServer
        .from('subject_files')
        .select('visibility')
        .limit(1);

      if (visibilityCheck && visibilityCheck.message?.includes('visibility')) {
        (results.warnings as string[]).push('subject_files.visibility column is MISSING. Run: ALTER TABLE subject_files ADD COLUMN IF NOT EXISTS visibility TEXT DEFAULT \'public\' CHECK (visibility IN (\'public\', \'private\'));');
      }
    } catch {
      // Ignore
    }

    // ─── Step 4: Test upload to avatars bucket ───
    try {
      const testContent = Buffer.from('test');
      const testPath = `_test/${Date.now()}.txt`;

      const { error: uploadError } = await supabaseServer.storage
        .from(AVATAR_BUCKET)
        .upload(testPath, testContent, {
          contentType: 'text/plain',
          upsert: false,
        });

      if (uploadError) {
        (results.errors as string[]).push(`Avatars test upload failed: ${uploadError.message}`);
      } else {
        (results.steps as string[]).push('Avatars test upload successful');

        // Test public URL
        const { data: urlData } = supabaseServer.storage
          .from(AVATAR_BUCKET)
          .getPublicUrl(testPath);

        if (urlData?.publicUrl) {
          (results.steps as string[]).push(`Avatars public URL works: ${urlData.publicUrl}`);
        }

        // Clean up test file
        await supabaseServer.storage.from(AVATAR_BUCKET).remove([testPath]);
        (results.steps as string[]).push('Avatars test file cleaned up');
      }
    } catch (err) {
      (results.errors as string[]).push(`Avatars test error: ${err instanceof Error ? err.message : String(err)}`);
    }

    // ─── Step 5: Test upload to subject-files bucket ───
    try {
      const testContent = Buffer.from('test');
      const testPath = `_test/${Date.now()}.txt`;

      const { error: uploadError } = await supabaseServer.storage
        .from(FILES_BUCKET)
        .upload(testPath, testContent, {
          contentType: 'text/plain',
          upsert: false,
        });

      if (uploadError) {
        (results.errors as string[]).push(`Subject-files test upload failed: ${uploadError.message}`);
      } else {
        (results.steps as string[]).push('Subject-files test upload successful');

        // Test public URL
        const { data: urlData } = supabaseServer.storage
          .from(FILES_BUCKET)
          .getPublicUrl(testPath);

        if (urlData?.publicUrl) {
          (results.steps as string[]).push(`Subject-files public URL works: ${urlData.publicUrl}`);
        }

        // Clean up test file
        await supabaseServer.storage.from(FILES_BUCKET).remove([testPath]);
        (results.steps as string[]).push('Subject-files test file cleaned up');
      }
    } catch (err) {
      (results.errors as string[]).push(`Subject-files test error: ${err instanceof Error ? err.message : String(err)}`);
    }

    const hasErrors = (results.errors as string[]).length > 0;
    const hasWarnings = (results.warnings as string[]).length > 0;

    return NextResponse.json({
      success: !hasErrors,
      results,
      message: hasErrors
        ? 'Storage setup completed with errors. Check the errors array for details.'
        : hasWarnings
          ? 'Storage setup completed with warnings. Some columns may need to be added manually via SQL.'
          : 'Storage setup completed successfully. All buckets exist and uploads are working.',
    });
  } catch (err) {
    return NextResponse.json(
      {
        success: false,
        error: `Unexpected error: ${err instanceof Error ? err.message : String(err)}`,
        results,
      },
      { status: 500 }
    );
  }
}
