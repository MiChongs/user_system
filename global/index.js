const {Sequelize, DataTypes} = require("sequelize");
const crypto = require("crypto");
const jwt = require("jsonwebtoken");
const bodyParser = require('body-parser')
const IP2Region = require('ip2region').default;
const mysql = require("../database/index")
const multer = require('multer')
const mkdirp = require('mkdirp')
const moment = require('moment')
const fs = require("fs");
const bcrypt = require("bcrypt");
const ejs = require('ejs');
const Boom = require('@hapi/boom');
const stringRandom = require('string-random');
const stringFormat = require('string-kit').format;
const {log} = require("console");
const nowDate = moment().format('YYYY-MM-DD')
const dayjs = require('dayjs');
const emptinessCheck = require('emptiness-check');
const nodemailer = require('nodemailer');
const redis = require('redis');
const {User} = require("../models/user");
const {Log} = require("../models/log");
const {AdminLog} = require("../models/adminLog");
const axios = require("axios");
exports.lodash = require("lodash");
exports.shortId = require('shortid');
exports.validUrl = require('valid-url');
exports.http = require('http');
exports.socketIO = require('socket.io');

const redisClient = redis.createClient({
    password: process.env.REDIS_PASSWORD, socket: {
        host: process.env.REDIS_HOST,
        port: process.env.REDIS_PORT,
        connectTimeout: 10000,
        keepAlive: true,
        keepAliveInterval: 10000,
        noDelay: true,
        reconnectStrategy: function (times) {
            return Math.min(times * 100, 2000);
        }
    }
});


// 封装保存上传文件功能

exports.adminPath = ['/login', '/resetPassword', '/sendMail', '/register', '/logout', /^\/public\/.*/, /^\/avatars\/.*/, /^\/static\/.*/, /^\/user_disk\/.*/, /^\/user_video\/.*/]

exports.userPath = ['/login', '/devices-by-password', '/captcha', '/banner', '/logout-device-by-password', '/register', '/login_qq', '/sendMail', '/resetPassword', '/logout', '/logout', /^\/public\/.*/, /^\/avatars\/.*/, /^\/static\/.*/, /^\/user_disk\/.*/, /^\/user_video\/.*/]

exports.adminAbsolutePath = ['/api/admin/login', '/api/admin/resetPassword', '/api/admin/sendMail', '/api/admin/register', '/api/admin/logout', /^\/public\/.*/, /^\/avatars\/.*/, /^\/static\/.*/, /^\/user_disk\/.*/, /^\/user_video\/.*/]

exports.userAbsolutePath = ['/api/user/login', '/api/user/devices-by-password', '/api/user/logout-device-by-password', '/api/user/banner', '/api/user/captcha', '/api/user/register', '/api/user/login_qq', '/api/user/sendMail', '/api/user/resetPassword', '/api/user/logout', '/api/user/logout', /^\/public\/.*/, /^\/avatars\/.*/, /^\/static\/.*/, /^\/user_disk\/.*/, /^\/user_video\/.*/]

exports.rolePath = ['/login', '/logout', /^\/public\/.*/, /^\/avatars\/.*/, /^\/static\/.*/, /^\/user_disk\/.*/, /^\/user_video\/.*/]

exports.roleAbsolutePath = ['/api/role/login', '/api/role/logout', /^\/public\/.*/, /^\/avatars\/.*/, /^\/static\/.*/, /^\/user_disk\/.*/, /^\/user_video\/.*/]

// 监听客户端连接 Redis 成功，成功后执行回调
redisClient.on("ready", () => {
    //订阅主题
});
// 监听客户端连接 Redis 异常，异常后执行回调
redisClient.on("error", function (error) {
    console.log(error);
});
// 监听订阅主题成功，成功后执行回调
redisClient.on("subscribe", (channel, count) => {
    console.log(`订阅频道：${channel}，当前总共订阅${count}个频道。`);
});
// 监听 Redis 发布的消息，收到消息后执行回调。
redisClient.on("message", (channel, message) => {
    console.log(`当前频道：${channel}，收到消息为：${message}`);
});
// 监听取消订阅主题，取消后执行回调
redisClient.on("unsubscribe", (channel, count) => {
    console.log(`取消订阅频道：${channel}，当前总共订阅${count}个频道。`);
});


/*

*/

const upload = () => {
    const storage = multer.diskStorage({
        destination: async (req, file, cb) => { // 指定上传后保存到哪一个文件夹中
            await mkdirp(`./public/avatars/`)  // 创建目录
            cb(null, `public/avatars`) //
        }, filename: (req, file, cb) => { // 给保存的文件命名
            let extname = path.extname(file.originalname); // 获取后缀名

            let fileName = path.parse(file.originalname).name // 获取上传的文件名
            cb(null, `${fileName}-${Date.now()}${extname}`)
        }
    })

    return multer({storage})
}

function isEmptyStr(s) {
    return s === undefined || s == null || s === '';
}

module.exports.isEmptyStr = isEmptyStr;

exports.createAdminLog = async function (type, req, res, result) {
    let string;
    if (type === 'admin_login') {
        string = logString(type, result.account, moment().format('YYYY-MM-DD HH:mm:ss'), req.clientIp, req.body.markcode)
    } else if (type === 'admin_logout') {
        string = logString(type, result.account, req.clientIp, req.body.markcode, moment().format('YYYY-MM-DD HH:mm:ss'))
    } else {
        string = logString(type, req.clientIp, req.body.markcode, moment().format('YYYY-MM-DD HH:mm:ss'))
    }
    await AdminLog.create({
        log_type: type,
        log_content: string,
        log_ip: req.clientIp,
        log_time: moment().format('YYYY-MM-DD HH:mm:ss'),
        log_user_id: result.account,
    }).catch(err => {
        res.status(500).json({
            code: 500, msg: '创建管理员日志失败'
        })
        console.log(err)
    })
}

// 上述代码是直接获取的IPV4地址，如果获取到的是IPV6，则通过字符串的截取来转换为IPV4地址。
function ipv6ToV4(ip) {
    if (ip.split(',').length > 0) {
        ip = ip.split(',')[0]
    }
    ip = ip.substr(ip.lastIndexOf(':') + 1, ip.length);
    return ip
}

exports.lookupAllGeoInfo = async function (ip) {
    const url = `https://webapi-pc.meitu.com/common/ip_location?ip=${ip}`;

    try {
        const response = await axios.get(url);
        const data = response.data.data[ip];

        if (!data) {
            throw new Error('No data found for the provided IP');
        }

        // 使用提供的 IP 数据模型结构
        const allInfo = {
            area_code: data.area_code || '未知',
            city: data.city || '未知',
            city_id: data.city_id || 0,
            continent: data.continent || '未知',
            continent_code: data.continent_code || '未知',
            country_id: data.country_id || 0,
            isp: data.isp || '未知',
            latitude: data.latitude || 0,
            longitude: data.longitude || 0,
            nation: data.nation || '未知',
            nation_code: data.nation_code || '未知',
            province: data.province || '未知',
            province_id: data.province_id || 0,
            subdivision_1_iso_code: data.subdivision_1_iso_code || '未知',
            subdivision_1_name: data.subdivision_1_name || '未知',
            subdivision_2_iso_code: data.subdivision_2_iso_code || '未知',
            subdivision_2_name: data.subdivision_2_name || '未知',
            time_zone: data.time_zone || '未知',

            // 额外参数
            registeredCountryNameZh: data.nation || '未知',
            countryIsoCode: data.nation_code || '未知',
            provinceName: data.province || '未知',
            cityNameZh: data.city || '未知',
            autonomousSystemNumber: '未知',
            autonomousSystemOrganization: data.isp || '未知'
        };

        return allInfo;
    } catch (error) {
        console.error('Error looking up all geo information:', error);
        const allInfo = {
            area_code: '未知',
            city: '未知',
            city_id: 0,
            continent: '未知',
            continent_code: '未知',
            country_id: 0,
            isp: '未知',
            latitude: 0,
            longitude: 0,
            nation: '未知',
            nation_code: '未知',
            province: '未知',
            province_id: 0,
            subdivision_1_iso_code: '未知',
            subdivision_1_name: '未知',
            subdivision_2_iso_code: '未知',
            subdivision_2_name: '未知',
            time_zone: '未知',

            // 额外参数
            registeredCountryNameZh: '未知',
            countryIsoCode: '未知',
            provinceName: '未知',
            cityNameZh: '未知',
            autonomousSystemNumber: '未知',
            autonomousSystemOrganization: '未知'
        };
        return allInfo;
    }
};
function logString(type, ...format) {
    let content;
    if (type === 'login') {
        content = stringFormat('%s 使用设备码 %s 在 %s 进行登录', format[0], format[1], format[2])
    } else if (type === 'register') {
        content = stringFormat('IP 为 %s 使用设备码 %s 在 %s 进行注册', format[0], format[1], format[2])
    } else if (type === 'admin_register') {
        content = stringFormat('IP 为 %s 使用设备码 %s 在 %s 进行注册应用管理员', format[0], format[1], format[2])
    } else if (type === 'logout') {
        content = '{0} 使用设备码 {1} 在 {2} 进行登出'.stringFormat(format);
    } else if (type === 'daily') {
        content = stringFormat('IP 为 %s 使用设备码 %s 在 %s 进行签到', format[0], format[1], format[2])
    } else if (type === 'logutDevice') {
        content = '{0} 使用设备码 {1} 在 {2} 进行删除'.stringFormat(format);
    } else if (type === 'card_use') {
        content = stringFormat('%s 在 %s 使用了 %s 卡密', format[0], format[1], format[2]);
    } else if (type === 'vip_time_add') {
        content = stringFormat('%s 在 %s 使用了 %s 卡密,天数增加 %s 天,新到期时间:%s', format[0], format[1], format[2], format[3], format[4], format[5]);
    } else if (type === 'integral_add') {
        content = stringFormat('%s 在 %s 使用了 %s 卡密,积分增加 %s 个积分,新积分:%s', format[0], format[1], format[2], format[3], format[4], format[5]);
    } else if (type === 'pay_vip') {
        content = '{0} 在 {1} 充值了 {2} 会员'.stringFormat(format);
    } else if (type === 'card_generate') {
        content = '{0} 在 {1} 生成了 {2} 个卡密'.stringFormat(format);
    } else if (type === 'card_delete') {
        content = '{0} 在 {1} 删除了 {2} 个卡密'.stringFormat(format);
    } else if (type === 'card_recharge') {
        content = '{0} 在 {1} 充值了 {2} 个卡密'.stringFormat(format);
    } else if (type === 'card_recharge_fail') {
        content = '{0} 在 {1} 充值失败'.stringFormat(format);
    } else if (type === 'admin_login') {
        content = stringFormat('%s 在 %s 登录了后台, IP 地址为 %s，设备码为 %s', format[0], format[1], format[2], format[3]);
    } else if (type === 'createApp') {
        content = '管理员 {0} 在 {1} 创建了应用 {2}'.stringFormat(format);
    } else if (type === 'deleteApp') {
        content = '管理员 {0} 在 {1} 删除了应用 {2}'.stringFormat(format);
    } else if (type === 'updateAppConfig') {
        content = '管理员 {0} 在 {1} 更新了应用 {2}'.stringFormat(format);
    } else if (type === 'updateUser') {
        content = '管理员 {0} 在 {1} 更新了应用为 {2} 中用户 为 {3} 的信息'.stringFormat(format);
    }

    return content;
}

/**
 * @description: 随机密码
 * @param {*} len 密码位数
 * @param {*} mode 密码难度：hide(大小写数字特殊字符)、medium(大小写数字)、low(小写数字)
 * @Date: 2021-07-02 15:52:32
 */
exports.randomPass = function (len = 16, mode = "high") {
    const lowerCaseArr = ['a', 'b', 'c', 'd', 'e', 'f', 'g', 'h', 'i', 'j', 'k', 'l', 'm', 'n', 'o', 'p', 'q', 'r', 's', 't', 'u', 'v', 'w', 'x', 'y', 'z',];
    const blockLetterArr = ['A', 'B', 'C', 'D', 'E', 'F', 'G', 'H', 'I', 'J', 'K', 'L', 'M', 'N', 'O', 'P', 'Q', 'R', 'S', 'T', 'U', 'V', 'W', 'X', 'Y', 'Z'];
    const numberArr = [0, 1, 2, 3, 4, 5, 6, 7, 8, 9];
    const specialArr = ['!', '@', '-', '_', '=', '<', '>', '#', '*', '%', '+', '&', '^', '$'];
    const passArr = [];
    let password = '';

    //指定参数随机获取一个字符
    const specifyRandom = function (...arr) {
        let str = "";
        arr.forEach(item => {
            str += item[Math.floor(Math.random() * item.length)]
        });
        return str;
    }

    switch (mode) {
        case "high":
            //安全最高的
            password += specifyRandom(lowerCaseArr, blockLetterArr, numberArr, specialArr);
            passArr.push(...lowerCaseArr, ...blockLetterArr, ...numberArr, ...specialArr);
            break;
        case "medium":
            //中等的
            password += specifyRandom(lowerCaseArr, blockLetterArr, numberArr);
            passArr.push(...lowerCaseArr, ...blockLetterArr, ...numberArr);
            break;
        //低等的
        case "low":
            password += specifyRandom(lowerCaseArr, numberArr);
            passArr.push(...lowerCaseArr, ...numberArr);
            break;
        default:
            password += specifyRandom(lowerCaseArr, numberArr);
            passArr.push(...lowerCaseArr, ...numberArr);
    }

    const forLen = len - password.length;
    for (let i = 0; i < forLen; i++) {
        password += specifyRandom(passArr);
    }

    return password;
}

exports.generateOrderNumber = function generateOrderNumber() {
    const now = new Date();

    // 获取年份、月份、日期、小时、分钟、秒、毫秒
    const year = now.getFullYear();
    const month = String(now.getMonth() + 1).padStart(2, '0');
    const day = String(now.getDate()).padStart(2, '0');
    const hours = String(now.getHours()).padStart(2, '0');
    const minutes = String(now.getMinutes()).padStart(2, '0');
    const seconds = String(now.getSeconds()).padStart(2, '0');
    const milliseconds = String(now.getMilliseconds()).padStart(3, '0');

    // 生成随机数
    const randomNum = String(Math.floor(Math.random() * 1000)).padStart(3, '0');

    // 生成订单号
    const orderNumber = `${year}${month}${day}${hours}${minutes}${seconds}${milliseconds}${randomNum}`;

    return orderNumber;
}


exports.getToken = function (token) {
    let newToken = token
    if (newToken.indexOf('Bearer') >= 0) {
        newToken = newToken.replace('Bearer ', '')
    }
    return newToken
}
module.exports.crypto = crypto;
module.exports.jwt = jwt;
module.exports.upload = upload;
module.exports.fs = fs;
module.exports.moment = moment;
module.exports.stringRandom = stringRandom;
module.exports.logString = logString;
module.exports.dayjs = dayjs;
module.exports.emptinessCheck = emptinessCheck;
module.exports.nodemailer = nodemailer;
module.exports.ejs = ejs;
module.exports.redisClient = redisClient;