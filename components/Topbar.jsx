/* Topbar — brand, view switch, nav, today, current user / sign in */
const { useState, useEffect, useRef, useMemo } = React;

function Topbar({ currentDate, view, onView, onNav, onToday, title, members, me, isGuest, onLogOut, onSignIn, onAdminReset, tab, onTab }) {
  const myColor = me ? MEMBER_COLORS[me.colorIdx % MEMBER_COLORS.length].solid : '#8e8e93';
  const [openMenu, setOpenMenu] = useState(false);
  const menuRef = useRef(null);

  useEffect(() => {
    const onDown = (e) => {
      if (menuRef.current && !menuRef.current.contains(e.target)) setOpenMenu(false);
    };
    if (openMenu) window.addEventListener('mousedown', onDown);
    return () => window.removeEventListener('mousedown', onDown);
  }, [openMenu]);

  return (
    <div className="topbar">
      <div className="brand" onClick={() => onView('month')} style={{ cursor: 'pointer' }}>
        <img src="logo.png" className="brand-logo" alt="BMCL" onError={e => { e.target.style.display='none'; }} />
        <span>BMCL</span>
      </div>

      <div className="tab-switch" role="tablist">
        <button role="tab" className={tab === 'gpu' ? 'active' : ''} onClick={() => onTab('gpu')}>GPU</button>
        <button role="tab" className={tab === 'interns' ? 'active' : ''} onClick={() => onTab('interns')}>Interns</button>
      </div>

      <div className="view-switch">
        {['day','week','month'].map(v => (
          <button key={v} className={view === v ? 'active' : ''} onClick={() => onView(v)}>
            {v[0].toUpperCase() + v.slice(1)}
          </button>
        ))}
      </div>

      <button className="today-btn" onClick={onToday}>Today</button>

      <div className="nav-arrows">
        <button onClick={() => onNav(-1)} title="Previous">‹</button>
        <div className="sep" />
        <button onClick={() => onNav(1)} title="Next">›</button>
      </div>

      <div className="date-title">{title}</div>

      <div className="topbar-spacer" />

      {me ? (
        <div className="me-menu-wrap" ref={menuRef}>
          <button className="me-chip" onClick={() => setOpenMenu(v => !v)}>
            <span className="swatch" style={{ background: myColor }} />
            <span className="me-chip-name">{me.name}</span>
            <span className="me-chip-caret">▾</span>
          </button>
          {openMenu && (
            <div className="me-menu">
              <div className="me-menu-header">
                <span className="swatch" style={{ background: myColor }} />
                Signed in as <strong>{me.name}</strong>
              </div>
              {me.id === 'm_juhee' && (
                <button onClick={() => { setOpenMenu(false); onAdminReset && onAdminReset(); }}>
                  🔑 Reset member password…
                </button>
              )}
              <button onClick={() => { setOpenMenu(false); onLogOut(); }}>Sign out</button>
            </div>
          )}
        </div>
      ) : isGuest ? (
        <div className="guest-chip-wrap">
          <span className="guest-chip" title="게스트 모드 · view only">
            <span className="guest-chip-dot" />
            <span>Guest</span>
            <span className="guest-chip-tag">view only</span>
          </span>
          <button className="btn btn-primary signin-btn" onClick={onSignIn}>Sign in</button>
        </div>
      ) : (
        <button className="btn btn-primary signin-btn" onClick={onSignIn}>Sign in</button>
      )}
    </div>
  );
}

window.Topbar = Topbar;
