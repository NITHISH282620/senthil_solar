-- ============================================================
-- Migration 003: Auto Create Profile Trigger
-- ============================================================

-- Function to handle new user signups
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  is_first_user boolean;
  assigned_role text;
  emp_seq_id text;
BEGIN
  -- Check if this is the very first user in the database
  SELECT NOT EXISTS(SELECT 1 FROM profiles) INTO is_first_user;
  
  -- Assign role: admin for the first user, employee for everyone else
  assigned_role := CASE WHEN is_first_user THEN 'admin' ELSE 'employee' END;
  
  -- Attempt to use the existing sequence generator if available, fallback otherwise
  BEGIN
    emp_seq_id := public.next_sequence('employee', 'SOL');
  EXCEPTION WHEN OTHERS THEN
    -- Fallback simple ID if sequence function fails
    emp_seq_id := 'SOL-' || to_char(now(), 'YYYY') || '-' || lpad(cast(floor(random() * 10000) as text), 4, '0');
  END;

  INSERT INTO public.profiles (
    id,
    employee_id,
    full_name,
    email,
    role,
    is_active
  ) VALUES (
    new.id,
    emp_seq_id,
    COALESCE(new.raw_user_meta_data->>'full_name', 'New User'),
    new.email,
    assigned_role,
    true
  );
  
  RETURN new;
END;
$$;

-- Trigger to call the function after a user is inserted into auth.users
DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();
