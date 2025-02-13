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
const bcrypt = require("bcryptjs");
const ejs = require('ejs');
const Boom = require('@hapi/boom');
const stringRandom = require('string-random');
const stringFormat = require('string-kit').format;
const {log} = require("console");
const nowDate = moment().format('YYYY-MM-DD')
const dayjs = require('dayjs');
const emptinessCheck = require('emptiness-check');
const nodemailer = require('nodemailer');
const Redis = require('ioredis');
const {User} = require("../models/user");
const {Log} = require("../models/log");
const {AdminLog} = require("../models/adminLog");
const axios = require("axios");
exports.lodash = require("lodash");
exports.shortId = require('shortid');
exports.validUrl = require('valid-url');
exports.http = require('http');
exports.socketIO = require('socket.io');

const onlineUsers = new Map();

// 创建 Redis 客户端实例
const redisClient = new Redis({
    host: process.env.REDIS_HOST || '127.0.0.1',
    port: process.env.REDIS_PORT || 6379,
    password: process.env.REDIS_PASSWORD,
    db: process.env.REDIS_DB || 0,
    retryStrategy: (times) => {
        const delay = Math.min(times * 50, 2000);
        return delay;
    }
});

// 错误处理
redisClient.on('error', (err) => {
    console.error('Redis Client Error:', err);
});

redisClient.on('connect', () => {
    console.log('Redis Client Connected');
});

// 封装保存上传文件功能

exports.adminPath = ['/login', '/send-email-code','/users/search','/temp-users/list', '/captcha', '/resetPassword', '/sendMail', '/register', '/logout', /^\/public\/.*/, /^\/avatars\/.*/, /^\/static\/.*/, /^\/user_disk\/.*/, /^\/user_video\/.*/]

exports.userPath = ['/ban-list', '/login', '/splash', '/notice', '/devices-by-password', '/captcha', '/banner', '/logout-device-by-password', '/register', '/login_qq', '/sendMail', '/resetPassword', '/logout', '/logout', /^\/public\/.*/, /^\/avatars\/.*/, /^\/static\/.*/, /^\/user_disk\/.*/, /^\/user_video\/.*/]

exports.adminAbsolutePath = ['/api/admin/login','/api/app/users/search', '/api/admin/resetPassword', '/api/admin/sendMail', '/api/admin/register', '/api/admin/logout', /^\/public\/.*/, /^\/avatars\/.*/, /^\/static\/.*/, /^\/user_disk\/.*/, /^\/user_video\/.*/]

exports.userAbsolutePath = ['/api/user/login','/api/temp-users/list', '/api/user/devices-by-password', '/api/user/logout-device-by-password', '/api/user/banner', '/api/user/captcha', '/api/user/register', '/api/user/login_qq', '/api/user/sendMail', '/api/user/resetPassword', '/api/user/logout', '/api/user/logout', /^\/public\/.*/, /^\/avatars\/.*/, /^\/static\/.*/, /^\/user_disk\/.*/, /^\/user_video\/.*/]

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

/**
 * 格式化日志内容
 */
function logString(type, ...format) {
    switch (type) {
        case 'admin_login':
            return stringFormat(
                '管理员 %s 在 %s 登录系统\nIP: %s\n设备码: %s\n设备: %s',
                ...format
            );
        case 'admin_logout':
            return stringFormat(
                '管理员 %s 从 %s 登出系统\n设备码: %s\n时间: %s\n设备: %s',
                ...format
            );
        case 'admin_register':
            return stringFormat(
                'IP %s 使用设备码 %s 在 %s 注册管理员账号',
                ...format
            );
        case 'admin_update':
            return stringFormat(
                '管理员 %s 在 %s 更新了信息\nIP: %s\n设备: %s',
                ...format
            );
        default:
            return stringFormat(
                'IP %s 使用设备码 %s 在 %s 执行了未知操作',
                ...format
            );
    }
}

// 上述代码是直接获取的IPV4地址，如果获取到的是IPV6，则通过字符串的截取来转换为IPV4地址。
function ipv6ToV4(ip) {
    if (ip.split(',').length > 0) {
        ip = ip.split(',')[0]
    }
    ip = ip.substr(ip.lastIndexOf(':') + 1, ip.length);
    return ip
}

async function lookupAllGeoInfo(ip) {
    const url = `https://ipvx.netart.cn/?ip=${ip}`;

    try {
        const response = await axios.get(url);
        const data = response.data;

        if (!data) {
            throw new Error('No data found for the provided IP');
        }

        // 使用提供的 IP 数据模型结构
        const allInfo = {
            area_code: '未知',
            city: data.regions[1] || '未知',
            city_id: 0,
            continent: '未知',
            continent_code: '未知',
            country_id: 0,
            isp: data.as.name || '未知',
            latitude: 0,  // The new API does not provide latitude
            longitude: 0, // The new API does not provide longitude
            nation: data.country.name || '未知',
            nation_code: data.country.code || '未知',
            province: data.regions[0] || '未知',
            province_id: 0,
            subdivision_1_iso_code: '未知',
            subdivision_1_name: data.regions[2] || '未知',
            subdivision_2_iso_code: '未知',
            subdivision_2_name: '未知',
            time_zone: '未知',

            // 额外参数
            registeredCountryNameZh: data.registered_country.name || '未知',
            countryIsoCode: data.registered_country.code || '未知',
            provinceName: data.regions[0] || '未知',
            cityNameZh: data.regions[1] || '未知',
            autonomousSystemNumber: data.as.number || '未知',
            autonomousSystemOrganization: data.as.name || '未知'
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

exports.lookupAllGeoInfo = lookupAllGeoInfo;

/**
 * 创建管理员日志
 * @param {string} type 日志类型
 * @param {object} req 请求对象
 * @param {object} res 响应对象
 * @param {object} result 结果数据
 */
exports.createAdminLog = async function (type, req, res, result) {
    try {
        // 获取IP地理位置信息
        const geoInfo = await lookupAllGeoInfo(req.clientIp);
        const location = `${geoInfo.provinceName || '未知'} ${geoInfo.cityNameZh || ''}`;
        const isp = geoInfo.autonomousSystemOrganization || '未知';

        let logContent;
        switch (type) {
            case 'admin_login':
                logContent = logString(
                    type,
                    result.account,
                    dayjs().format('YYYY-MM-DD HH:mm:ss'),
                    `${req.clientIp} (${location} - ${isp})`,
                    req.body.markcode,
                    result.device || req.headers['user-agent']
                );
                break;
            case 'admin_logout':
                logContent = logString(
                    type,
                    result.account,
                    `${req.clientIp} (${location} - ${isp})`,
                    req.body.markcode,
                    dayjs().format('YYYY-MM-DD HH:mm:ss'),
                    result.device || req.headers['user-agent']
                );
                break;
            default:
                logContent = logString(
                    type,
                    `${req.clientIp} (${location} - ${isp})`,
                    req.body.markcode,
                    dayjs().format('YYYY-MM-DD HH:mm:ss')
                );
        }

        // 创建日志记录
        const logEntry = {
            log_type: type,
            log_content: logContent,
            log_ip: req.clientIp,
            log_time: dayjs().toDate(),
            log_user_id: result.account,
            log_location: location,
            log_isp: isp,
            log_device: result.device || req.headers['user-agent'],
            log_markcode: req.body.markcode
        };

        // 保存到数据库
        await AdminLog.create(logEntry);

        // 缓存最近的日志
        try {
            const cacheKey = `admin_recent_logs:${result.account}`;
            const recentLogs = await redisClient.get(cacheKey);
            const logs = recentLogs ? JSON.parse(recentLogs) : [];
            
            logs.unshift({
                ...logEntry,
                log_time: dayjs(logEntry.log_time).format('YYYY-MM-DD HH:mm:ss')
            });

            // 只保留最近50条日志
            if (logs.length > 50) {
                logs.pop();
            }

            await redisClient.set(cacheKey, JSON.stringify(logs), 'EX', 86400); // 缓存24小时
        } catch (cacheError) {
            console.error('Redis cache error:', cacheError);
        }

    } catch (error) {
        console.error('创建管理员日志失败:', error);
        res.status(500).json({
            code: 500,
            message: '创建管理员日志失败',
            error: process.env.NODE_ENV === 'development' ? error.message : '服务器内部错误'
        });
    }
};

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
module.exports.SANGBO_API_KEY = "mYuMro8V99nW0vpEgmpyUhyb1j";
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
module.exports.onlineUsers = onlineUsers;