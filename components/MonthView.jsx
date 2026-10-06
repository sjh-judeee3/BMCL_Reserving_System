/* Month view — 6×7 grid. Apple-style calendar:
   - Single-day reservations render as "6pm–10pm name · G0/1" pills inside the day cell
   - Multi-day reservations render as CONTINUOUS BARS across cells, broken only at week boundaries
   - Cells just show the day number; drag across cells to create a new reservation */

function MonthView({ date, reservations, onCreate, onEdit, now, canEdit }) {
  const _canEdit = typeof canEdit === 'function' ? canEdit : () => true;

  const monthStart = GpuUtils.startOfMonth(date);
  const gridStart = GpuUtils.startOfWeek(monthStart);
  const cells = [];
  for (let i = 0; i < 42; i++) cells.push(GpuUtils.addDays(gridStart, i));

  const [drag, setDrag] = useState(null); // {startIdx, endIdx}

  useEffect(() => {
    if (!drag) return;
    const onUp = () => {
      const d = drag;
      setDrag(null);
      const i1 = Math.min(d.startIdx, d.endIdx);
      const i2 = Math.max(d.startIdx, d.endIdx);
      const dayStart = cells[i1];
      const dayEnd = cells[i2];
      // Single continuous reservation (default 9am–6pm). For single-day it's same-day.
      const startSlot = GpuUtils.dateToSlotIndex(new Date(dayStart.getFullYear(), dayStart.getMonth(), dayStart.getDate(), 9, 0));
      const endSlot = GpuUtils.dateToSlotIndex(new Date(dayEnd.getFullYear(), dayEnd.getMonth(), dayEnd.getDate(), 18, 0));
      onCreate({ startSlot, endSlot, gpus: null });
    };
    window.addEventListener('mouseup', onUp);
    return () => window.removeEventListener('mouseup', onUp);
  }, [drag]);

  // Build the set of "bars" per week row.
  // For each reservation, split by week row and render one segment spanning its cells.
  // Single-day reservations render as inline pills inside a cell.
  const weeks = [0, 1, 2, 3, 4, 5]; // 6 rows

  // For each week, compute: {row, startIdxInWeek (0-6), endIdxInWeek, resv, isStart, isEnd}
  function resvSegmentsForWeek(weekIdx) {
    const weekStart = cells[weekIdx * 7];
    const weekEndExcl = GpuUtils.addDays(weekStart, 7);
    const segments = [];
    reservations.forEach(r => {
      const rStart = GpuUtils.slotIndexToDate(r.startSlot);
      const rEnd = GpuUtils.slotIndexToDate(r.endSlot);
      // Day-level span: [startDay, endDayInclusive]
      const rStartDay = new Date(rStart.getFullYear(), rStart.getMonth(), rStart.getDate());
      // endSlot is exclusive; treat end-day as the last day that contains any time
      const rEndDayExcl = new Date(rEnd.getFullYear(), rEnd.getMonth(), rEnd.getDate());
      // If end is exactly midnight, endDay should be the previous day; otherwise it's rEndDayExcl
      const isExactMidnight = rEnd.getHours() === 0 && rEnd.getMinutes() === 0;
      const rEndDayIncl = isExactMidnight ? GpuUtils.addDays(rEndDayExcl, -1) : rEndDayExcl;
      const isMultiDay = !GpuUtils.sameDay(rStartDay, rEndDayIncl);

      if (!isMultiDay) {
        // Handled separately as inline pill in the single cell.
        return;
      }

      // Clip to this week
      if (rEndDayIncl < weekStart || rStartDay >= weekEndExcl) return;
      const clipStart = rStartDay < weekStart ? weekStart : rStartDay;
      const clipEnd = rEndDayIncl >= weekEndExcl ? GpuUtils.addDays(weekEndExcl, -1) : rEndDayIncl;
      const startCol = Math.round((clipStart - weekStart) / (24 * 60 * 60 * 1000));
      const endCol = Math.round((clipEnd - weekStart) / (24 * 60 * 60 * 1000));
      segments.push({
        r,
        startCol, endCol,
        isStart: GpuUtils.sameDay(clipStart, rStartDay),
        isEnd: GpuUtils.sameDay(clipEnd, rEndDayIncl),
      });
    });
    // Assign lanes (rows within the cell): greedy by earliest start.
    segments.sort((a, b) => a.startCol - b.startCol || (b.endCol - b.startCol) - (a.endCol - a.startCol));
    const lanes = []; // lanes[i] = endCol of last segment
    segments.forEach(seg => {
      let placed = false;
      for (let i = 0; i < lanes.length; i++) {
        if (lanes[i] < seg.startCol) { lanes[i] = seg.endCol; seg.lane = i; placed = true; break; }
      }
      if (!placed) { seg.lane = lanes.length; lanes.push(seg.endCol); }
    });
    return segments;
  }

  // Single-day reservations per cell
  function singleDayResvsForCell(cellDate) {
    return reservations.filter(r => {
      const rStart = GpuUtils.slotIndexToDate(r.startSlot);
      const rEnd = GpuUtils.slotIndexToDate(r.endSlot);
      const isExactMidnight = rEnd.getHours() === 0 && rEnd.getMinutes() === 0;
      const rStartDay = new Date(rStart.getFullYear(), rStart.getMonth(), rStart.getDate());
      const rEndDayExcl = new Date(rEnd.getFullYear(), rEnd.getMonth(), rEnd.getDate());
      const rEndDayIncl = isExactMidnight ? GpuUtils.addDays(rEndDayExcl, -1) : rEndDayExcl;
      const isMultiDay = !GpuUtils.sameDay(rStartDay, rEndDayIncl);
      if (isMultiDay) return false;
      return GpuUtils.sameDay(rStartDay, cellDate);
    });
  }

  const MAX_LANES_PER_CELL = 4; // how many bars/pills before "+N more"

  return (
    <div className="month-view">
      <div className="month-dow-header">
        {['Sun','Mon','Tue','Wed','Thu','Fri','Sat'].map(d => <div key={d}>{d}</div>)}
      </div>
      <div className="month-grid">
        {weeks.map(w => {
          const segments = resvSegmentsForWeek(w);
          const weekCells = cells.slice(w * 7, w * 7 + 7);

          return (
            <div key={w} className="month-week-row">
              {/* Background cell layer: day numbers, drag target */}
              {weekCells.map((cellDate, colIdx) => {
                const idx = w * 7 + colIdx;
                const isThisMonth = cellDate.getMonth() === date.getMonth();
                const isToday = GpuUtils.sameDay(cellDate, now);
                const inDrag = drag && idx >= Math.min(drag.startIdx, drag.endIdx) && idx <= Math.max(drag.startIdx, drag.endIdx);
                return (
                  <div
                    key={colIdx}
                    className={`month-cell ${isThisMonth ? '' : 'other-month'} ${isToday ? 'today' : ''} ${inDrag ? 'selecting' : ''}`}
                    onMouseDown={(e) => {
                      // Allow starting a drag anywhere; readonly pills/bars have pointer-events:none
                      if (e.target.closest('.month-resv-bar.mine, .month-resv-pill.mine')) return;
                      setDrag({ startIdx: idx, endIdx: idx });
                      e.preventDefault();
                    }}
                    onMouseEnter={() => { if (drag) setDrag(d => ({ ...d, endIdx: idx })); }}
                  >
                    <div className="month-cell-num">{cellDate.getDate()}</div>
                  </div>
                );
              })}

              {/* Overlay: continuous multi-day bars, absolutely positioned over the row */}
              <div className="month-bars-layer">
                {segments.filter(s => s.lane < MAX_LANES_PER_CELL).map((seg, i) => {
                  const r = seg.r;
                  const color = MEMBER_COLORS[r.colorIdx % MEMBER_COLORS.length];
                  const mine = _canEdit(r);
                  const rStart = GpuUtils.slotIndexToDate(r.startSlot);
                  const rEnd = GpuUtils.slotIndexToDate(r.endSlot);
                  const label = seg.isStart
                    ? `${GpuUtils.fmtMonthDay(rStart)} ${GpuUtils.fmtTimeShort(rStart)} – ${GpuUtils.fmtMonthDay(rEnd)} ${GpuUtils.fmtTimeShort(rEnd)} · ${r.name}`
                    : ''; // continuation — no label (bar visually continues)
                  const cols = seg.endCol - seg.startCol + 1;
                  return (
                    <div
                      key={`${r.id}-w${w}-${i}`}
                      className={`month-resv-bar ${mine ? 'mine' : 'readonly'} ${seg.isStart ? 'start' : 'cont-left'} ${seg.isEnd ? 'end' : 'cont-right'}`}
                      style={{
                        left: `calc(${(seg.startCol / 7) * 100}% + 4px)`,
                        width: `calc(${(cols / 7) * 100}% - 8px)`,
                        top: 24 + seg.lane * 20,
                        '--resv-color': color.solid,
                        '--resv-bg': color.tint,
                      }}
                      onClick={(e) => { e.stopPropagation(); onEdit(r); }}
                      title={`${r.name}${r.gpus.length ? ' · GPU ' + r.gpus.join(',') : ''} · ${GpuUtils.fmtMonthDay(rStart)} ${GpuUtils.fmtTimeShort(rStart)} – ${GpuUtils.fmtMonthDay(rEnd)} ${GpuUtils.fmtTimeShort(rEnd)}${mine ? '' : ' (read-only)'}`}
                    >
                      {seg.isStart && (
                        <>
                          <span className="dot" />
                          <span className="bar-label">{label}</span>
                        </>
                      )}
                    </div>
                  );
                })}

                {/* Single-day pills per cell */}
                {weekCells.map((cellDate, colIdx) => {
                  const singles = singleDayResvsForCell(cellDate);
                  // Find starting lane that's free (not occupied by a multi-day segment on this col)
                  const occupiedLanes = new Set(
                    segments
                      .filter(s => colIdx >= s.startCol && colIdx <= s.endCol)
                      .map(s => s.lane)
                  );
                  let lane = 0;
                  const pills = [];
                  for (const r of singles) {
                    while (occupiedLanes.has(lane)) lane++;
                    if (lane >= MAX_LANES_PER_CELL) break;
                    pills.push({ r, lane });
                    occupiedLanes.add(lane);
                    lane++;
                  }
                  const totalShown = pills.length + segments.filter(s => colIdx >= s.startCol && colIdx <= s.endCol && s.lane < MAX_LANES_PER_CELL).length;
                  const totalForCell = singles.length + segments.filter(s => colIdx >= s.startCol && colIdx <= s.endCol).length;
                  const hidden = totalForCell - totalShown;
                  return (
                    <React.Fragment key={`pills-${colIdx}`}>
                      {pills.map(({ r, lane }) => {
                        const color = MEMBER_COLORS[r.colorIdx % MEMBER_COLORS.length];
                        const mine = _canEdit(r);
                        const rStart = GpuUtils.slotIndexToDate(r.startSlot);
                        const rEnd = GpuUtils.slotIndexToDate(r.endSlot);
                        const gpuLabel = r.gpus.length === 0 ? '' : r.gpus.length === 1 ? `G${r.gpus[0]}` : `G${r.gpus.join('/')}`;
                        return (
                          <div
                            key={r.id + '-' + colIdx}
                            className={`month-resv-pill ${mine ? 'mine' : 'readonly'}`}
                            style={{
                              left: `calc(${(colIdx / 7) * 100}% + 4px)`,
                              width: `calc(${(1 / 7) * 100}% - 8px)`,
                              top: 24 + lane * 20,
                              '--resv-color': color.solid,
                              '--resv-bg': color.tint,
                            }}
                            onClick={(e) => { e.stopPropagation(); onEdit(r); }}
                            title={`${r.name}${r.gpus.length ? ' · GPU ' + r.gpus.join(',') : ''} · ${GpuUtils.fmtTimeShort(rStart)}–${GpuUtils.fmtTimeShort(rEnd)}${mine ? '' : ' (read-only)'}`}
                          >
                            <span className="dot" />
                            <span className="bar-label">
                              <strong>{GpuUtils.fmtTimeShort(rStart)}–{GpuUtils.fmtTimeShort(rEnd)}</strong>
                              {' '}{r.recurring ? '↻ ' : ''}{r.name}{gpuLabel ? ` · ${gpuLabel}` : ''}
                            </span>
                          </div>
                        );
                      })}
                      {hidden > 0 && (
                        <div
                          className="month-resv-more"
                          style={{
                            left: `calc(${(colIdx / 7) * 100}% + 4px)`,
                            width: `calc(${(1 / 7) * 100}% - 8px)`,
                            top: 24 + MAX_LANES_PER_CELL * 20,
                          }}
                        >+{hidden} more</div>
                      )}
                    </React.Fragment>
                  );
                })}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

window.MonthView = MonthView;
