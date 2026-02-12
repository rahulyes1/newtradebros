import { createClient } from '@supabase/supabase-js'

const supabaseUrl = 'https://uayndnivinhzqzvywuzi.supabase.co'
const supabaseAnonKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InVheW5kbml2aW5oenF6dnl3dXppIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzA5MDkxNjMsImV4cCI6MjA4NjQ4NTE2M30.DcH-aQqj12d5PW2FDBGuNar2CpI7ecFmp7QbBM0fug0'

export const supabase = createClient(supabaseUrl, supabaseAnonKey)
