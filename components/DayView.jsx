/* Day view — 48 half-hour bins × 4 GPU columns */
const SLOT_HEIGHT = 22; // px per 30-min slot

function DayView({ date, reservations, onCreate, onEdit, onUpdate, me, now, canEdit, columns, inCol, colHint }) {
  const _canEdit = typeof canEdit === 'function' ? canEdit : () => true;
  const { SLOTS_PER_DAY } = GpuUtils;
  const colLabels = columns || Array.from({length: GpuUtils.GPU_COUNT}).map((_, g) => `GPU ${g}`);
  const GPU_COUNT = colLabels.length;
  const _inCol = inCol || ((r, g) => r.gpus.includes(g));
  const scrollRef = useRef(null);
  const gridRef = useRef(null);
  const [drag, setDrag] = useState(null); // {startSlot, endSlot, startGpu, endGpu}
  const [moveResv, setMoveResv] = useState(null); // {id, mode:'move'|'resize-top'|'resize-bottom', originY, originSlot, originalStart, originalEnd}

  // Scroll to 8am on mount / date change
  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = SLOT_HEIGHT * 16; // 8am = slot 16
    }
  }, [date.toDateString()]);

  const dayStartSlot = GpuUtils.dateToSlotIndex(new Date(date.getFullYear(), date.getMonth(), date.getDate(), 0, 0));

  const gpuFromClientX = (clientX) => {
    if (!gridRef.current) return 0;
    const rect = gridRef.current.getBoundingClientRect();
    const labelWidth = 60;
    const colWidth = (rect.width - labelWidth) / GPU_COUNT;
    const x = clientX - rect.left - labelWidth;
    return Math.max(0, Math.min(GPU_COUNT - 1, Math.floor(x / colWidth)));
  };

  const slotFromClientY = (clientY) => {
    if (!gridRef.current) return 0;
    const rect = gridRef.current.getBoundingClientRect();
    const y = clientY - rect.top;
    return Math.max(0, Math.min(SLOTS_PER_DAY - 1, Math.floor(y / SLOT_HEIGHT)));
  };

  // Global mousemove / mouseup for drag selection
  useEffect(() => {
    if (!drag) return;
    const onMove = (e) => {
      setDrag(d => ({ ...d, endSlot: slotFromClientY(e.clientY), endGpu: gpuFromClientX(e.clientX) }));
    };
    const onUp = () => {
      const d = drag;
      setDrag(null);
      // If the drag started on top of someone else's resv AND didn't move, treat as click-through (open read-only).
      const sameSlot = d.startSlot === d.endSlot && d.startGpu === d.endGpu;
      if (sameSlot && d.onOtherResv) {
        // Forward the click to onEdit via the other resv
        d.onOtherResv(); return;
      }
      const s1 = Math.min(d.startSlot, d.endSlot);
      const s2 = Math.max(d.startSlot, d.endSlot) + 1;
      const g1 = Math.min(d.startGpu, d.endGpu);
      const g2 = Math.max(d.startGpu, d.endGpu);
      const gpus = [];
      for (let g = g1; g <= g2; g++) gpus.push(g);
      onCreate({
        startSlot: dayStartSlot + s1,
        endSlot: dayStartSlot + s2,
        gpus,
      });
    };
    window.addEventListener('mousemove', onMove);
    window.addEventListener('mouseup', onUp);
    return () => {
      window.removeEventListener('mousemove', onMove);
      window.removeEventListener('mouseup', onUp);
    };
  }, [drag, dayStartSlot]);

  // Global mousemove / mouseup for moving/resizing existing
  useEffect(() => {
    if (!moveResv) return;
    const onMove = (e) => {
      const rect = gridRef.current.getBoundingClientRect();
      const y = e.clientY - rect.top;
      const slotDelta = Math.round((y - moveResv.originY) / SLOT_HEIGHT);
      setMoveResv(m => ({ ...m, slotDelta }));
    };
    const onUp = () => {
      const r = reservations.find(x => x.id === moveResv.id);
      if (!r) { setMoveResv(null); return; }
      const delta = moveResv.slotDelta || 0;
      let newStart = r.startSlot, newEnd = r.endSlot;
      if (moveResv.mode === 'move') {
        newStart = moveResv.originalStart + delta;
        newEnd = moveResv.originalEnd + delta;
      } else if (moveResv.mode === 'resize-top') {
        newStart = Math.min(moveResv.originalEnd - 1, moveResv.originalStart + delta);
      } else if (moveResv.mode === 'resize-bottom') {
        newEnd = Math.max(moveResv.originalStart + 1, moveResv.originalEnd + delta);
      }
      if (newStart !== r.startSlot || newEnd !== r.endSlot) {
        onUpdate(r.id, { startSlot: newStart, endSlot: newEnd });
      }
      setMoveResv(null);
    };
    window.addEventListener('mousemove', onMove);
    window.addEventListener('mouseup', onUp);
    return () => {
      window.removeEventListener('mousemove', onMove);
      window.removeEventListener('mouseup', onUp);
    };
  }, [moveResv, reservations]);

  const onGridMouseDown = (e) => {
    if (e.target.closest('.resv.mine')) return;
    const slot = slotFromClientY(e.clientY);
    const gpu = gpuFromClientX(e.clientX);
    setDrag({ startSlot: slot, endSlot: slot, startGpu: gpu, endGpu: gpu });
    e.preventDefault();
  };

  // Build reservations grouped by GPU for this day
  const dayResvs = GpuUtils.resvsOnDate(reservations, date);

  return (
    <div className="day-view">
      <div className="day-view-header" style={{ gridTemplateColumns: `60px repeat(${GPU_COUNT}, minmax(0,1fr))` }}>
        <div className="corner" />
        {colLabels.map((label, g) => (
          <div key={g} className="gpu-col-header">
            <div className="gpu-name">{label}</div>
            <div className="gpu-hint">{colHint || 'drag to select'}</div>
          </div>
        ))}
      </div>

      <div className="day-view-scroll" ref={scrollRef}>
        <div
          className="day-grid"
          ref={gridRef}
          style={{ height: SLOT_HEIGHT * SLOTS_PER_DAY + 'px', gridTemplateColumns: `60px repeat(${GPU_COUNT}, minmax(0,1fr))` }}
          onMouseDown={onGridMouseDown}
        >
          {/* Hour labels column */}
          <div style={{ position: 'relative' }}>
            {Array.from({length: 24}).map((_, h) => (
              <div
                key={h}
                className={`hour-label ${h === 0 ? 'first' : ''}`}
                style={{ position: 'absolute', top: h * 2 * SLOT_HEIGHT, height: 2 * SLOT_HEIGHT, width: '100%' }}
              >
                {h !== 0 && <span>{h % 12 === 0 ? 12 : h % 12} {h < 12 ? 'AM' : 'PM'}</span>}
              </div>
            ))}
          </div>

          {/* GPU columns */}
          {Array.from({length: GPU_COUNT}).map((_, g) => (
            <div key={g} className="gpu-col">
              {/* slot lines */}
              {Array.from({length: SLOTS_PER_DAY}).map((_, s) => (
                <div
                  key={s}
                  className={`slot ${s % 2 === 1 ? 'half' : ''}`}
                  style={{ height: SLOT_HEIGHT }}
                />
              ))}

              {/* Reservations on this GPU */}
              {dayResvs.filter(r => _inCol(r, g)).map(r => {
                const mine = _canEdit(r);
                const clamped = GpuUtils.clampToDay(r, date);
                let top = clamped.startOffset * SLOT_HEIGHT;
                let height = (clamped.endOffset - clamped.startOffset) * SLOT_HEIGHT;

                // Apply move/resize preview
                if (moveResv && moveResv.id === r.id && moveResv.slotDelta) {
                  const d = moveResv.slotDelta;
                  if (moveResv.mode === 'move') {
                    top += d * SLOT_HEIGHT;
                  } else if (moveResv.mode === 'resize-top') {
                    top += d * SLOT_HEIGHT;
                    height -= d * SLOT_HEIGHT;
                  } else if (moveResv.mode === 'resize-bottom') {
                    height += d * SLOT_HEIGHT;
                  }
                }

                const color = MEMBER_COLORS[r.colorIdx % MEMBER_COLORS.length];
                const hasConflict = GpuUtils.findConflicts(r, reservations).length > 0;
                // Compute preview times based on current drag state
                let previewStart = r.startSlot, previewEnd = r.endSlot;
                if (moveResv && moveResv.id === r.id && moveResv.slotDelta) {
                  const d = moveResv.slotDelta;
                  if (moveResv.mode === 'move') { previewStart += d; previewEnd += d; }
                  else if (moveResv.mode === 'resize-top') { previewStart = Math.min(previewEnd - 1, previewStart + d); }
                  else if (moveResv.mode === 'resize-bottom') { previewEnd = Math.max(previewStart + 1, previewEnd + d); }
                }
                const startDate = GpuUtils.slotIndexToDate(previewStart);
                const endDate = GpuUtils.slotIndexToDate(previewEnd);
                const durationMin = (previewEnd - previewStart) * GpuUtils.SLOT_MINUTES;
                const isActive = moveResv?.id === r.id && moveResv?.slotDelta;

                return (
                  <div
                    key={r.id + '-' + g}
                    className={`resv ${mine ? 'mine' : 'readonly'} ${moveResv?.id === r.id ? 'dragging' : ''} ${hasConflict ? 'conflict' : ''}`}
                    style={{
                      top, height: Math.max(14, height),
                      '--resv-color': color.solid,
                      '--resv-bg': color.tint,
                    }}
                    onMouseDown={(e) => {
                      if (!mine) {
                        // Let drag-to-create start through this block; mark click-target for click-through
                        // Flag drag state (if created) to open read-only popover on click
                        setTimeout(() => {
                          setDrag(d => d ? { ...d, onOtherResv: () => onEdit(r) } : d);
                        }, 0);
                        return;
                      }
                      e.stopPropagation();
                      setMoveResv({
                        id: r.id,
                        mode: 'move',
                        originY: e.clientY - gridRef.current.getBoundingClientRect().top,
                        originalStart: r.startSlot,
                        originalEnd: r.endSlot,
                      });
                    }}
                    onClick={(e) => {
                      e.stopPropagation();
                      if (!moveResv) onEdit(r);
                    }}
                    title={`${r.name}: ${GpuUtils.fmtTime(startDate)} – ${GpuUtils.fmtTime(endDate)}${mine ? '' : ' (read-only)'}`}
                  >
                    {mine && <div
                      className="resv-resize top"
                      onMouseDown={(e) => {
                        e.stopPropagation();
                        setMoveResv({
                          id: r.id, mode: 'resize-top',
                          originY: e.clientY - gridRef.current.getBoundingClientRect().top,
                          originalStart: r.startSlot, originalEnd: r.endSlot,
                        });
                      }}
                    />}
                    <div className="resv-name">{r.recurring ? '↻ ' : ''}{r.name}</div>
                    <div className="resv-time" style={isActive ? { color: color.solid, fontWeight: 600 } : null}>
                      {GpuUtils.fmtTimeShort(startDate)} – {GpuUtils.fmtTimeShort(endDate)}
                      {isActive && <span style={{marginLeft: 4, opacity: 0.75}}>· {GpuUtils.humanDuration(durationMin)}</span>}
                    </div>
                    {r.note && height > 44 && !isActive && <div className="resv-note">{r.note}</div>}
                    {isActive && (
                      <React.Fragment>
                        <div className="resv-duration-badge">{GpuUtils.humanDuration(durationMin)}</div>
                        <div className="resv-edge-time top">{GpuUtils.fmtTimeShort(startDate)}</div>
                        <div className="resv-edge-time bottom">{GpuUtils.fmtTimeShort(endDate)}</div>
                      </React.Fragment>
                    )}
                    {mine && <div
                      className="resv-resize bottom"
                      onMouseDown={(e) => {
                        e.stopPropagation();
                        setMoveResv({
                          id: r.id, mode: 'resize-bottom',
                          originY: e.clientY - gridRef.current.getBoundingClientRect().top,
                          originalStart: r.startSlot, originalEnd: r.endSlot,
                        });
                      }}
                    />}
                  </div>
                );
              })}
            </div>
          ))}

          {/* Drag rectangle */}
          {drag && (() => {
            const s1 = Math.min(drag.startSlot, drag.endSlot);
            const s2 = Math.max(drag.startSlot, drag.endSlot) + 1;
            const g1 = Math.min(drag.startGpu, drag.endGpu);
            const g2 = Math.max(drag.startGpu, drag.endGpu) + 1;
            if (!gridRef.current) return null;
            const rect = gridRef.current.getBoundingClientRect();
            const labelWidth = 60;
            const colWidth = (rect.width - labelWidth) / GPU_COUNT;
            return (
              <div
                className="drag-rect"
                style={{
                  left: labelWidth + g1 * colWidth + 2,
                  width: (g2 - g1) * colWidth - 4,
                  top: s1 * SLOT_HEIGHT,
                  height: (s2 - s1) * SLOT_HEIGHT,
                }}
              />
            );
          })()}

          {/* Now indicator (only if today) */}
          {GpuUtils.sameDay(date, now) && (() => {
            const mins = now.getHours() * 60 + now.getMinutes();
            const top = (mins / 30) * SLOT_HEIGHT;
            return (
              <div className="now-line" style={{ top }}>
                <span className="now-dot-label">{GpuUtils.fmtTimeShort(now)}</span>
              </div>
            );
          })()}
        </div>
      </div>
    </div>
  );
}

window.DayView = DayView;
window.DAY_SLOT_HEIGHT = SLOT_HEIGHT;
