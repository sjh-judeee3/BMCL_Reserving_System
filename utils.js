// Date and reservation utilities

const SLOT_MINUTES = 30;
const SLOTS_PER_DAY = (24 * 60) / SLOT_MINUTES; // 48
const GPU_COUNT = 4;

// Color palette for members — SYSTEM colors (blue for today, green for now, red for accent)
// are deliberately excluded so reservation blocks never visually collide with the UI.
const MEMBER_COLORS = [
  { name: 'babyblue', solid: '#89CFF0', tint: 'rgba(137,207,240,0.32)' },   // juhee
  { name: 'matcha',   solid: '#889e4c', tint: 'rgba(136,158,76,0.28)' },    // suhyun
  { name: 'lilac',    solid: '#c595db', tint: 'rgba(197,149,219,0.30)' },   // jiwon
  { name: 'babypink', solid: '#ffb8dc', tint: 'rgba(255,184,220,0.36)' },   // yunji
  { name: 'darkblue', solid: '#4370c4', tint: 'rgba(67,112,196,0.24)' },    // suheon
  { name: 'rose',     solid: '#F4B8B1', tint: 'rgba(244,184,177,0.36)' },   // yangyang
  { name: 'butter',   solid: '#ead27a', tint: 'rgba(234,210,122,0.32)' },
  { name: 'sage',     solid: '#7fb8a4', tint: 'rgba(127,184,164,0.28)' },
  { name: 'dusk',     solid: '#a6a6d4', tint: 'rgba(166,166,212,0.28)' },
  { name: 'clay',     solid: '#c19a7a', tint: 'rgba(193,154,122,0.28)' },
];

function uid() {
  return Math.random().toString(36).slice(2, 10) + Date.now().toString(36).slice(-4);
}

function pad2(n) { return String(n).padStart(2, '0'); }

function ymd(date) {
  return `${date.getFullYear()}-${pad2(date.getMonth()+1)}-${pad2(date.getDate())}`;
}

function parseYmd(s) {
  const [y,m,d] = s.split('-').map(Number);
  return new Date(y, m-1, d);
}

function fmtTime(date) {
  const h = date.getHours();
  const m = date.getMinutes();
  const ampm = h >= 12 ? 'PM' : 'AM';
  const h12 = h % 12 === 0 ? 12 : h % 12;
  return `${h12}:${pad2(m)} ${ampm}`;
}

function fmtTimeShort(date) {
  const h = date.getHours();
  const m = date.getMinutes();
  const ampm = h >= 12 ? 'pm' : 'am';
  const h12 = h % 12 === 0 ? 12 : h % 12;
  if (m === 0) return `${h12}${ampm}`;
  return `${h12}:${pad2(m)}${ampm}`;
}

function fmtDateLong(date) {
  const months = ['January','February','March','April','May','June','July','August','September','October','November','December'];
  const dows = ['Sunday','Monday','Tuesday','Wednesday','Thursday','Friday','Saturday'];
  return `${dows[date.getDay()]}, ${months[date.getMonth()]} ${date.getDate()}`;
}

function fmtMonth(date) {
  const months = ['January','February','March','April','May','June','July','August','September','October','November','December'];
  return `${months[date.getMonth()]} ${date.getFullYear()}`;
}

function fmtWeek(date) {
  const start = startOfWeek(date);
  const end = new Date(start);
  end.setDate(end.getDate() + 6);
  const months = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
  if (start.getMonth() === end.getMonth()) {
    return `${months[start.getMonth()]} ${start.getDate()} – ${end.getDate()}, ${end.getFullYear()}`;
  }
  return `${months[start.getMonth()]} ${start.getDate()} – ${months[end.getMonth()]} ${end.getDate()}, ${end.getFullYear()}`;
}

function startOfWeek(date) {
  const d = new Date(date);
  const dow = d.getDay(); // 0 = Sun
  d.setDate(d.getDate() - dow);
  d.setHours(0,0,0,0);
  return d;
}

function startOfMonth(date) {
  return new Date(date.getFullYear(), date.getMonth(), 1);
}

function endOfMonth(date) {
  return new Date(date.getFullYear(), date.getMonth()+1, 0);
}

function addDays(date, n) {
  const d = new Date(date);
  d.setDate(d.getDate() + n);
  return d;
}

function sameDay(a, b) {
  return a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate();
}

// Convert a Date to absolute slot index (globally unique by ms since epoch / slot duration)
function dateToSlotIndex(date) {
  return Math.floor(date.getTime() / (SLOT_MINUTES * 60 * 1000));
}

function slotIndexToDate(idx) {
  return new Date(idx * SLOT_MINUTES * 60 * 1000);
}

// Check if two reservations overlap in time AND share at least one GPU
function conflicts(a, b) {
  if (a.id === b.id) return false;
  if (a.endSlot <= b.startSlot || b.endSlot <= a.startSlot) return false;
  return a.gpus.some(g => b.gpus.includes(g));
}

function findConflicts(resv, all) {
  return all.filter(r => conflicts(resv, r));
}

// Get all reservations touching a specific date (for a GPU or all GPUs)
function resvsOnDate(resvs, date, gpu) {
  const dayStart = dateToSlotIndex(new Date(date.getFullYear(), date.getMonth(), date.getDate(), 0, 0));
  const dayEnd = dayStart + SLOTS_PER_DAY;
  return resvs.filter(r => {
    if (r.endSlot <= dayStart || r.startSlot >= dayEnd) return false;
    if (gpu !== undefined && !r.gpus.includes(gpu)) return false;
    return true;
  });
}

// Clamp a reservation's rendering window to a given day (in slot indices)
function clampToDay(r, date) {
  const dayStart = dateToSlotIndex(new Date(date.getFullYear(), date.getMonth(), date.getDate(), 0, 0));
  const dayEnd = dayStart + SLOTS_PER_DAY;
  return {
    startSlot: Math.max(r.startSlot, dayStart),
    endSlot: Math.min(r.endSlot, dayEnd),
    startOffset: Math.max(0, r.startSlot - dayStart),
    endOffset: Math.min(SLOTS_PER_DAY, r.endSlot - dayStart),
  };
}

// For "available now" strip
function availabilityNow(resvs, now) {
  const nowSlot = dateToSlotIndex(now);
  const result = [];
  for (let gpu = 0; gpu < GPU_COUNT; gpu++) {
    // Find active reservation
    const active = resvs.find(r => r.gpus.includes(gpu) && r.startSlot <= nowSlot && r.endSlot > nowSlot);
    if (active) {
      result.push({ gpu, busy: true, until: slotIndexToDate(active.endSlot), name: active.name });
    } else {
      // Find next reservation
      const upcoming = resvs
        .filter(r => r.gpus.includes(gpu) && r.startSlot > nowSlot)
        .sort((a,b) => a.startSlot - b.startSlot)[0];
      result.push({
        gpu,
        busy: false,
        until: upcoming ? slotIndexToDate(upcoming.startSlot) : null,
        next: upcoming ? upcoming.name : null,
      });
    }
  }
  return result;
}

function fmtMonthDay(date) {
  const months = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
  return `${months[date.getMonth()]} ${date.getDate()}`;
}

function humanDuration(mins) {
  if (mins < 60) return `${mins}m`;
  const h = Math.floor(mins/60);
  const m = mins % 60;
  if (m === 0) return `${h}h`;
  return `${h}h ${m}m`;
}

function untilText(date, now) {
  const diffMin = Math.round((date - now) / 60000);
  if (diffMin < 1) return 'now';
  if (diffMin < 60) return `in ${diffMin}m`;
  const h = Math.floor(diffMin/60);
  const m = diffMin % 60;
  // Same day → show time, else show date+time
  if (sameDay(date, now)) return `until ${fmtTimeShort(date)}`;
  return `until ${['Sun','Mon','Tue','Wed','Thu','Fri','Sat'][date.getDay()]} ${fmtTimeShort(date)}`;
}

window.GpuUtils = {
  SLOT_MINUTES, SLOTS_PER_DAY, GPU_COUNT, MEMBER_COLORS,
  uid, pad2, ymd, parseYmd,
  fmtTime, fmtTimeShort, fmtDateLong, fmtMonth, fmtWeek, fmtMonthDay,
  startOfWeek, startOfMonth, endOfMonth, addDays, sameDay,
  dateToSlotIndex, slotIndexToDate,
  conflicts, findConflicts, resvsOnDate, clampToDay,
  availabilityNow, humanDuration, untilText,
};
