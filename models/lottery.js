const { DataTypes } = require('sequelize');
const { mysql } = require('../database');
const { App } = require('./app');

const Lottery = mysql.define('Lottery', {
    id: {
        type: DataTypes.INTEGER,
        primaryKey: true,
        autoIncrement: true,
        comment: '主键ID'
    },
    lotteryId: {
        type: DataTypes.STRING(32),
        allowNull: false,
        unique: true,
        comment: '抽奖ID(系统生成)'
    },
    appid: {
        type: DataTypes.INTEGER,
        allowNull: false,
        references: {
            model: App,
            key: 'id'
        },
        comment: '应用ID'
    },
    name: {
        type: DataTypes.STRING,
        allowNull: false,
        comment: '抽奖活动名称'
    },
    count: {
        type: DataTypes.INTEGER,
        allowNull: false,
        comment: '中奖人数'
    },
    rewardType: {
        type: DataTypes.ENUM('integral', 'membership'),
        allowNull: false,
        comment: '奖励类型'
    },
    rewardAmount: {
        type: DataTypes.INTEGER,
        allowNull: false,
        comment: '奖励数量'
    },
    rewardUnit: {
        type: DataTypes.ENUM('minutes', 'hours', 'days', 'months', 'years', 'permanent'),
        allowNull: true,
        comment: '奖励单位(会员类型必填)'
    },
    drawTime: {
        type: DataTypes.DATE,
        allowNull: false,
        comment: '开奖时间'
    },
    conditions: {
        type: DataTypes.JSON,
        allowNull: true,
        comment: `参与条件：{
            registerTime: { start, end },     // 注册时间范围
            integral: { min, max },           // 积分范围
            membershipStatus: string[],       // 会员状态
            includeUsers: number[],           // 指定包含的用户
            checkinDays: {                    // 签到要求
                count: number,                // 签到天数
                startDate: string,            // 统计开始日期
                endDate: string               // 统计结束日期
            }
        }`
    },
    excludeConditions: {
        type: DataTypes.JSON,
        allowNull: true,
        comment: '排除条件'
    },
    status: {
        type: DataTypes.ENUM('pending', 'completed', 'cancelled'),
        defaultValue: 'pending',
        comment: '抽奖状态'
    },
    winners: {
        type: DataTypes.JSON,
        allowNull: true,
        comment: '中奖用户列表'
    },
    cancelReason: {
        type: DataTypes.STRING,
        allowNull: true,
        comment: '取消原因'
    },
    cancelTime: {
        type: DataTypes.DATE,
        allowNull: true,
        comment: '取消时间'
    }
}, {
    tableName: 'lotteries',
    timestamps: true
});

module.exports = { Lottery }; 