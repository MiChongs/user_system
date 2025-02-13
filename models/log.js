const {DataTypes} = require("sequelize");
const moment = require("moment/moment");
const {User} = require("./user");
const {mysql} = require("../database");

const Log = mysql.define('Log', {
    id: {
        type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true, comment: '日志ID'
    }, log_type: {
        type: DataTypes.ENUM,
        allowNull: false,
        comment: '日志类型',
        values: [
            // 登录相关
            'login',
            'logout',
            'login_failed',
            
            // 注册相关
            'register',
            'admin_register',
            
            // 账号绑定相关
            'bind_email',
            'unbind_email',
            'bind_qq',
            'unbind_qq', 
            'bind_wechat',
            'unbind_wechat',
            'enable_2fa',
            'disable_2fa',
            'update_2fa',
            
            // 账号安全相关
            'password_change',
            'email_verify',
            'phone_verify',
            'security_question_set',
            'security_question_verify',
            
            // 积分/会员相关
            'vip_time_add',
            'integral_add',
            'card_use',
            'pay_vip',
            
            // 管理操作
            'admin_login',
            'updateAppConfig',
            'createApp',
            'logoutDevice',
            'updateUser',
            'daily',
            
            // 其他操作
            'card_generate',
            'custom_id_change'
        ]
    }, log_content: {
        type: DataTypes.STRING, allowNull: false, comment: '日志内容'
    }, log_time: {
        type: DataTypes.DATE, defaultValue: DataTypes.NOW, comment: '创建时间', get() {
            return moment(this.getDataValue('log_time')).format('YYYY-MM-DD HH:mm:ss');
        }
    }, log_ip: {
        type: DataTypes.STRING, allowNull: false, comment: '日志IP'
    }, log_user_id: {
        type: DataTypes.STRING, allowNull: true, comment: '用户ID'
    }, appid: {
        type: DataTypes.STRING, allowNull: false, comment: '应用ID'
    }, open_qq: {
        type: DataTypes.STRING, comment: 'QQ 互联ID', allowNull: true
    }, open_wechat: {
        type: DataTypes.STRING, comment: '微信 互联ID', allowNull: true
    }, bindAppid: {
        type: DataTypes.STRING, comment: '绑定应用ID', allowNull: true
    }, UserId: {
        type: DataTypes.INTEGER, references: {
            model: User, key: 'id',
        }, allowNull: true, onUpdate: 'CASCADE', onDelete: 'CASCADE'
    },
    log_device: {
        type: DataTypes.STRING,
        allowNull: true,
        comment: '操作设备'
    },
    log_location: {
        type: DataTypes.STRING,
        allowNull: true,
        comment: '操作地理位置'
    },
    log_isp: {
        type: DataTypes.STRING,
        allowNull: true,
        comment: '网络运营商'
    },
    log_status: {
        type: DataTypes.ENUM('success', 'failed', 'warning'),
        allowNull: false,
        defaultValue: 'success',
        comment: '操作状态'
    },
    log_details: {
        type: DataTypes.JSON,
        allowNull: true,
        comment: '详细信息',
        get() {
            const rawValue = this.getDataValue('log_details');
            return rawValue ? JSON.parse(rawValue) : null;
        },
        set(value) {
            this.setDataValue('log_details', JSON.stringify(value));
        }
    },
    related_log_id: {
        type: DataTypes.INTEGER,
        allowNull: true,
        comment: '关联日志ID'
    }
}, {
    tableName: 'log', timestamps: false,
    indexes: [
        {
            name: 'idx_log_time',
            fields: ['log_time']
        },
        {
            name: 'idx_log_type',
            fields: ['log_type']
        },
        {
            name: 'idx_user_id',
            fields: ['UserId']
        },
        {
            name: 'idx_app_id',
            fields: ['appid']
        },
        {
            name: 'idx_log_status',
            fields: ['log_status']
        }
    ]
})


module.exports = {Log}