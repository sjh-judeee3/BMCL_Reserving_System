/* Intern schedule popover — create / edit / read-only, with recurrence */

function InternPopover({ draft, editing, series, readOnly, knownInterns, members, me, onSave, onDelete, onClose }) {
  const IU = window.InternUtils;
  const initial = editing || draft;
  const [intern, setIntern] = useState(editing ? editing.name : (draft.intern || ''));
  const [startSlot, setStartSlot] = useState(initial.startSlot);
  const [endSlot, setEndSlot] = useState(initial.endSlot);
  const [note, setNote] = useState(editing ? (editing.note || '') : '');
  const [recur, setRecur] = useState(() => IU.normRecur(series ? series.recur : null));
  const [confirmDel, setConfirmDel] = useState(false);

  const dateObj = GpuUtils.slotIndexToDate(startSlot);
  const endDateObj = GpuUtils.slotIndexToDate(endSlot);
  const multiDay = !GpuUtils.sameDay(dateObj, endDateObj);
  const dow = dateObj.getDay();

  const presetOf = (r) => {
    if (r.freq === 'none') return 'none';
    if (r.interval !== 1) return 'custom';
    if (r.freq === 'daily') return 'daily';
    if (r.freq === 'weekly') {
      const d = r.byDay.slice().sort().join();
      if (d === '1,2,3,4,5') return 'weekdays';
      if (d === '' || d === String(dow)) return 'weekly';
      return 'custom';
    }
    if (r.freq === 'monthly') return 'monthly';
    if (r.freq === 'yearly') return 'yearly';
    return 'custom';
  };
  const [mode, setMode] = useState(() => presetOf(recur));

  const applyPreset = (p) => {
    setMode(p);
    const base = { ...recur, interval: 1 };
    if (p === 'none') setRecur({ ...base, freq: 'none', byDay: [] });
    else if (p === 'daily') setRecur({ ...base, freq: 'daily', byDay: [] });
    else if (p === 'weekdays') setRecur({ ...base, freq: 'weekly', byDay: [1,2,3,4,5] });
    else if (p === 'weekly') setRecur({ ...base, freq: 'weekly', byDay: [dow] });
    else if (p === 'monthly') setRecur({ ...base, freq: 'monthly', byDay: [] });
    else if (p === 'yearly') setRecur({ ...base, freq: 'yearly', byDay: [] });
    else if (p === 'custom') setRecur(r => ({ ...r, freq: r.freq === 'none' ? 'weekly' : r.freq, byDay: r.byDay.length ? r.byDay : [dow] }));
  };

  const slotsToInputTime = (slot) => {
    const d = GpuUtils.slotIndexToDate(slot);
    return `${GpuUtils.pad2(d.getHours())}:${GpuUtils.pad2(d.getMinutes())}`;
  };
  const inputTimeToSlot = (dateRef, str) => {
    const [h, m] = str.split(':').map(Number);
    const d = new Date(dateRef); d.setHours(h, m, 0, 0);
    return GpuUtils.dateToSlotIndex(d);
  };
  const slotsToInputDate = (slot) => GpuUtils.ymd(GpuUtils.slotIndexToDate(slot));

  const valid = intern.trim().length > 0 && endSlot > startSlot && !(recur.freq === 'weekly' && mode === 'custom' && recur.byDay.length === 0);
  const save = () => { if (!readOnly && valid) onSave({ startSlot, endSlot, intern: intern.trim(), note: note.trim(), recur }); };

  const creator = editing ? (members.find(m => m.id === editing.memberId) || { name: editing.creator }) : me;
  const creatorColor = creator && creator.colorIdx !== undefined ? MEMBER_COLORS[creator.colorIdx % MEMBER_COLORS.length] : null;
  const internColor = MEMBER_COLORS[IU.internColorIdx(intern) % MEMBER_COLORS.length];
  const isRecurring = editing && editing.recurring;
  const title = readOnly ? `${intern}'s schedule` : (editing ? 'Edit schedule' : 'New schedule');
  const unitLabel = { daily: 'day', weekly: 'week', monthly: 'month', yearly: 'year' };

  return (
    <div className="popover-backdrop" onMouseDown={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <div className={`popover intern-pop ${readOnly ? 'readonly' : ''}`} onMouseDown={e => e.stopPropagation()}>
        <div className="popover-header-row">
          {intern.trim() && <span className="owner-dot" style={{ background: internColor.solid }}></span>}
          <h3>{title}</h3>
        </div>
        <div className="subtitle">
          {GpuUtils.fmtDateLong(dateObj)}{multiDay && ` → ${GpuUtils.fmtDateLong(endDateObj)}`}
        </div>

        {editing && (
          <div className="intern-creator">
            Created by
            {creatorColor && <span className="swatch" style={{ background: creatorColor.solid }}></span>}
            <strong>{creator?.name || '—'}</strong>
          </div>
        )}

        {readOnly && (
          <div className="readonly-banner">
            🔒 You're signed in as <strong>{me?.name || 'guest'}</strong>. Only {creator?.name || 'the creator'} can change this schedule.
          </div>
        )}

        <div className="field">
          <label>Intern</label>
          {readOnly ? <div className="readonly-time"><strong>{intern}</strong></div> : (
            <React.Fragment>
              <input list="intern-names" autoFocus={!editing} value={intern} onChange={e => setIntern(e.target.value)} placeholder="인턴 이름 입력" />
              <datalist id="intern-names">{knownInterns.map(n => <option key={n} value={n}></option>)}</datalist>
              {knownInterns.length > 0 && (
                <div className="intern-quick">
                  {knownInterns.slice(0, 8).map(n => {
                    const c = MEMBER_COLORS[IU.internColorIdx(n) % MEMBER_COLORS.length];
                    return (
                      <button key={n} type="button" className={`gpu-chip ${intern.trim() === n ? 'active' : ''}`} onClick={() => setIntern(n)}>
                        <span className="swatch" style={{ background: c.solid }}></span>{n}
                      </button>
                    );
                  })}
                </div>
              )}
            </React.Fragment>
          )}
        </div>

        <div className="field">
          <label>When</label>
          {readOnly ? (
            <div className="readonly-time">
              <strong>{GpuUtils.fmtTimeShort(dateObj)}</strong> {multiDay && `(${GpuUtils.fmtMonthDay(dateObj)})`} → <strong>{GpuUtils.fmtTimeShort(endDateObj)}</strong> {multiDay && `(${GpuUtils.fmtMonthDay(endDateObj)})`}
            </div>
          ) : (
            <div className="time-row">
              <div>
                <input type="date" value={slotsToInputDate(startSlot)} style={{ marginBottom: 4 }} onChange={(e) => {
                  if (!e.target.value) return;
                  const nd = GpuUtils.parseYmd(e.target.value);
                  const d = GpuUtils.slotIndexToDate(startSlot);
                  nd.setHours(d.getHours(), d.getMinutes(), 0, 0);
                  const dur = endSlot - startSlot;
                  const ns = GpuUtils.dateToSlotIndex(nd);
                  setStartSlot(ns); setEndSlot(ns + dur);
                }} />
                <input type="time" step="1800" value={slotsToInputTime(startSlot)} onChange={(e) => {
                  const ns = inputTimeToSlot(GpuUtils.slotIndexToDate(startSlot), e.target.value);
                  const dur = endSlot - startSlot;
                  setStartSlot(ns); setEndSlot(ns + dur);
                }} />
              </div>
              <div className="arrow">→</div>
              <div>
                <input type="date" value={slotsToInputDate(endSlot)} style={{ marginBottom: 4 }} onChange={(e) => {
                  if (!e.target.value) return;
                  const nd = GpuUtils.parseYmd(e.target.value);
                  const d = GpuUtils.slotIndexToDate(endSlot);
                  nd.setHours(d.getHours(), d.getMinutes(), 0, 0);
                  setEndSlot(Math.max(startSlot + 1, GpuUtils.dateToSlotIndex(nd)));
                }} />
                <input type="time" step="1800" value={slotsToInputTime(endSlot)} onChange={(e) => {
                  const ns = inputTimeToSlot(GpuUtils.slotIndexToDate(endSlot), e.target.value);
                  setEndSlot(Math.max(startSlot + 1, ns));
                }} />
              </div>
            </div>
          )}
        </div>

        <div className="field">
          <label>Repeat</label>
          {readOnly ? <div className="readonly-note">↻ {IU.recurLabel(recur, dateObj)}</div> : (
            <React.Fragment>
              <select value={mode} onChange={e => applyPreset(e.target.value)}>
                <option value="none">Does not repeat</option>
                <option value="daily">Every day</option>
                <option value="weekdays">Every weekday (Mon–Fri)</option>
                <option value="weekly">Every week on {IU.DOW_SHORT[dow]}</option>
                <option value="monthly">Every month on day {dateObj.getDate()}</option>
                <option value="yearly">Every year</option>
                <option value="custom">Custom…</option>
              </select>

              {mode === 'custom' && (
                <div className="recur-custom">
                  <div className="recur-row">
                    <span>Every</span>
                    <input type="number" min="1" max="99" value={recur.interval} onChange={e => setRecur(r => ({ ...r, interval: Math.max(1, Number(e.target.value) || 1) }))} />
                    <select value={recur.freq} onChange={e => setRecur(r => ({ ...r, freq: e.target.value, byDay: e.target.value === 'weekly' ? (r.byDay.length ? r.byDay : [dow]) : [] }))}>
                      {['daily','weekly','monthly','yearly'].map(f => <option key={f} value={f}>{unitLabel[f]}{recur.interval > 1 ? 's' : ''}</option>)}
                    </select>
                  </div>
                  {recur.freq === 'weekly' && (
                    <div className="dow-toggles">
                      {IU.DOW_KO.map((lbl, i) => (
                        <button key={i} type="button" className={recur.byDay.includes(i) ? 'active' : ''} onClick={() => setRecur(r => ({ ...r, byDay: r.byDay.includes(i) ? r.byDay.filter(x => x !== i) : [...r.byDay, i].sort() }))}>{lbl}</button>
                      ))}
                    </div>
                  )}
                  {recur.freq === 'monthly' && <div className="recur-hint">매월 {dateObj.getDate()}일</div>}
                </div>
              )}

              {recur.freq !== 'none' && (
                <div className="recur-end">
                  <span className="recur-end-label">End repeat</span>
                  <select value={recur.endType} onChange={e => setRecur(r => ({ ...r, endType: e.target.value, until: r.until || GpuUtils.ymd(GpuUtils.addDays(dateObj, 28)) }))}>
                    <option value="never">Never</option>
                    <option value="until">On date</option>
                    <option value="count">After</option>
                  </select>
                  {recur.endType === 'until' && <input type="date" value={recur.until} min={slotsToInputDate(startSlot)} onChange={e => setRecur(r => ({ ...r, until: e.target.value }))} />}
                  {recur.endType === 'count' && (
                    <span className="recur-count"><input type="number" min="1" max="999" value={recur.count} onChange={e => setRecur(r => ({ ...r, count: Math.max(1, Number(e.target.value) || 1) }))} />times</span>
                  )}
                </div>
              )}
              {recur.freq !== 'none' && <div className="recur-hint">↻ {IU.recurLabel(recur, dateObj)}</div>}
              {isRecurring && <div className="recur-hint">변경 사항은 반복 일정 전체에 적용돼요.</div>}
            </React.Fragment>
          )}
        </div>

        {(note || !readOnly) && (
          <div className="field">
            <label>Note {!readOnly && <span style={{ textTransform: 'none', fontWeight: 400, color: 'var(--text-4)' }}>(optional)</span>}</label>
            {readOnly
              ? <div className="readonly-note">{note}</div>
              : <textarea value={note} onChange={e => setNote(e.target.value)} placeholder="e.g. 실험실 오리엔테이션, 재택" />}
          </div>
        )}

        {confirmDel ? (
          <div className="popover-actions del-confirm">
            <span className="del-q">Delete recurring schedule?</span>
            <button className="btn btn-secondary" onClick={() => setConfirmDel(false)}>Cancel</button>
            <button className="btn btn-danger" onClick={() => onDelete('one')}>This event only</button>
            <button className="btn btn-danger" onClick={() => onDelete('all')}>All events</button>
          </div>
        ) : (
          <div className="popover-actions">
            {editing && !readOnly && (
              <button className="btn btn-danger left" onClick={() => {
                if (isRecurring) setConfirmDel(true);
                else if (confirm(`Delete "${editing.name}" schedule?`)) onDelete('all');
              }}>Delete</button>
            )}
            <button className="btn btn-secondary" onClick={onClose}>{readOnly ? 'Close' : 'Cancel'}</button>
            {!readOnly && <button className="btn btn-primary" onClick={save} disabled={!valid}>{editing ? 'Save' : 'Add'}</button>}
          </div>
        )}
      </div>
    </div>
  );
}

window.InternPopover = InternPopover;
