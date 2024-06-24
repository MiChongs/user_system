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
const Boom = require('@hapi/boom');
const stringRandom = require('string-random');
const stringFormat = require('string-kit').format;
const {log} = require("console");
const nowDate = moment().format('YYYY-MM-DD')
const dayjs = require('dayjs');
const emptinessCheck = require('emptiness-check');
// 封装保存上传文件功能
const upload = () => {
    const storage = multer.diskStorage({
        destination: async (req, file, cb) => { // 指定上传后保存到哪一个文件夹中
            await mkdirp(`./public/avatars/`)  // 创建目录
            cb(null, `public/avatars`) //
        },
        filename: (req, file, cb) => { // 给保存的文件命名
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

const Log = mysql.define('Log', {
    id: {
        type: DataTypes.INTEGER,
        primaryKey: true,
        autoIncrement: true,
        comment: '日志ID'
    },
    log_type: {
        type: DataTypes.ENUM,
        allowNull: false,
        comment: '日志类型',
        values: ['login', 'register', 'card_use', 'pay_vip', 'card_generate', 'admin_login', 'logout', 'updateAppConfig', 'createApp', 'logoutDevice', 'updateUser', 'daily']
    },
    log_content: {
        type: DataTypes.STRING,
        allowNull: false,
        comment: '日志内容'
    },
    log_time: {
        type: DataTypes.DATE,
        defaultValue: DataTypes.NOW,
        comment: '创建时间'
    },
    log_ip: {
        type: DataTypes.STRING,
        allowNull: false,
        comment: '日志IP'
    },
    log_user_id: {
        type: DataTypes.STRING,
        allowNull: false,
        comment: '用户ID'
    },
    appid: {
        type: DataTypes.STRING,
        allowNull: false,
        comment: '应用ID'
    },
}, {
    tableName: 'log',
    timestamps: false
})

const Card = mysql.define('Card', {
    id: {
        type: DataTypes.INTEGER,
        primaryKey: true,
        autoIncrement: true,
        comment: '卡密ID'
    },
    card_code: {
        type: DataTypes.STRING,
        allowNull: false,
        comment: '卡密内容'
    },
    card_type: {
        type: DataTypes.ENUM,
        allowNull: false,
        comment: '卡密类型',
        values: ['integral', 'vip']
    },
    card_status: {
        type: DataTypes.ENUM,
        allowNull: false,
        comment: '卡密状态',
        defaultValue: 'normal',
        values: ['normal', 'used', 'expired']
    },
    card_award_num: {
        type: DataTypes.INTEGER,
        allowNull: false,
        comment: '卡密奖励数量'
    },
    card_code_expire: {
        type: DataTypes.DATE,
        comment: '卡密过期时间',
        allowNull: false,
    },
    card_time: {
        type: DataTypes.DATE,
        defaultValue: DataTypes.NOW,
        comment: '创建时间'
    },
    used_time: {
        type: DataTypes.DATE,
        comment: '使用时间'
    },
    appid: {
        type: DataTypes.INTEGER,
        allowNull: false,
        comment: 'App ID'
    },
    account: {
        type: DataTypes.STRING,
        comment: '用户账号 (使用者账号)'
    }
})

const Notification = mysql.define('Notification', {
    id: {
        type: DataTypes.INTEGER,
        primaryKey: true,
        autoIncrement: true,
        comment: '通知ID'
    },
    title: {
        type: DataTypes.STRING,
        allowNull: false,
        comment: '通知标题',
    },
    summary: {
        type: DataTypes.STRING,
        allowNull: false,
        comment: '通知内容'
    },
    appid: {
        type: DataTypes.INTEGER,
        allowNull: false,
        comment: 'App ID'
    },
    time: {
        type: DataTypes.DATE,
        defaultValue: DataTypes.NOW
    }
})

const Token = mysql.define('Token', {
    id: {
        type: DataTypes.INTEGER,
        primaryKey: true,
        autoIncrement: true,
        comment: 'Token ID'
    },
    token: {
        type: DataTypes.STRING,
        allowNull: false,
        comment: 'Token'
    },
    markcode: {
        type: DataTypes.STRING,
        allowNull: false,
        comment: 'Markcode (设备ID)'
    },
    appid: {
        type: DataTypes.INTEGER,
        allowNull: false,
        comment: 'App ID'
    }, account: {
        type: DataTypes.STRING,
        comment: '用户账号',
        allowNull: false
    },
})

const App = mysql.define('App', {
    id: {
        type: DataTypes.INTEGER,
        primaryKey: true,
        autoIncrement: false,
        comment: '应用ID'
    },
    name: {
        type: DataTypes.STRING,
        allowNull: false,
        comment: '应用名称'
    },
    key: {
        type: DataTypes.STRING,
        allowNull: false,
        comment: '应用密钥'
    },
    status: {
        type: DataTypes.BOOLEAN,
        allowNull: false,
        defaultValue: true,
        comment: '应用状态'
    },
    disabledReason: {
        type: DataTypes.STRING,
        allowNull: true,
        defaultValue: '',
        comment: '应用禁用原因'
    },
    registerStatus: {
        type: DataTypes.BOOLEAN,
        allowNull: false,
        defaultValue: true,
        comment: '注册启用状态'
    },
    disabledRegisterReason: {
        type: DataTypes.STRING,
        allowNull: true,
        defaultValue: true,
        comment: '注册禁用原因'
    },
    loginStatus: {
        type: DataTypes.BOOLEAN,
        allowNull: false,
        defaultValue: true,
        comment: '登录启用状态'
    },
    disableLoginReason: {
        type: DataTypes.STRING,
        allowNull: true,
        defaultValue: '',
        comment: '登录禁用原因'
    },
    loginCheckDevice: {
        type: DataTypes.BOOLEAN,
        allowNull: true,
        defaultValue: true,
        comment: '登录校验设备信息'
    },
    loginCheckUser: {
        type: DataTypes.BOOLEAN,
        allowNull: false,
        defaultValue: false,
        comment: '登录校验用户属地与上次是否相符'
    },
    loginCheckDeviceTimeOut: {
        type: DataTypes.INTEGER,
        allowNull: false,
        defaultValue: 0,
        comment: '登录换绑机器码间隔'
    },
    loginCheckIp: {
        type: DataTypes.BOOLEAN,
        allowNull: false,
        defaultValue: true,
        comment: '登录校验IP'
    },
    registerChceckIp: {
        type: DataTypes.BOOLEAN,
        allowNull: false,
        defaultValue: true,
        comment: '注册校验IP'
    },
    multiDeviceLogin: {
        type: DataTypes.BOOLEAN,
        allowNull: false,
        defaultValue: false,
        comment: '多设备登录启用状态'
    },
    multiDeviceLoginNum: {
        type: DataTypes.INTEGER,
        allowNull: false,
        defaultValue: 1,
        comment: '多设备数量'
    },
    register_award: {
        type: DataTypes.ENUM,
        allowNull: false,
        values: ['vip', 'integral'],
        defaultValue: 'integral',
        comment: '注册奖励'
    },
    register_award_num: {
        type: DataTypes.INTEGER,
        allowNull: false,
        defaultValue: 0,
        comment: "注册奖励数"
    },
    invite_award: {
        type: DataTypes.ENUM,
        allowNull: false,
        values: ['vip', 'integral'],
        defaultValue: 'integral',
        comment: '邀请奖励'
    },
    invite_award_num: {
        type: DataTypes.INTEGER,
        allowNull: false,
        defaultValue: 0,
        comment: '邀请奖励数'
    },
    daily_award: {
        type: DataTypes.ENUM,
        allowNull: false,
        values: ['vip', 'integral'],
        defaultValue: 'integral',
        comment: '签到奖励'
    },
    daily_award_num: {
        type: DataTypes.INTEGER,
        allowNull: false,
        defaultValue: 0,
        comment: '签到奖励数'
    }
})

const User = mysql.define('User', {
    // 定义模型属性
    id: {
        type: DataTypes.INTEGER
        , primaryKey: true,
        allowNull: false,
        autoIncrement: true,
        comment: '用户ID'
    },
    account: {
        type: DataTypes.STRING,
        comment: '用户账号',
        allowNull: false
    }, password: {
        type: DataTypes.STRING,
        allowNull: false,
        comment: '用户密码',
    },
    name: {
        type: DataTypes.STRING,
        comment: '用户昵称'
    },
    avatar: {
        type: DataTypes.STRING,
        comment: '用户头像'
    },
    register_ip: {
        type: DataTypes.STRING,
        comment: '用户注册IP'
    },
    register_time: {
        type: DataTypes.DATE,
        defaultValue: DataTypes.NOW,
        comment: '用户注册时间'
    },
    register_province: {
        type: DataTypes.STRING,
        comment: '用户注册省份'
    },
    register_city: {
        type: DataTypes.STRING,
        comment: '用户注册城市'
    },
    register_isp: {
        type: DataTypes.STRING,
        comment: '用户注册运营商'
    },
    vip_time: {
        type: DataTypes.DATE,
        defaultValue: DataTypes.NOW,
        comment: '用户会员到期时间'
    },
    integral: {
        type: DataTypes.INTEGER,
        comment: '用户积分',
        defaultValue: 0
    },
    enabled: {
        type: DataTypes.BOOLEAN,
        defaultValue: true,
        comment: '用户账号状态'
    },
    disabledEndTime: {
        type: DataTypes.DATE,
        comment: '用户禁用到期时间'
    },
    reason: {
        type: DataTypes.STRING,
        comment: '禁用原因',
        defaultValue: '无'
    },
    role: {
        type: DataTypes.ENUM,
        defaultValue: 'user',
        values: ['admin', 'user', 'tester'],
        comment: '用户权限组'
    },
    markcode: {
        type: DataTypes.STRING,
        allowNull: false,
        comment: 'Markcode (设备ID)'
    },
    parent_invite_account: {
        type: DataTypes.STRING,
        comment: '邀请人'
    },
    invite_code: {
        type: DataTypes.STRING,
        comment: '邀请码',
    },
    appid: {
        type: DataTypes.INTEGER,
        allowNull: false,
        comment: '隶属于应用 (id)'
    }
}, {
    // 这是其他模型参数
    freezeTableName: true,
    timestamps: true,
});

// 上述代码是直接获取的IPV4地址，如果获取到的是IPV6，则通过字符串的截取来转换为IPV4地址。
function ipv6ToV4(ip) {
    if (ip.split(',').length > 0) {
        ip = ip.split(',')[0]
    }
    ip = ip.substr(ip.lastIndexOf(':') + 1, ip.length);
    return ip
}

async function lookupAllGeoInfo(ip, options) {
    const Reader = require('@maxmind/geoip2-node').Reader;
    try {
        const [countryReader, cityReader, asnReader] = await Promise.all([
            Reader.open('./geo2mmdb/country.mmdb', options),
            Reader.open('./geo2mmdb/city.mmdb', options),
            Reader.open('./geo2mmdb/asn.mmdb', options)
        ]);

        const allInfo = {};

        if (countryReader) {
            const countryResponse = countryReader.country(ip);
            try {
                allInfo.country = {
                    registeredCountryNameZh: countryResponse.registeredCountry.names['zh-CN']
                };
            } catch (error) {

                allInfo.country = {
                    registeredCountryNameZh: '未知'
                };
            }
        }

        if (cityReader) {
            const cityResponse = cityReader.city(ip);
            try {
                allInfo.city = {
                    countryIsoCode: cityResponse.country.isoCode,
                    provinceName: cityResponse.subdivisions[0].names['zh-CN'],
                    cityNameZh: cityResponse.city.names['zh-CN']
                };
            } catch (error) {
                allInfo.city = {
                    countryIsoCode: cityResponse.country.isoCode,
                    provinceName: '未知',
                    cityNameZh: '未知'
                };
            }
        }

        if (asnReader) {
            const asnResponse = asnReader.asn(ip);
            try {
                allInfo.asn = {
                    autonomousSystemNumber: asnResponse.autonomousSystemNumber,
                    autonomousSystemOrganization: asnResponse.autonomousSystemOrganization
                };
            } catch (error) {
                allInfo.asn = {
                    autonomousSystemNumber: 0,
                    autonomousSystemOrganization: 'LOCAL ASN'
                };
            }
        }

        return allInfo;
    } catch (error) {
        console.error('Error looking up all geo information:', error);
        throw error; // 重新抛出错误，以便调用者可以处理
    }
}

function logString(type, ...format) {
    let content;
    if (type === 'login') {
        content = stringFormat('%s 使用设备码 %s 在 %s 进行登录', format[0], format[1], format[2])
    } else if (type === 'register') {
        content = stringFormat('IP 为 %s 使用设备码 %s 在 %s 进行注册', format[0], format[1], format[2])
    } else if (type === 'logout') {
        content = '{0} 使用设备码 {1} 在 {2} 进行登出'.stringFormat(format);
    } else if (type === 'daily') {
        content = stringFormat('IP 为 %s 使用设备码 %s 在 %s 进行签到', format[0], format[1], format[2])
    } else if (type === 'logutDevice') {
        content = '{0} 使用设备码 {1} 在 {2} 进行删除'.stringFormat(format);
    } else if (type === 'card_use') {
        content = '{0} 在 {1} 使用了 {2} 卡密'.stringFormat(format);
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
        content = '{0} 在 {1} 登录了后台, IP 地址为 {2}'.stringFormat(format);
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

module.exports.User = User;
module.exports.App = App;
module.exports.Card = Card;
module.exports.Notification = Notification;
module.exports.Token = Token;
module.exports.mysql = mysql;
module.exports.sequelize = Sequelize;
module.exports.crypto = crypto;
module.exports.bodyParser = bodyParser;
module.exports.jwt = jwt;
module.exports.ipRegion = IP2Region;
module.exports.lookupAllGeoInfo = lookupAllGeoInfo;
module.exports.upload = upload;
module.exports.fs = fs;
module.exports.moment = moment;
module.exports.stringRandom = stringRandom;
module.exports.Log = Log;
module.exports.logString = logString;
module.exports.Boom = Boom;
module.exports.dayjs = dayjs;
module.exports.emptinessCheck = emptinessCheck;
