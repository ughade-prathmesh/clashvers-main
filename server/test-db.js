const { createClient } = require('@supabase/supabase-js');
require('dotenv').config();

const supabaseUrl = process.env.SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseUrl || !supabaseKey) {
  console.error("Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY in .env");
  process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseKey);

async function testConnection() {
  console.log("Testing connection to:", supabaseUrl);
  try {
    // Try to fetch current time or just a simple query from a system table or any table
    // A simple test is auth.users but that might fail if not permitted.
    // We can just try to hit the health endpoint or fetch from profiles.
    const { data, error } = await supabase.from('profiles').select('*').limit(1);
    
    if (error) {
      if (error.code === '42P01') {
         console.log("✅ Connection Successful! (But the 'profiles' table doesn't exist yet, which means you need to run the SQL scripts).");
      } else {
         console.error("❌ Connection failed or another error:", error.message);
      }
    } else {
      console.log("✅ Connection Successful! (And the 'profiles' table exists).");
    }
  } catch (err) {
    console.error("❌ Connection failed with exception:", err);
  }
}

testConnection();
