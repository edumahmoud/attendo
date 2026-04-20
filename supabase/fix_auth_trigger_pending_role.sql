-- =====================================================
-- Fix Auth Trigger: Use 'pending' instead of 'student' as default role
-- This ensures new users must select their role before accessing the app
-- =====================================================

-- Update the auth trigger function
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER AS $$
BEGIN
  INSERT INTO public.users (id, email, name, role)
  VALUES (
    NEW.id,
    NEW.email,
    COALESCE(NEW.raw_user_meta_data->>'name', split_part(NEW.email, '@', 1)),
    COALESCE(NEW.raw_user_meta_data->>'role', 'pending')
  );
  RETURN NEW;
EXCEPTION WHEN OTHERS THEN
  -- If insert fails (e.g., duplicate), just return NEW
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Update existing users who have 'student' role but never explicitly chose it
-- This is optional - only run if you want existing auto-assigned students to re-choose
-- UPDATE public.users SET role = 'pending' WHERE role = 'student' AND created_at > '2025-01-01';
