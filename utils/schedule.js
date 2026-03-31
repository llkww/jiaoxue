const PERIODS = [
  { period: 1, label: '第1节', time: '08:00 - 08:45' },
  { period: 2, label: '第2节', time: '08:55 - 09:40' },
  { period: 3, label: '第3节', time: '10:00 - 10:45' },
  { period: 4, label: '第4节', time: '10:55 - 11:40' },
  { period: 5, label: '第5节', time: '14:00 - 14:45' },
  { period: 6, label: '第6节', time: '14:55 - 15:40' },
  { period: 7, label: '第7节', time: '16:00 - 16:45' },
  { period: 8, label: '第8节', time: '16:55 - 17:40' },
  { period: 9, label: '第9节', time: '18:30 - 19:15' },
  { period: 10, label: '第10节', time: '19:25 - 20:10' },
  { period: 11, label: '第11节', time: '20:20 - 21:05' },
  { period: 12, label: '第12节', time: '21:15 - 22:00' }
];

const WEEKDAYS = [
  { value: 1, label: '周一' },
  { value: 2, label: '周二' },
  { value: 3, label: '周三' },
  { value: 4, label: '周四' },
  { value: 5, label: '周五' },
  { value: 6, label: '周六' },
  { value: 7, label: '周日' }
];

function getWeekdayLabel(value) {
  return WEEKDAYS.find((item) => item.value === Number(value))?.label || `周${value}`;
}

function buildScheduleGrid(items = []) {
  const occupied = new Map();

  items.forEach((item) => {
    const span = item.end_period - item.start_period + 1;
    occupied.set(`${item.weekday}-${item.start_period}`, {
      ...item,
      weekday_label: getWeekdayLabel(item.weekday),
      span
    });

    for (let period = item.start_period + 1; period <= item.end_period; period += 1) {
      occupied.set(`${item.weekday}-${period}`, { skip: true });
    }
  });

  return PERIODS.map((period) => ({
    period,
    days: WEEKDAYS.map((weekday) => occupied.get(`${weekday.value}-${period.period}`) || null)
  }));
}

module.exports = {
  PERIODS,
  WEEKDAYS,
  getWeekdayLabel,
  buildScheduleGrid
};
