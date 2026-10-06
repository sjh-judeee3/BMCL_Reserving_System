/* App — root. Manages state, routing, persistence via Google Sheets */
const { useState, useEffect, useMemo, useRef } = React;

// ★★★ Apps Script 배포 후 여기에 URL 붙여넣기 ★★★
const APPS_SCRIPT_URL = 'https://script.google.com/macros/s/AKfycbxetGI0yQ-71l0z2kikKHmmW86raFQGy1OULomikn_N4VxCUsPELdPlRypWAcxZgE9oSA/exec';

const MEMBERS_VERSION = 4;

const DEFAULT_MEMBERS = [
  { id: 'm_juhee',  name: 'juhee',  colorIdx: 0 },
  { id: 'm_suhyun', name: 'suhyun', colorIdx: 1 },
  { id: 'm_jiwon',  name: 'jiwon',  colorIdx: 2 },
  { id: 'm_yunji',  name: 'yunji',  colorIdx: 3 },
  { id: 'm_suheon', name: 'suheon', colorIdx: 4 },
  { id: 'm_yangyang', name: 'yangyang', colorIdx: 5 },
];

// ---- Session (창 닫으면 풀림) ----
function loadSessionMeId() {
  try { return sessionStorage.getItem('lab_gpu_me_session') || null; } catch(e) { return null; }
}
function saveSessionMeId(id) {
  try {
    if (id) sessionStorage.setItem('lab_gpu_me_session', id);
    else sessionStorage.removeItem('lab_gpu_me_session');
  } catch(e) {}
}
function loadGuestFlag() {
  try { return sessionStorage.getItem('lab_gpu_guest') === '1'; } catch(e) { return false; }
}
function saveGuestFlag(on) {
  try {
    if (on) sessionStorage.setItem('lab_gpu_guest', '1');
    else sessionStorage.removeItem('lab_gpu_guest');
  } catch(e) {}
}

// ---- Google Sheets API helpers ----
async function fetchReservations() {
  const res = await fetch(APPS_SCRIPT_URL);
  const data = await res.json();
  return data.reservations || [];
}

// GET-based auth: avoids CORS preflight; returns JSON. (POSTs are fire-and-forget no-cors.)
async function apiAuth(action, memberId, password) {
  const u = new URL(APPS_SCRIPT_URL);
  u.searchParams.set('action', action);
  u.searchParams.set('memberId', memberId);
  u.searchParams.set('password', password);
  const res = await fetch(u.toString());
  return res.json();
}

// GET-based mutations: URL 파라미터로 전송 → CORS/리다이렉트 문제 우회
async function apiGet(params) {
  const u = new URL(APPS_SCRIPT_URL);
  Object.entries(params).forEach(([k, v]) => u.searchParams.set(k, v));
  const res = await fetch(u.toString());
  try { return await res.json(); } catch(e) { return { ok: false }; }
}

const cleanGpuList = (g) => (g || []).map(Number).filter(x => Number.isInteger(x) && x >= 0 && x < GpuUtils.GPU_COUNT);
async function apiCreate(reservation) {
  if (cleanGpuList(reservation.gpus).length === 0) return { ok: false, error: 'no gpus' };
  return apiGet({
    action: 'create',
    id: reservation.id,
    memberId: reservation.memberId,
    name: reservation.name,
    colorIdx: String(reservation.colorIdx),
    startSlot: String(reservation.startSlot),
    endSlot: String(reservation.endSlot),
    gpus: (reservation.gpus || []).join(','),
    note: reservation.note || '',
  });
}
async function apiUpdate(reservation) {
  if (cleanGpuList(reservation.gpus).length === 0) return { ok: false, error: 'no gpus' };
  return apiGet({
    action: 'update',
    id: reservation.id,
    memberId: reservation.memberId,
    name: reservation.name,
    colorIdx: String(reservation.colorIdx),
    startSlot: String(reservation.startSlot),
    endSlot: String(reservation.endSlot),
    gpus: (reservation.gpus || []).join(','),
    note: reservation.note || '',
  });
}
async function apiDelete(id) {
  return apiGet({ action: 'delete', id: String(id) });
}

// ---- Intern schedule API ----
async function fetchInternSeries() {
  const res = await apiGet({ action: 'internList' });
  return (res && Array.isArray(res.events)) ? res.events : [];
}
function internParams(action, s) {
  return {
    action, id: s.id, memberId: s.memberId, creator: s.creator || '',
    startSlot: String(s.startSlot), endSlot: String(s.endSlot),
    intern: s.intern, note: s.note || '',
    recur: JSON.stringify(s.recur || {}), exdates: (s.exdates || []).join(','),
  };
}
const apiInternCreate = (s) => apiGet(internParams('internCreate', s));
const apiInternUpdate = (s) => apiGet(internParams('internUpdate', s));
const apiInternDelete = (id) => apiGet({ action: 'internDelete', id: String(id) });

function loadTab() {
  if (location.hash === '#interns') return 'interns';
  if (location.hash === '#gpu') return 'gpu';
  try { return localStorage.getItem('bmcl_tab') === 'interns' ? 'interns' : 'gpu'; } catch(e) { return 'gpu'; }
}

async function apiAdminReset(adminPassword, targetMemberId) {
  const u = new URL(APPS_SCRIPT_URL);
  u.searchParams.set('action', 'adminResetPassword');
  u.searchParams.set('adminPassword', adminPassword);
  u.searchParams.set('targetMemberId', targetMemberId);
  const res = await fetch(u.toString());
  return res.json();
}

function App() {
  const [members] = useState(DEFAULT_MEMBERS);
  const [reservations, setReservations] = useState([]);
  const [loading, setLoading] = useState(true);
  const [meId, setMeId] = useState(loadSessionMeId);
  const [isGuest, setIsGuest] = useState(loadGuestFlag);
  const [view, setView] = useState('week');
  const [currentDate, setCurrentDate] = useState(new Date());
  const [now, setNow] = useState(new Date());
  const [popover, setPopover] = useState(null);
  const [authDialog, setAuthDialog] = useState(null); // {member, mode:'set'|'verify'}
  const [adminDialog, setAdminDialog] = useState(false);
  const [guestToast, setGuestToast] = useState(null); // message shown when guest tries to edit
  const [showWelcome, setShowWelcome] = useState(() => !loadSessionMeId() && !loadGuestFlag());
  const [tab, setTab] = useState(loadTab);
  const [internSeries, setInternSeries] = useState([]);
  const [internPopover, setInternPopover] = useState(null);
  const [hiddenInterns, setHiddenInterns] = useState([]);

  useEffect(() => {
    try { localStorage.setItem('bmcl_tab', tab); } catch(e) {}
    if (location.hash !== '#' + tab) history.replaceState(null, '', '#' + tab);
    setPopover(null); setInternPopover(null);
  }, [tab]);

  const me = members.find(m => m.id === meId) || null;

  // 다른 사람(혹은 내가 아닌 멤버) 예약인지 판정
  const canEdit = (resv) => !!me && resv.memberId === me.id;

  // 구글 시트에서 예약 불러오기
  const loadReservations = async () => {
    try {
      const resvs = await fetchReservations();
      // Defensive: strip nulls / non-numeric gpu values that may have been
      // persisted by older bad writes (e.g. [null, null]).
      const clean = (resvs || []).map(r => ({
        ...r,
        gpus: (r.gpus || []).filter(g => typeof g === 'number' && !isNaN(g)),
      }));
      setReservations(clean);
    } catch(e) {
      console.error('Failed to load reservations:', e);
    } finally {
      setLoading(false);
    }
  };

  const loadInterns = async () => {
    try {
      const list = await fetchInternSeries();
      setInternSeries(list.map(s => ({
        ...s,
        startSlot: Number(s.startSlot), endSlot: Number(s.endSlot),
        recur: InternUtils.normRecur(s.recur),
        exdates: Array.isArray(s.exdates) ? s.exdates : String(s.exdates || '').split(',').filter(Boolean),
      })));
    } catch(e) { console.error('Failed to load intern schedule:', e); }
  };

  useEffect(() => {
    loadReservations();
    loadInterns();
    const t = setInterval(() => { loadReservations(); loadInterns(); }, 30000);
    return () => clearInterval(t);
  }, []);

  // ---- Intern occurrences (expanded around current date) ----
  const occurrences = useMemo(() => {
    const rs = GpuUtils.addDays(currentDate, -45), re = GpuUtils.addDays(currentDate, 45);
    return InternUtils.expandAll(internSeries, rs, re);
  }, [internSeries, currentDate.toDateString()]);
  const knownInterns = useMemo(() => {
    const set = new Set(internSeries.map(s => s.intern).filter(Boolean));
    return [...set].sort((x, y) => x.localeCompare(y));
  }, [internSeries]);
  const visibleOccurrences = useMemo(() => occurrences.filter(o => !hiddenInterns.includes(o.name)), [occurrences, hiddenInterns]);
  const internCols = knownInterns.filter(n => !hiddenInterns.includes(n));

  // meId 저장 (세션)
  useEffect(() => { saveSessionMeId(meId); }, [meId]);
  useEffect(() => { saveGuestFlag(isGuest); }, [isGuest]);

  // Guest toast auto-dismiss
  useEffect(() => {
    if (!guestToast) return;
    const t = setTimeout(() => setGuestToast(null), 2600);
    return () => clearTimeout(t);
  }, [guestToast]);

  const blockGuest = (msg) => {
    if (!me) {
      setGuestToast(msg || '게스트는 볼 수만 있어요. 로그인 후 이용해주세요.');
      return true;
    }
    return false;
  };

  // now 업데이트
  useEffect(() => {
    const t = setInterval(() => setNow(new Date()), 30000);
    return () => clearInterval(t);
  }, []);

  // ------- Navigation -------
  const onNav = (dir) => {
    const d = new Date(currentDate);
    if (view === 'day') d.setDate(d.getDate() + dir);
    else if (view === 'week') d.setDate(d.getDate() + 7 * dir);
    else if (view === 'month') d.setMonth(d.getMonth() + dir);
    setCurrentDate(d);
  };

  const title =
    view === 'day' ? GpuUtils.fmtDateLong(currentDate) :
    view === 'week' ? GpuUtils.fmtWeek(currentDate) :
    GpuUtils.fmtMonth(currentDate);

  // ------- Auth flow -------
  // 로그인 안 된 상태에서 멤버 버튼 클릭 시 호출
  const startAuth = async (member) => {
    console.log('[auth] startAuth clicked for', member.id);
    // Hide Welcome immediately so the Auth dialog isn't occluded
    setShowWelcome(false);
    // Ask server whether this member already has a password set
    try {
      const res = await apiAuth('hasPassword', member.id, '');
      console.log('[auth] hasPassword response:', res);
      const mode = res.hasPassword ? 'verify' : 'set';
      setAuthDialog({ member, mode, error: null });
    } catch(e) {
      console.error('[auth] hasPassword failed:', e);
      setAuthDialog({ member, mode: 'verify', error: '서버 연결 실패: ' + e.message });
    }
  };

  const submitAuth = async (password, passwordConfirm) => {
    if (!authDialog) return;
    const { member, mode } = authDialog;
    if (mode === 'set') {
      if (password.length < 4) return setAuthDialog(a => ({ ...a, error: '비밀번호는 4자 이상' }));
      if (password !== passwordConfirm) return setAuthDialog(a => ({ ...a, error: '비밀번호가 일치하지 않음' }));
      // Send both via GET action=setPassword
      const res = await apiAuth('setPassword', member.id, password);
      if (res && res.ok) {
        setMeId(member.id);
        setAuthDialog(null);
        setShowWelcome(false);
      } else {
        setAuthDialog(a => ({ ...a, error: res && res.error || '설정 실패' }));
      }
    } else {
      const res = await apiAuth('verifyPassword', member.id, password);
      if (res && res.ok) {
        setMeId(member.id);
        setAuthDialog(null);
        setShowWelcome(false);
      } else {
        setAuthDialog(a => ({ ...a, error: '비밀번호가 일치하지 않음' }));
      }
    }
  };

  const logOut = () => {
    setMeId(null);
    setIsGuest(false);
    setShowWelcome(true);
  };

  const continueAsGuest = () => {
    setIsGuest(true);
    setMeId(null);
    setShowWelcome(false);
  };

  // ------- Create / Edit handlers -------
  const handleCreate = (payload) => {
    if (blockGuest('예약을 만들려면 로그인이 필요해요.')) return;
    setPopover({
      mode: 'create',
      draft: {
        startSlot: payload.startSlot,
        endSlot: payload.endSlot,
        gpus: payload.gpus || [],
      }
    });
  };

  const handleEdit = (resv) => {
    // Everyone can OPEN, but non-owners see read-only popover.
    setPopover({ mode: 'edit', editing: resv, readOnly: !canEdit(resv) });
  };

  const handleSaveNew = async ({ startSlot, endSlot, gpus, note, memberId }) => {
    const mem = me; // always save as current user (ignore memberId override for safety)
    if (!mem) return;
    const cleanGpus = cleanGpuList(gpus);
    if (cleanGpus.length === 0) return; // no valid GPUs, refuse
    const newResv = {
      id: GpuUtils.uid(), memberId: mem.id, name: mem.name, colorIdx: mem.colorIdx,
      startSlot, endSlot, gpus: cleanGpus, note,
    };
    setReservations(prev => [...prev, newResv]);
    setPopover(null);
    await apiCreate(newResv);
  };

  const handleSaveEdit = async ({ startSlot, endSlot, gpus, note }) => {
    if (!canEdit(popover.editing)) return;
    const cleanGpus = cleanGpuList(gpus);
    if (cleanGpus.length === 0) return;
    const updated = {
      ...popover.editing,
      startSlot, endSlot, gpus: cleanGpus, note,
    };
    setReservations(prev => prev.map(r => r.id === updated.id ? updated : r));
    setPopover(null);
    await apiUpdate(updated);
  };

  const handleDelete = async (id) => {
    const resv = reservations.find(r => r.id === id);
    if (!resv || !canEdit(resv)) return;
    setReservations(prev => prev.filter(r => r.id !== id));
    setPopover(null);
    await apiDelete(id);
  };

  const handleUpdate = async (id, patch) => {
    if (blockGuest('예약을 수정하려면 로그인이 필요해요.')) return;
    const resv = reservations.find(r => r.id === id);
    if (!resv || !canEdit(resv)) return;
    if (patch.gpus && cleanGpuList(patch.gpus).length === 0) return;
    const updated = reservations.map(r => r.id === id ? { ...r, ...patch } : r);
    setReservations(updated);
    const rr = updated.find(r => r.id === id);
    if (rr) await apiUpdate(rr);
  };

  // ------- Intern handlers -------
  const findSeries = (occ) => internSeries.find(s => s.id === occ.seriesId);
  const putSeries = async (s, isNew) => {
    setInternSeries(prev => isNew ? [...prev, s] : prev.map(x => x.id === s.id ? s : x));
    await (isNew ? apiInternCreate(s) : apiInternUpdate(s));
  };

  const internCreate = (payload) => {
    if (blockGuest('일정을 만들려면 로그인이 필요해요.')) return;
    const col = payload.gpus && payload.gpus.length ? internCols[payload.gpus[0]] : '';
    setInternPopover({ mode: 'create', draft: { startSlot: payload.startSlot, endSlot: payload.endSlot, intern: col || '' } });
  };
  const internEdit = (occ) => {
    const series = findSeries(occ);
    if (!series) return;
    setInternPopover({ mode: 'edit', editing: occ, series, readOnly: !canEdit(occ) });
  };
  const internSaveNew = async ({ startSlot, endSlot, intern, note, recur }) => {
    if (!me) return;
    const s = { id: GpuUtils.uid(), memberId: me.id, creator: me.name, startSlot, endSlot, intern, note, recur, exdates: [] };
    setInternPopover(null);
    await putSeries(s, true);
  };
  const internSaveEdit = async ({ startSlot, endSlot, intern, note, recur }) => {
    const occ = internPopover.editing;
    const s = findSeries(occ);
    if (!s || !canEdit(occ)) return;
    const dur = endSlot - startSlot;
    const newStart = recur.freq === 'none' ? startSlot : s.startSlot + (startSlot - occ.startSlot);
    setInternPopover(null);
    await putSeries({ ...s, startSlot: newStart, endSlot: newStart + dur, intern, note, recur }, false);
  };
  const internDelete = async (scope) => {
    const occ = internPopover.editing;
    const s = findSeries(occ);
    if (!s || !canEdit(occ)) return;
    setInternPopover(null);
    if (scope === 'one' && occ.recurring) {
      await putSeries({ ...s, exdates: [...(s.exdates || []), occ.occDate] }, false);
    } else {
      setInternSeries(prev => prev.filter(x => x.id !== s.id));
      await apiInternDelete(s.id);
    }
  };
  const internUpdate = async (id, patch) => {
    if (blockGuest('일정을 수정하려면 로그인이 필요해요.')) return;
    const occ = occurrences.find(o => o.id === id);
    if (!occ || !canEdit(occ)) return;
    const s = findSeries(occ);
    if (!s) return;
    const dS = (patch.startSlot ?? occ.startSlot) - occ.startSlot;
    const dE = (patch.endSlot ?? occ.endSlot) - occ.endSlot;
    const ns = s.startSlot + dS, ne = Math.max(ns + 1, s.endSlot + dE);
    await putSeries({ ...s, startSlot: ns, endSlot: ne }, false);
  };

  const isInterns = tab === 'interns';
  const V = isInterns
    ? { reservations: visibleOccurrences, onCreate: internCreate, onEdit: internEdit, onUpdate: internUpdate }
    : { reservations, onCreate: handleCreate, onEdit: handleEdit, onUpdate: handleUpdate };
  const dayColProps = isInterns
    ? (internCols.length
        ? { columns: internCols, inCol: (r, i) => r.name === internCols[i], colHint: 'drag to add' }
        : { columns: ['Interns'], inCol: () => true, colHint: 'drag to add' })
    : {};

  // ------- Keyboard shortcuts -------
  useEffect(() => {
    const onKey = (e) => {
      if (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA') return;
      if (e.key === 'd') setView('day');
      else if (e.key === 'w') setView('week');
      else if (e.key === 'm') setView('month');
      else if (e.key === 't') setCurrentDate(new Date());
      else if (e.key === 'ArrowLeft') onNav(-1);
      else if (e.key === 'ArrowRight') onNav(1);
      else if (e.key === 'Escape') { setPopover(null); setInternPopover(null); setAuthDialog(null); }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [view, currentDate]);

  if (loading) {
    return (
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100vh', color: 'var(--text-3)', fontSize: 15 }}>
        Loading reservations…
      </div>
    );
  }

  return (
    <div className="app">
      <Topbar
        currentDate={currentDate}
        view={view}
        onView={setView}
        onNav={onNav}
        onToday={() => setCurrentDate(new Date())}
        title={title}
        members={members}
        me={me}
        isGuest={isGuest}
        onLogOut={logOut}
        onSignIn={() => setShowWelcome(true)}
        onAdminReset={() => setAdminDialog(true)}
        tab={tab}
        onTab={setTab}
      />

      {isInterns
        ? <InternStrip interns={knownInterns} occurrences={occurrences} hidden={hiddenInterns} setHidden={setHiddenInterns} />
        : <AvailabilityStrip reservations={reservations} now={now} />}

      <div className="cal-body">
        {view === 'day' && (
          <DayView
            key={tab}
            date={currentDate}
            {...V}
            {...dayColProps}
            me={me}
            now={now}
            canEdit={canEdit}
          />
        )}
        {view === 'week' && (
          <WeekView
            key={tab}
            date={currentDate}
            {...V}
            me={me}
            now={now}
            canEdit={canEdit}
          />
        )}
        {view === 'month' && (
          <MonthView
            key={tab}
            date={currentDate}
            reservations={V.reservations}
            onCreate={V.onCreate}
            onEdit={V.onEdit}
            now={now}
            canEdit={canEdit}
          />
        )}
      </div>

      {popover && (
        <ReservationPopover
          draft={popover.draft}
          editing={popover.editing}
          readOnly={popover.readOnly}
          reservations={reservations}
          members={members}
          me={me}
          onSave={popover.mode === 'edit' ? handleSaveEdit : handleSaveNew}
          onDelete={handleDelete}
          onClose={() => setPopover(null)}
        />
      )}

      {internPopover && (
        <InternPopover
          key={internPopover.editing ? internPopover.editing.id : 'new'}
          draft={internPopover.draft}
          editing={internPopover.editing}
          series={internPopover.series}
          readOnly={internPopover.readOnly}
          knownInterns={knownInterns}
          members={members}
          me={me}
          onSave={internPopover.mode === 'edit' ? internSaveEdit : internSaveNew}
          onDelete={internDelete}
          onClose={() => setInternPopover(null)}
        />
      )}

      {showWelcome && (
        <WelcomeScreen
          members={members}
          onPick={(m) => startAuth(m)}
          onClose={(me || isGuest) ? () => setShowWelcome(false) : null}
          onGuest={continueAsGuest}
        />
      )}

      {guestToast && (
        <div className="guest-toast">
          <span className="guest-toast-icon">👁️</span>
          <span>{guestToast}</span>
          <button className="guest-toast-btn" onClick={() => { setGuestToast(null); setShowWelcome(true); }}>Sign in</button>
        </div>
      )}

      {authDialog && (
        <AuthDialog
          member={authDialog.member}
          mode={authDialog.mode}
          error={authDialog.error}
          onSubmit={submitAuth}
          onCancel={() => {
            setAuthDialog(null);
            // If still not signed in, return to welcome screen
            if (!me) setShowWelcome(true);
          }}
        />
      )}

      {adminDialog && (
        <AdminResetDialog
          members={members}
          me={me}
          onClose={() => setAdminDialog(false)}
        />
      )}
    </div>
  );
}

// ============== Intern legend strip ==============
function InternStrip({ interns, occurrences, hidden, setHidden }) {
  const counts = {};
  occurrences.forEach(o => { counts[o.name] = (counts[o.name] || 0) + 1; });
  return (
    <div className="intern-strip">
      <span className="intern-strip-label">Interns</span>
      {interns.length === 0 && <span className="intern-strip-empty">아직 일정이 없어요. 캘린더를 드래그해서 인턴 일정을 추가하세요.</span>}
      {interns.map(n => {
        const c = MEMBER_COLORS[InternUtils.internColorIdx(n) % MEMBER_COLORS.length];
        const off = hidden.includes(n);
        return (
          <button key={n} className={`intern-chip ${off ? 'off' : ''}`} title={off ? 'Show' : 'Hide'}
            onClick={() => setHidden(h => off ? h.filter(x => x !== n) : [...h, n])}>
            <span className="swatch" style={{ background: c.solid }}></span>
            <span>{n}</span>
          </button>
        );
      })}
      {hidden.length > 0 && <button className="intern-strip-reset" onClick={() => setHidden([])}>Show all</button>}
    </div>
  );
}

// ============== Welcome screen ==============
function WelcomeScreen({ members, onPick, onClose, onGuest }) {
  return (
    <div className="empty-welcome">
      <div className="empty-welcome-card">
        {onClose && (
          <button className="welcome-close" onClick={onClose} aria-label="Close">×</button>
        )}
        <h2>Welcome to BMCL Calendar</h2>
        <p>Pick your name to sign in. Your session ends when you close this tab.</p>
        <div className="avatars">
          {members.map(m => {
            const c = MEMBER_COLORS[m.colorIdx % MEMBER_COLORS.length];
            return (
              <button
                key={m.id}
                className="welcome-avatar"
                style={{ background: c.solid }}
                onClick={() => onPick(m)}
              >{m.name}</button>
            );
          })}
        </div>
        {onGuest && (
          <div className="guest-row">
            <div className="guest-divider"><span>or</span></div>
            <button className="guest-btn" onClick={onGuest}>
              <span className="guest-btn-icon">👁️</span>
              <span className="guest-btn-text">
                <strong>Continue as guest</strong>
                <small>View only · 예약 생성/수정 불가</small>
              </span>
            </button>
          </div>
        )}
      </div>
    </div>
  );
}

// ============== Password dialog ==============
function AuthDialog({ member, mode, error, onSubmit, onCancel }) {
  const [pw, setPw] = useState('');
  const [pw2, setPw2] = useState('');
  const [busy, setBusy] = useState(false);
  const color = MEMBER_COLORS[member.colorIdx % MEMBER_COLORS.length];
  const isSet = mode === 'set';

  const submit = async (e) => {
    e.preventDefault();
    if (busy) return;
    setBusy(true);
    await onSubmit(pw, pw2);
    setBusy(false);
  };

  return (
    <div className="popover-backdrop" onMouseDown={(e) => { if (e.target === e.currentTarget) onCancel(); }}>
      <form className="popover auth-dialog" onMouseDown={e => e.stopPropagation()} onSubmit={submit}>
        <div className="auth-avatar" style={{ background: color.solid }}>{member.name[0].toUpperCase()}</div>
        <h3>
          {isSet ? `Set a password for ${member.name}` : `Sign in as ${member.name}`}
        </h3>
        <div className="subtitle">
          {isSet
            ? '처음 로그인이에요. 사용할 비밀번호를 설정해주세요.'
            : '비밀번호를 입력해 주세요.'}
        </div>

        <div className="field">
          <label>Password</label>
          <input
            type="password"
            autoFocus
            value={pw}
            onChange={e => setPw(e.target.value)}
            placeholder={isSet ? 'Choose a password (4+ chars)' : 'Password'}
          />
        </div>

        {isSet && (
          <div className="field">
            <label>Confirm</label>
            <input
              type="password"
              value={pw2}
              onChange={e => setPw2(e.target.value)}
              placeholder="Repeat password"
            />
          </div>
        )}

        {error && <div className="auth-error">{error}</div>}

        <div className="popover-actions">
          <button type="button" className="btn btn-secondary" onClick={onCancel}>Cancel</button>
          <button type="submit" className="btn btn-primary" disabled={busy || !pw || (isSet && !pw2)}>
            {busy ? '...' : (isSet ? 'Set & sign in' : 'Sign in')}
          </button>
        </div>
      </form>
    </div>
  );
}

// ============== Admin reset dialog ==============
function AdminResetDialog({ members, me, onClose }) {
  const [targetId, setTargetId] = useState('');
  const [adminPw, setAdminPw] = useState('');
  const [status, setStatus] = useState(null); // {type:'ok'|'err', msg}
  const [busy, setBusy] = useState(false);

  const targets = members.filter(m => m.id !== me?.id);

  const submit = async (e) => {
    e.preventDefault();
    if (!targetId || !adminPw) return;
    setBusy(true); setStatus(null);
    try {
      const res = await apiAdminReset(adminPw, targetId);
      if (res.ok) {
        const t = members.find(m => m.id === targetId);
        setStatus({ type: 'ok', msg: `✓ ${t?.name}의 비밀번호를 초기화했어요. 다음 로그인 때 새 비밀번호를 설정하면 돼요.` });
        setTargetId(''); setAdminPw('');
      } else {
        setStatus({ type: 'err', msg: res.error === 'admin auth failed' ? '본인 비밀번호가 틀렸어요.' : (res.error || '실패') });
      }
    } catch(err) {
      setStatus({ type: 'err', msg: '서버 연결 실패' });
    }
    setBusy(false);
  };

  return (
    <div className="popover-backdrop" onMouseDown={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <form className="popover auth-dialog" onMouseDown={e => e.stopPropagation()} onSubmit={submit} style={{ minWidth: 380 }}>
        <h3 style={{ marginTop: 0 }}>🔑 Reset member password</h3>
        <div className="subtitle">
          다른 멤버의 비밀번호를 초기화할 수 있어요. 초기화된 멤버는 다음 로그인 때 새 비밀번호를 설정합니다.
        </div>

        <div className="field">
          <label>Member</label>
          <select value={targetId} onChange={e => setTargetId(e.target.value)} style={{
            width: '100%', padding: '8px 12px', borderRadius: 'var(--radius-sm)',
            border: '1px solid var(--border-strong)', fontSize: 14, boxSizing: 'border-box'
          }}>
            <option value="">— select member —</option>
            {targets.map(m => <option key={m.id} value={m.id}>{m.name}</option>)}
          </select>
        </div>

        <div className="field">
          <label>Your password (admin)</label>
          <input
            type="password"
            value={adminPw}
            onChange={e => setAdminPw(e.target.value)}
            placeholder="본인 비밀번호 입력"
            autoFocus
          />
        </div>

        {status && (
          <div className={status.type === 'ok' ? 'auth-ok' : 'auth-error'}>{status.msg}</div>
        )}

        <div className="popover-actions">
          <button type="button" className="btn btn-secondary" onClick={onClose}>Close</button>
          <button type="submit" className="btn btn-primary" disabled={busy || !targetId || !adminPw}>
            {busy ? '...' : 'Reset'}
          </button>
        </div>
      </form>
    </div>
  );
}

ReactDOM.createRoot(document.getElementById('root')).render(<App />);
