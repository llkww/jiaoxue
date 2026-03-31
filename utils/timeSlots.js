const TIME_SLOT_BLOCKS = Object.freeze([
  Object.freeze({ startPeriod: 1, endPeriod: 2, startTime: '08:00:00', endTime: '09:35:00' }),
  Object.freeze({ startPeriod: 3, endPeriod: 4, startTime: '10:00:00', endTime: '11:35:00' }),
  Object.freeze({ startPeriod: 5, endPeriod: 6, startTime: '14:00:00', endTime: '15:35:00' }),
  Object.freeze({ startPeriod: 7, endPeriod: 8, startTime: '16:00:00', endTime: '17:35:00' }),
  Object.freeze({ startPeriod: 9, endPeriod: 10, startTime: '19:00:00', endTime: '20:35:00' }),
  Object.freeze({ startPeriod: 11, endPeriod: 12, startTime: '20:20:00', endTime: '22:00:00' })
]);

const TIME_SLOT_WEEKDAYS = Object.freeze([
  Object.freeze({ value: 1, label: '周一' }),
  Object.freeze({ value: 2, label: '周二' }),
  Object.freeze({ value: 3, label: '周三' }),
  Object.freeze({ value: 4, label: '周四' }),
  Object.freeze({ value: 5, label: '周五' }),
  Object.freeze({ value: 6, label: '周六' }),
  Object.freeze({ value: 7, label: '周日' })
]);

function buildStandardTimeSlots(options = {}) {
  const { withIds = false } = options;
  const rows = [];
  let id = 1;

  TIME_SLOT_WEEKDAYS.forEach((weekday) => {
    TIME_SLOT_BLOCKS.forEach((block) => {
      const item = {
        weekday: weekday.value,
        startPeriod: block.startPeriod,
        endPeriod: block.endPeriod,
        startTime: block.startTime,
        endTime: block.endTime,
        label: `${weekday.label} 第${block.startPeriod}-${block.endPeriod}节`
      };

      if (withIds) {
        item.id = id;
        id += 1;
      }

      rows.push(item);
    });
  });

  return rows;
}

module.exports = {
  TIME_SLOT_BLOCKS,
  TIME_SLOT_WEEKDAYS,
  buildStandardTimeSlots
};
