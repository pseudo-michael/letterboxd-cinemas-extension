// Everything on screen is shown in London time, whatever timezone the browser is in.

const TZ = "Europe/London";
const MONTHS = ["January", "February", "March", "April", "May", "June", "July", "August",
  "September", "October", "November", "December"];
const DAYS = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];

const formatter = new Intl.DateTimeFormat("en-GB", {
  timeZone: TZ, year: "numeric", month: "numeric", day: "numeric",
  hour: "numeric", minute: "numeric", hourCycle: "h23",
});

export function londonParts(ms) {
  const p = {};
  for (const { type, value } of formatter.formatToParts(ms)) p[type] = Number(value);
  const weekday = new Date(Date.UTC(p.year, p.month - 1, p.day)).getUTCDay();
  return { year: p.year, month: p.month, day: p.day, hour: p.hour, minute: p.minute, weekday };
}

export const londonYear = (ms) => londonParts(ms).year;
export const dayKey = (ms) => { const p = londonParts(ms); return `${p.year}-${p.month}-${p.day}`; };

export function fmtTime(ms) {
  const p = londonParts(ms);
  return `${String(p.hour).padStart(2, "0")}:${String(p.minute).padStart(2, "0")}`;
}

/** "Mon 19 Oct" */
export function fmtDayShort(ms) {
  const p = londonParts(ms);
  return `${DAYS[p.weekday].slice(0, 3)} ${p.day} ${MONTHS[p.month - 1].slice(0, 3)}`;
}

/** "Monday 19 October" */
export function fmtDayLong(ms) {
  const p = londonParts(ms);
  return `${DAYS[p.weekday]} ${p.day} ${MONTHS[p.month - 1]}`;
}

/** "Mon 19 Oct, 18:15" */
export const fmtWhen = (ms) => `${fmtDayShort(ms)}, ${fmtTime(ms)}`;
