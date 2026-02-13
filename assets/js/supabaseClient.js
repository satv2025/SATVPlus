// Supabase client (CDN). Usa la anon key (OK para frontend).
const supabaseUrl = "https://movapi.solargentinotv.com.ar";
const supabaseKey = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImVrc2dhcWdha3p3dnFjdGVra2dqIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzA5NTAwMzIsImV4cCI6MjA4NjUyNjAzMn0.dnJMB_Orqu_ldP7ODcs-VpZduaGPUEbe2u-yYJXk9Fc";

export const supabase = window.supabase.createClient(supabaseUrl, supabaseKey);

// Helpers
export function getActiveProfileId() {
    return localStorage.getItem("satv_active_profile_id");
}
export function setActiveProfileId(id) {
    localStorage.setItem("satv_active_profile_id", id);
}
export function clearActiveProfileId() {
    localStorage.removeItem("satv_active_profile_id");
}