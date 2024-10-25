const {mysql} = require("../database");
const {DataTypes} = require("sequelize");
const {App} = require("./app");
const dayjs = require("../function/dayjs")

const Card = mysql.define('Card', {
    id: {
        type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true, comment: '卡密ID'
    }, card_code: {
        type: DataTypes.STRING, allowNull: false, comment: '卡密内容'
    }, card_type: {
        type: DataTypes.ENUM, allowNull: false, comment: '卡密类型', values: ['integral', 'vip']
    }, card_status: {
        type: DataTypes.ENUM,
        allowNull: false,
        comment: '卡密状态',
        defaultValue: 'normal',
        values: ['normal', 'used', 'expired']
    }, card_award_num: {
        type: DataTypes.INTEGER, allowNull: false, comment: '卡密奖励数量'
    }, card_memo: {
        type: DataTypes.STRING, allowNull: false, comment: '卡密备注'
    }, card_code_expire: {
        type: DataTypes.DATE, comment: '卡密过期时间', allowNull: false, get() {
        return dayjs(this.getDataValue('card_code_expire')).format('YYYY-MM-DD HH:mm:ss');
    }
    }, card_time: {
        type: DataTypes.DATE, defaultValue: DataTypes.NOW, comment: '创建时间', get() {
            return dayjs(this.getDataValue('card_time')).format('YYYY-MM-DD HH:mm:ss');
        }
    }, used_time: {
        type: DataTypes.DATE, comment: '使用时间', get() {
            return dayjs(this.getDataValue('used_time')).format('YYYY-MM-DD HH:mm:ss');
        }
    }, appid: {
        type: DataTypes.INTEGER, allowNull: false, comment: 'App ID', references: {
            model: App, key: 'id'
        }
    }, account: {
        type: DataTypes.INTEGER, comment: '用户账号 (使用者账号)', references: {
            model: 'User', key: 'id'
        }
    }
})


module.exports = {Card}