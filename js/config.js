// SATV config (public anon key is meant to be public)
export const CONFIG = {
  SUPABASE_URL: "https://movapi.solargentinotv.com.ar",
  SUPABASE_ANON_KEY: "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImVrc2dhcWdha3p3dnFjdGVra2dqIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzA5NTAwMzIsImV4cCI6MjA4NjUyNjAzMn0.dnJMB_Orqu_ldP7ODcs-VpZduaGPUEbe2u-yYJXk9Fc",
  APP_NAME: "SATV+",
  // Optional: restrict Upload page to admins only (email match)
  ADMIN_EMAILS: [
    // "you@example.com"
  ],
  // Save progress throttle (ms)
  PROGRESS_THROTTLE_MS: 5000,
  // Consider as "watched" and hide from Continue Watching if near end (seconds)
  NEAR_END_SECONDS: 45
};