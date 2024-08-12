const dayjs = require("./dayjs");

function getVip(timestamp) {
    let time = '';

    if (timestamp === 999999999) {
        time = '永久会员';
    } else {
        const vipTimeDayjs = dayjs(timestamp * 1000); // 将传入的 Unix 时间戳（秒）转换为毫秒
        const currentTimeDayjs = dayjs(); // 获取当前时间的 dayjs 对象

        if (vipTimeDayjs.isAfter(currentTimeDayjs, 'second')) {
            time = vipTimeDayjs.format('YYYY-MM-DD HH:mm:ss'); // 如果 VIP 到期时间在当前时间之后，格式化为日期字符串
        } else {
            time = '已过期'; // 否则显示为已过期
        }
    }

    return time;
}

module.exports = {getVip};