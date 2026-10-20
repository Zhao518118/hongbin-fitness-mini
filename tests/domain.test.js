const test = require('node:test');
const assert = require('node:assert/strict');
const { D } = require('./helpers');

test('北京时间午夜边界不依赖宿主机时区', () => {
  assert.equal(D.businessDate('2026-10-20T15:59:59Z'), '2026-10-20');
  assert.equal(D.businessDate('2026-10-20T16:00:00Z'), '2026-10-21');
});
test('训练周从开营日起算，跨月、跨年、闰日正确', () => {
  assert.equal(D.addDays('2024-02-28', 1), '2024-02-29');
  assert.equal(D.addDays('2026-12-31', 1), '2027-01-01');
  assert.equal(D.currentPeriod('2026-10-28', '2026-11-03').index, 0);
  assert.equal(D.currentPeriod('2026-10-28', '2026-11-04').index, 1);
});
for (const [day, index] of [[1, 0], [7, 0], [8, 1], [84, 11], [85, 12], [90, 12], [91, 12]]) {
  test('第' + day + '天周期边界', () => assert.equal(D.currentPeriod('2026-10-20', D.addDays('2026-10-20', day - 1)).index, index));
}
test('13个周期覆盖恰好90天，总额90000分，无额外奖金', () => {
  const rows = D.periods('2026-10-20');
  assert.equal(rows.length, 13);
  assert.equal(rows.reduce((sum, p) => sum + p.days, 0), 90);
  assert.equal(rows.reduce((sum, p) => sum + p.rewardFen, 0), 90000);
  assert.deepEqual([rows[12].days, rows[12].required, rows[12].rewardFen], [6, 4, 6000]);
  for (let i = 1; i < rows.length; i++) assert.equal(rows[i].start, D.addDays(rows[i - 1].end, 1));
});
test('不存在的日期、注入字符串及非整数金额/时长被拒绝', () => {
  for (const value of ['2026-02-30', '20-01-01', '2026-10-20<script>']) assert.throws(() => D.periods(value), { code: 'DATE' });
  assert.throws(() => D.integer(1.5, 0, 180, 'invalid'), { code: 'INPUT' });
  assert.throws(() => D.finiteNumber('', 1, 100, 'invalid'), { code: 'INPUT' });
});
