const {Sequelize, DataTypes} = require("sequelize");
const crypto = require("crypto");
const mysql = new Sequelize("testdatabase", "test", "123456", {
    host: "localhost",
    dialect: "mysql",
    timezone: '+08:00',
})
const jwt = require("jsonwebtoken");
const bodyParser = require('body-parser')
const IP2Region = require('ip2region').default;
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
    }
}, {
    // 这是其他模型参数
    freezeTableName: true,
    timestamps: false,
});

function getClientIp(req) {
    return req.headers['x-forwarded-for'] ||
        req.ip ||
        req.connection.remoteAddress ||
        req.socket.remoteAddress ||
        req.connection.socket.remoteAddress ||
        '';
}

// 上述代码是直接获取的IPV4地址，如果获取到的是IPV6，则通过字符串的截取来转换为IPV4地址。
function ipv6ToV4(ip) {
    if (ip.split(',').length > 0) {
        ip = ip.split(',')[0]
    }
    ip = ip.substr(ip.lastIndexOf(':') + 1, ip.length);
    return ip
}

module.exports.User = User;
module.exports.mysql = mysql;
module.exports.sequelize = Sequelize;
module.exports.crypto = crypto;
module.exports.bodyParser = bodyParser;
module.exports.jwt = jwt;
module.exports.ipRegion = IP2Region;
module.exports.getClientIp = getClientIp;