import { NextRequest, NextResponse } from 'next/server';
import { supabaseServer } from '@/lib/supabase-server';

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { userId } = body;

    if (!userId) {
      return NextResponse.json(
        { success: false, error: 'معرف المستخدم مطلوب' },
        { status: 400 }
      );
    }

    // First, fetch the user's email before deleting
    const { data: userRecord } = await supabaseServer
      .from('users')
      .select('email')
      .eq('id', userId)
      .single();

    const userEmail = userRecord?.email;

    // Delete the user from the users table
    const { error } = await supabaseServer
      .from('users')
      .delete()
      .eq('id', userId);

    if (error) {
      console.error('Error deleting user:', error);
      return NextResponse.json(
        { success: false, error: 'حدث خطأ أثناء حذف المستخدم' },
        { status: 500 }
      );
    }

    // Add the user's email to banned_users to prevent re-registration
    if (userEmail) {
      const { error: banError } = await supabaseServer
        .from('banned_users')
        .upsert(
          { email: userEmail, reason: 'تم الحذف بواسطة المشرف' },
          { onConflict: 'email' }
        );

      if (banError) {
        console.error('Error adding to banned_users:', banError);
        // Non-critical: user is already deleted, just log the error
      }
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('Delete user error:', error);
    return NextResponse.json(
      { success: false, error: 'حدث خطأ غير متوقع' },
      { status: 500 }
    );
  }
}
