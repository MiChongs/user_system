const { DataTypes } = require("sequelize");
const { mysql } = require("../../database");
const { Goods } = require("../goods");
const { User } = require("../user");
const { App } = require("../app");

/**
 * # 订单表
 */

const Order = mysql.define('Order', {
    id: {
        type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true, comment: '订单id'
    }, orderNo: {
        type: DataTypes.STRING, allowNull: false, comment: '订单号'
    }, userId: {
        type: DataTypes.INTEGER, allowNull: false, references: {
            model: User, key: 'id'
        }, comment: '用户id'
    }, goodsId: {
        type: DataTypes.INTEGER, allowNull: false, references: {
            model: Goods, key: 'id'
        }, comment: '商品id'
    }, num: {
        type: DataTypes.INTEGER, allowNull: false, defaultValue: 1, comment: '购买数量'
    }, price: {
        type: DataTypes.FLOAT, allowNull: false, defaultValue: 0, comment: '订单价格'
    }, status: {
        type: DataTypes.ENUM, allowNull: false, values: ['pending', 'success', 'fail'], defaultValue: 'pending',
        comment: '订单状态'
    }, payType: {
        type: DataTypes.ENUM, allowNull: false, values: ['money', 'integral'], defaultValue: 'money', comment: '支付类型'
    }, payTime: {
        type: DataTypes.DATE, defaultValue: DataTypes.NOW, allowNull: true, comment: '支付时间'
    }, appid: {
        type: DataTypes.INTEGER, allowNull: false, references: {
            model: App, key: 'id'
        }, comment: '隶属于应用id'
    }
}, {
    tableName: 'orders',
    timestamps: false,
})

module.exports = {
    Order
}