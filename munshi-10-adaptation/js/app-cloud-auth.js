// ---------- ONE-TIME LEGACY MIGRATION ----------
// Earlier versions of this app kept everything in localStorage.guestEntries.
// Anything still in this browser is pushed to the cloud once, then the
// local copy is removed for good — the server is the only store now. If
// the push fails, the local data is left untouched and this runs again
// next load.
async function migrateLegacyLocalData(){
  if(!sb) return;
  let legacy = null;
  try{
    const raw = localStorage.getItem('guestEntries');
    legacy = raw ? JSON.parse(raw) : null;
  }catch(e){ return; }
  if(!Array.isArray(legacy) || legacy.length === 0){
    if(legacy !== null){ try{ localStorage.removeItem('guestEntries'); }catch(e){ /* nothing to clean */ } }
    return;
  }
  try{
    for(const e of legacy){
      e.id = e.id || uid('g');
      (e.rooms || []).forEach(r=>{ r.id = r.id || uid('r'); });
      (e.payments || []).forEach(p=>{ p.id = p.id || uid('p'); });
      const { error } = await sb.from('guests').upsert(guestPayload(e), { onConflict: 'id' });
      if(error) throw error;
      if((e.rooms || []).length){
        const { error: rErr } = await sb.from('booking_rooms').upsert(e.rooms.map(r=> roomPayload(e, r)), { onConflict: 'id' });
        if(rErr) throw rErr;
      }
      if((e.payments || []).length){
        const { error: pErr } = await sb.from('guest_payments').upsert(e.payments.map(p=> paymentPayload(e, p)), { onConflict: 'id' });
        if(pErr) throw pErr;
      }
    }
    localStorage.removeItem('guestEntries');
  }catch(e){
    console.error('Legacy local-data migration failed — keeping the local copy and trying again next load', e);
  }
}

// ---------- LOGIN ----------
// A plain users table in Supabase, not Supabase Auth (same account as the
// old tracker). The password never leaves the database — check_login()
// only ever returns true/false. Signing in once is remembered for this
// browser tab's session (survives a refresh, asks again after the browser
// is fully closed and reopened).
const LOGIN_SESSION_KEY = 'guest_system_logged_in_v1';

// ---- Account roles ----
// 'admin' — full access. 'staff' — everything EXCEPT editing mode: the
// "✎ Edit This Entry" feature is completely unavailable (button hidden AND
// every code path into it blocked). The role comes from the server with
// each sign-in — it is never typed or chosen in the browser.
let currentUser = null; // { username, role }

function isAdmin(){
  return !!currentUser && currentUser.role === 'admin';
}

function applyRolePermissions(){
  const editBtn = document.getElementById('editEntryBtn');
  if(editBtn) editBtn.style.display = isAdmin() ? '' : 'none';
  const dayLockNav = document.getElementById('navDayLock');
  if(dayLockNav) dayLockNav.style.display = isAdmin() ? '' : 'none';
  const auditNav = document.getElementById('navAudit');
  if(auditNav) auditNav.style.display = isAdmin() ? '' : 'none';
  const deleteEntityNav = document.getElementById('navDeleteEntity');
  if(deleteEntityNav) deleteEntityNav.style.display = isAdmin() ? '' : 'none';
  const who = document.getElementById('whoami');
  if(who) who.textContent = currentUser ? currentUser.username + ' · ' + currentUser.role : '';
  const mnUser = document.getElementById('mnUser');
  if(mnUser) mnUser.textContent = currentUser ? currentUser.username : '';
}

// Returns the account's role string on success, false on wrong
// credentials, null when the server can't even be reached.
async function checkLogin(username, password){
  if(!sb) return null; // cloud not reachable at all — can't verify anyone
  try{
    const { data, error } = await sb.rpc('check_login_role', { p_username: username, p_password: password });
    if(error) throw error;
    return (typeof data === 'string' && data) ? data : false;
  }catch(e){
    console.error('Login check failed', e);
    return null; // couldn't even reach the server — different message than "wrong password"
  }
}

async function attemptLogin(){
  const loginError = document.getElementById('loginError');
  const loginBtn = document.getElementById('loginBtn');
  const username = document.getElementById('loginUsername').value.trim();
  const password = document.getElementById('loginPassword').value;
  if(!username || !password){ loginError.textContent = 'Enter both username and password.'; return; }
  loginBtn.disabled = true;
  loginBtn.textContent = 'Checking…';
  const role = await checkLogin(username, password);
  loginBtn.disabled = false;
  loginBtn.textContent = 'Sign In';
  if(typeof role === 'string'){
    currentUser = { username, role };
    try{ sessionStorage.setItem(LOGIN_SESSION_KEY, JSON.stringify(currentUser)); }catch(e){ /* best effort */ }
    loginError.textContent = '';
    showApp();
  } else if(role === null){
    loginError.textContent = 'Couldn\'t reach the server — check your internet connection and try again.';
  } else {
    loginError.textContent = 'Wrong username or password.';
  }
}

async function startApp(){
  if(appStarted) return;
  appStarted = true;
  updateCloudIndicator();
  setLoadingOverlay(true, 'Fetching the latest data from the cloud database…');
  rerenderActiveView(); // paints the "Loading…" state behind the overlay
  await migrateLegacyLocalData();
  pullFreshFromCloud();
}

function showApp(){
  applyRolePermissions();
  document.getElementById('loginOverlay').classList.add('hidden');
  document.getElementById('appRoot').style.display = '';
  startApp();
}

document.getElementById('loginBtn').addEventListener('click', attemptLogin);
document.getElementById('loginPassword').addEventListener('keydown', ev=>{ if(ev.key === 'Enter'){ ev.preventDefault(); attemptLogin(); } });
document.getElementById('loginUsername').addEventListener('keydown', ev=>{ if(ev.key === 'Enter'){ ev.preventDefault(); document.getElementById('loginPassword').focus(); } });
function handleSignOut(){
  if(pendingPushIds.size > 0 && !confirm('Some saves have not reached the cloud database yet. Sign out anyway?')) return;
  try{ sessionStorage.removeItem(LOGIN_SESSION_KEY); }catch(e){ /* best effort */ }
  location.reload();
}
document.getElementById('logoutBtn').addEventListener('click', handleSignOut);
document.getElementById('mnLogoutBtn').addEventListener('click', handleSignOut);

// start with 1 room row and 1 payment row
addRow();
addPayRow();

// ---------- INITIAL LOAD ----------
(function init(){
  // the remembered session must carry a server-issued role — anything
  // older/unreadable (e.g. the pre-roles format) means signing in again
  try{
    const raw = sessionStorage.getItem(LOGIN_SESSION_KEY);
    if(raw){
      const parsed = JSON.parse(raw);
      if(parsed && parsed.username && (parsed.role === 'admin' || parsed.role === 'staff')){
        currentUser = parsed;
      } else {
        sessionStorage.removeItem(LOGIN_SESSION_KEY);
      }
    }
  }catch(e){
    try{ sessionStorage.removeItem(LOGIN_SESSION_KEY); }catch(e2){ /* best effort */ }
  }
  updateCloudIndicator();
  if(currentUser){
    showApp();
  } else {
    document.getElementById('loginUsername').focus();
  }
})();
