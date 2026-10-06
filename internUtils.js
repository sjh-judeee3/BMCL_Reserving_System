// Intern schedule — recurrence expansion + helpers
(function () {
  const U = window.GpuUtils;
  const DOW_SHORT = ['Sun','Mon','Tue','Wed','Thu','Fri','Sat'];
  const DOW_KO = ['일','월','화','수','목','금','토'];

  function internColorIdx(name) {
    let h = 0;
    const s = String(name || '').trim().toLowerCase();
    for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) >>> 0;
    return h % U.MEMBER_COLORS.length;
  }

  function defaultRecur() {
    return { freq: 'none', interval: 1, byDay: [], endType: 'never', until: '', count: 10 };
  }

  function normRecur(r) {
    const d = defaultRecur();
    if (!r || typeof r !== 'object') return d;
    return {
      freq: ['none','daily','weekly','monthly','yearly'].includes(r.freq) ? r.freq : 'none',
      interval: Math.max(1, Number(r.interval) || 1),
      byDay: Array.isArray(r.byDay) ? r.byDay.map(Number).filter(n => n >= 0 && n <= 6) : [],
      endType: ['never','until','count'].includes(r.endType) ? r.endType : 'never',
      until: r.until || '',
      count: Math.max(1, Number(r.count) || 1),
    };
  }

  // Expand a series into occurrences overlapping [rangeStart, rangeEnd)
  function expandSeries(s, rangeStart, rangeEnd) {
    const rec = normRecur(s.recur);
    const first = U.slotIndexToDate(s.startSlot);
    const firstMid = new Date(first.getFullYear(), first.getMonth(), first.getDate());
    const todOffset = s.startSlot - U.dateToSlotIndex(firstMid);
    const dur = Math.max(1, s.endSlot - s.startSlot);
    const ex = new Set(s.exdates || []);
    const untilDate = rec.endType === 'until' && rec.until ? U.addDays(U.parseYmd(rec.until), 1) : null;
    const maxCount = rec.endType === 'count' ? rec.count : Infinity;
    const out = [];
    let n = 0;

    const emit = (day) => {
      // returns false to stop iteration
      if (day < firstMid) return true;
      if (untilDate && day >= untilDate) return false;
      if (n >= maxCount) return false;
      n++;
      const st = U.dateToSlotIndex(day) + todOffset;
      const en = st + dur;
      const stDate = U.slotIndexToDate(st);
      if (stDate >= rangeEnd) return false;
      const key = U.ymd(day);
      if (U.slotIndexToDate(en) > rangeStart && !ex.has(key)) out.push({ day: key, startSlot: st, endSlot: en });
      return true;
    };

    if (rec.freq === 'none') { emit(firstMid); return out; }

    const CAP = 5000;
    if (rec.freq === 'daily') {
      for (let i = 0; i < CAP; i++) if (!emit(U.addDays(firstMid, i * rec.interval))) break;
    } else if (rec.freq === 'weekly') {
      const days = (rec.byDay.length ? rec.byDay : [firstMid.getDay()]).slice().sort();
      const wk0 = U.startOfWeek(firstMid);
      outer: for (let w = 0; w < CAP; w++) {
        const ws = U.addDays(wk0, w * 7 * rec.interval);
        for (const d of days) if (!emit(U.addDays(ws, d))) break outer;
      }
    } else if (rec.freq === 'monthly') {
      const dom = firstMid.getDate();
      for (let i = 0; i < CAP; i++) {
        const m = new Date(firstMid.getFullYear(), firstMid.getMonth() + i * rec.interval, 1);
        if (dom > new Date(m.getFullYear(), m.getMonth() + 1, 0).getDate()) continue;
        if (!emit(new Date(m.getFullYear(), m.getMonth(), dom))) break;
      }
    } else if (rec.freq === 'yearly') {
      for (let i = 0; i < 200; i++) {
        const d = new Date(firstMid.getFullYear() + i * rec.interval, firstMid.getMonth(), firstMid.getDate());
        if (d.getMonth() !== firstMid.getMonth()) continue;
        if (!emit(d)) break;
      }
    }
    return out;
  }

  function expandAll(series, rangeStart, rangeEnd) {
    const out = [];
    series.forEach(s => {
      const rec = normRecur(s.recur);
      expandSeries(s, rangeStart, rangeEnd).forEach(o => {
        out.push({
          id: `${s.id}@${o.day}`, seriesId: s.id, occDate: o.day,
          memberId: s.memberId, creator: s.creator, name: s.intern,
          colorIdx: internColorIdx(s.intern),
          startSlot: o.startSlot, endSlot: o.endSlot, gpus: [],
          note: s.note || '', recurring: rec.freq !== 'none',
        });
      });
    });
    return out;
  }

  function recurLabel(r, startDate) {
    const rec = normRecur(r);
    if (rec.freq === 'none') return 'Does not repeat';
    const n = rec.interval;
    const unit = { daily: 'day', weekly: 'week', monthly: 'month', yearly: 'year' }[rec.freq];
    let s = n === 1 ? `Every ${unit}` : `Every ${n} ${unit}s`;
    if (rec.freq === 'weekly') {
      const days = rec.byDay.length ? rec.byDay : [startDate.getDay()];
      const sorted = days.slice().sort();
      if (sorted.join() === '1,2,3,4,5') s += ' on weekdays';
      else s += ' on ' + sorted.map(d => DOW_SHORT[d]).join(', ');
    } else if (rec.freq === 'monthly') s += ` on day ${startDate.getDate()}`;
    if (rec.endType === 'until' && rec.until) s += `, until ${U.fmtMonthDay(U.parseYmd(rec.until))}`;
    if (rec.endType === 'count') s += `, ${rec.count} times`;
    return s;
  }

  window.InternUtils = { internColorIdx, defaultRecur, normRecur, expandSeries, expandAll, recurLabel, DOW_SHORT, DOW_KO };
})();
