'use strict';

const PRICE = 90000;
const RULES_VERSION = 'rules-draft-v1';
const DOCUMENT_VERSION = 'health-privacy-terms-draft-v1';
const DAY_MS = 86400000;

function fail(code, message) {
  const error = new Error(message);
  error.code = code;
  error.safe = true;
  throw error;
}
function requireThat(condition, code, message) {
  if (!condition) fail(code, message);
}
function parseDay(value) {
  requireThat(typeof value === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(value), 'DATE', '日期格式应为YYYY-MM-DD');
  const stamp = Date.parse(value + 'T00:00:00Z');
  requireThat(Number.isFinite(stamp) && new Date(stamp).toISOString().slice(0, 10) === value, 'DATE', '日期不存在');
  return stamp;
}
function businessDate(now) {
  const stamp = new Date(now).getTime();
  requireThat(Number.isFinite(stamp), 'DATE', '服务时间无效');
  return new Date(stamp + 8 * 3600000).toISOString().slice(0, 10);
}
function addDays(date, amount) {
  return new Date(parseDay(date) + amount * DAY_MS).toISOString().slice(0, 10);
}
function dayNumber(start, date) {
  return Math.floor((parseDay(date) - parseDay(start)) / DAY_MS) + 1;
}
function periods(start) {
  parseDay(start);
  return Array.from({ length: 13 }, (_, index) => ({
    index,
    number: index + 1,
    label: index === 12 ? '结营6天' : '第' + (index + 1) + '周',
    start: addDays(start, index * 7),
    end: addDays(start, index === 12 ? 89 : index * 7 + 6),
    days: index === 12 ? 6 : 7,
    required: index === 12 ? 4 : 5,
    rewardFen: index === 12 ? 6000 : 7000
  }));
}
function currentPeriod(start, today) {
  const day = dayNumber(start, today);
  return periods(start)[Math.min(12, Math.max(0, Math.floor((day - 1) / 7)))];
}
function recordKey(userId, campId, date) { return userId + ':' + campId + ':' + date; }
function periodStats(state, enrollment, period) {
  const rows = Array.from({ length: period.days }, (_, index) => {
    const date = addDays(period.start, index);
    const record = state.checkins[recordKey(enrollment.userId, enrollment.campId, date)];
    return { date, short: date.slice(5), status: record ? record.status : 'missing' };
  });
  const valid = rows.filter(row => row.status === 'complete').length;
  const exempt = rows.filter(row => row.status === 'exempt').length;
  return { valid, exempt, remainingExempt: Math.max(0, 2 - exempt), qualified: valid >= period.required, rows };
}
function integer(value, min, max, message) {
  const number = Number(value);
  requireThat(Number.isInteger(number) && number >= min && number <= max, 'INPUT', message);
  return number;
}
function finiteNumber(value, min, max, message) {
  requireThat(value !== '' && value !== null && value !== undefined, 'INPUT', message);
  const number = Number(value);
  requireThat(Number.isFinite(number) && number >= min && number <= max, 'INPUT', message);
  return Math.round(number * 10) / 10;
}
function text(value, min, max, message) {
  requireThat(typeof value === 'string', 'INPUT', message);
  const cleaned = value.trim();
  requireThat(cleaned.length >= min && cleaned.length <= max, 'INPUT', message);
  return cleaned;
}
function money(fen) { return (fen / 100).toFixed(fen % 100 === 0 ? 0 : 2); }

module.exports = { PRICE, RULES_VERSION, DOCUMENT_VERSION, fail, requireThat, businessDate, addDays, dayNumber, periods, currentPeriod, periodStats, recordKey, integer, finiteNumber, text, money };
