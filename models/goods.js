const { mysql } = require("../database");
const { DataTypes } = require("sequelize");
const { App } = require("./app");


const Goods = mysql.define('Good', {
    id: {
        type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true
    }, name: {
        type: DataTypes.STRING, allowNull: false
    }, num: {
        type: DataTypes.INTEGER, allowNull: false, defaultValue: 10000, comment: '库存'
    }, award_type: {
        type: DataTypes.ENUM, allowNull: false, values: ['integral', 'thing', 'vip'], defaultValue: 'integral', comment: '奖品类型'
    }, award_num: {
        type: DataTypes.INTEGER, allowNull: false, defaultValue: 1, comment: '数量 积分为积分数量 物品为物品个数 会员为会员天数'
    }, exchange_num: {
        type: DataTypes.INTEGER, allowNull: false, defaultValue: 0, comment: '已兑换数量'
    }, integral: {
        type: DataTypes.INTEGER, allowNull: true, defaultValue: 0, comment: '积分'
    }, price: {
        type: DataTypes.FLOAT, allowNull: true, defaultValue: 0, comment: '价格'
    }, description: {
        type: DataTypes.TEXT, allowNull: true
    }, payType: {
        type: DataTypes.ENUM, allowNull: false, values: ['money', 'integral'], defaultValue: 'integral'
    }, imageUrl: {
        type: DataTypes.STRING,
    }, bindAppid: {
        type: DataTypes.INTEGER, allowNull: false, references: {
            model: App, key: 'id'
        }, onUpdate: 'CASCADE', onDelete: 'CASCADE'
    }
})


module.exports = {
    Goods
}