const dayjs = require("./dayjs");

function isVip(timestamp) {
    let time = false;
    console.log(`时间字符串 ${timestamp}`);
    const vipTimeDayjs = dayjs(timestamp * 1000); // 将传入的 Unix 时间戳（秒）转换为毫秒
    const currentTimeDayjs = dayjs(); // 获取当前时间的 dayjs 对象
    if (timestamp === 999999999) {
        time = true;
    } else if (vipTimeDayjs.isAfter(currentTimeDayjs, 'seconds')) {
        time = true; // 如果 VIP 到期时间在当前时间之后，格式化为日期字符串
    }
    console.log(`VIP 到期时间 ${vipTimeDayjs.format('YYYY-MM-DD HH:mm:ss')} 当前时间 ${currentTimeDayjs.format('YYYY-MM-DD HH:mm:ss')} 是否为 VIP ${time}`);
    return time;
}

module.exports = {isVip};