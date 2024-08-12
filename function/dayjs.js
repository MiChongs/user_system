const dayjs = require('dayjs');
const utc = require('dayjs/plugin/utc');
const timezone = require('dayjs/plugin/timezone');

function initializeDayjsTimezone(defaultTimezone = 'Asia/Shanghai') {
    dayjs.extend(utc);
    dayjs.extend(timezone);
    dayjs.tz.setDefault(defaultTimezone);
}

initializeDayjsTimezone();

module.exports = dayjs;