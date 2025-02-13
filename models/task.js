const { DataTypes } = require("sequelize");
const { mysql } = require("../database");

const Task = mysql.define('Task', {
    id: {
        type: DataTypes.INTEGER,
        primaryKey: true,
        autoIncrement: true,
        comment: '任务ID'
    },
    name: {
        type: DataTypes.STRING,
        allowNull: false,
        comment: '任务名称'
    },
    schedule: {
        type: DataTypes.STRING,
        allowNull: false,
        comment: '任务调度时间表达式'
    },
    action: {
        type: DataTypes.STRING,
        allowNull: false,
        comment: '任务执行的动作'
    },
    status: {
        type: DataTypes.ENUM('active', 'inactive'),
        defaultValue: 'active',
        comment: '任务状态'
    },
    lastRun: {
        type: DataTypes.DATE,
        allowNull: true,
        comment: '上次运行时间'
    },
    conditions: {
        type: DataTypes.JSON,
        allowNull: true,
        comment: '任务执行条件'
    },
    executionDate: {
        type: DataTypes.DATE,
        allowNull: true,
        comment: '任务执行的具体日期'
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
        comment: '奖励时间单位（仅适用于会员奖励）'
    }
}, {
    tableName: 'tasks',
    timestamps: false
});

module.exports = { Task }; 