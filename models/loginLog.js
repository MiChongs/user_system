const { DataTypes } = require('sequelize');
const { mysql } = require('../database');
const { User } = require('./user');
const { App } = require('./app');
const dayjs = require('../function/dayjs');

const LoginLog = mysql.define('LoginLog', {
    id: {
        type: DataTypes.INTEGER,
        primaryKey: true,
        autoIncrement: true,
        comment: '登录日志ID'
    },
    appid: {
        type: DataTypes.INTEGER,
        allowNull: false,
        comment: '应用ID'
    },
    user_id: {
        type: DataTypes.INTEGER,
        allowNull: false,
        comment: '用户ID'
    },
    login_time: {
        type: DataTypes.DATE,
        allowNull: false,
        defaultValue: DataTypes.NOW,
        comment: '登录时间'
    },
    login_ip: {
        type: DataTypes.STRING(45),
        allowNull: false,
        comment: '登录IP'
    },
    login_country: {
        type: DataTypes.STRING(50),
        comment: '登录国家'
    },
    login_province: {
        type: DataTypes.STRING(50),
        comment: '登录省份'
    },
    login_city: {
        type: DataTypes.STRING(50),
        comment: '登录城市'
    },
    login_isp: {
        type: DataTypes.STRING(50),
        comment: '网络运营商'
    },
    device_type: {
        type: DataTypes.STRING(20),
        comment: '设备类型'
    },
    device_brand: {
        type: DataTypes.STRING(30),
        comment: '设备品牌'
    },
    device_model: {
        type: DataTypes.STRING(50),
        comment: '设备型号'
    },
    os_type: {
        type: DataTypes.STRING(20),
        comment: '操作系统类型'
    },
    os_version: {
        type: DataTypes.STRING(20),
        comment: '操作系统版本'
    },
    browser_type: {
        type: DataTypes.STRING(30),
        comment: '浏览器类型'
    },
    browser_version: {
        type: DataTypes.STRING(20),
        comment: '浏览器版本'
    },
    user_agent: {
        type: DataTypes.STRING(512),
        comment: 'User Agent'
    },
    login_status: {
        type: DataTypes.ENUM('success', 'failed'),
        allowNull: false,
        defaultValue: 'success',
        comment: '登录状态'
    },
    fail_reason: {
        type: DataTypes.STRING(100),
        comment: '失败原因'
    },
    session_id: {
        type: DataTypes.TEXT,
        comment: '会话ID'
    },
    login_duration: {
        type: DataTypes.INTEGER,
        comment: '登录时长(秒)'
    }
}, {
    tableName: 'login_logs',
    timestamps: true,
    indexes: [
        {
            name: 'idx_user_app',
            fields: ['user_id', 'appid']
        },
        {
            name: 'idx_login_time',
            fields: ['login_time']
        },
        {
            name: 'idx_login_ip',
            fields: ['login_ip'],
            length: { login_ip: 20 }
        },
        {
            name: 'idx_device',
            fields: ['device_type', 'device_brand'],
            length: {
                device_type: 10,
                device_brand: 20
            }
        },
        {
            name: 'idx_status_time',
            fields: ['login_status', 'login_time']
        }
    ],
    scopes: {
        recent: {
            order: [['login_time', 'DESC']]
        },
        success: {
            where: {
                login_status: 'success'
            }
        },
        failed: {
            where: {
                login_status: 'failed'
            }
        }
    }
});


// 实例方法
LoginLog.prototype.getDuration = function() {
    if (!this.login_duration) return null;
    return dayjs.duration(this.login_duration, 'seconds').humanize();
};

LoginLog.prototype.getLocation = function() {
    const parts = [this.login_country, this.login_province, this.login_city]
        .filter(Boolean);
    return parts.join(' ');
};

LoginLog.prototype.getDevice = function() {
    return {
        type: this.device_type,
        brand: this.device_brand,
        model: this.device_model,
        os: `${this.os_type} ${this.os_version}`,
        browser: `${this.browser_type} ${this.browser_version}`
    };
};

// 类方法
LoginLog.findByDateRange = async function(startDate, endDate, options = {}) {
    return this.findAll({
        where: {
            login_time: {
                [Op.between]: [startDate, endDate]
            },
            ...options.where
        },
        ...options
    });
};

LoginLog.getLoginStats = async function(userId, appid) {
    const stats = await this.findAll({
        where: { user_id: userId, appid },
        attributes: [
            [sequelize.fn('COUNT', sequelize.col('id')), 'total_logins'],
            [sequelize.fn('COUNT', sequelize.literal("CASE WHEN login_status = 'failed' THEN 1 END")), 'failed_logins'],
            [sequelize.fn('MAX', sequelize.col('login_time')), 'last_login'],
            [sequelize.fn('AVG', sequelize.col('login_duration')), 'avg_duration']
        ]
    });

    return stats[0];
};

LoginLog.getDeviceStats = async function(appid, days = 30) {
    const startDate = dayjs().subtract(days, 'days').toDate();
    
    return this.findAll({
        where: {
            appid,
            login_time: { [Op.gte]: startDate }
        },
        attributes: [
            'device_type',
            'os_type',
            [sequelize.fn('COUNT', sequelize.col('id')), 'count'],
            [sequelize.fn('COUNT', sequelize.fn('DISTINCT', sequelize.col('user_id'))), 'unique_users']
        ],
        group: ['device_type', 'os_type']
    });
};

module.exports = { LoginLog };