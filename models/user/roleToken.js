const {mysql} = require("../../database");
const {DataTypes} = require("sequelize");
const {User} = require("../user");
const {App} = require("../app");


const RoleToken = mysql.define('roleToken', {
    id: {
        type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true, comment: '角色令牌ID'
    }, userId: {
        type: DataTypes.INTEGER, allowNull: false, comment: '用户ID',references: {
            model: User, key: 'id', onDelete: 'CASCADE', onUpdate: 'CASCADE'
        }
    }, role: {
        type: DataTypes.STRING, allowNull: false, comment: '角色ID',
    }, token: {
        type: DataTypes.TEXT, allowNull: false, comment: '角色令牌'
    }, expiredAt: {
        type: DataTypes.DATE, allowNull: false, comment: '过期时间'
    }, createdAt: {
        type: DataTypes.DATE, allowNull: true, defaultValue: DataTypes.NOW, comment: '创建时间'
    },appid: {
        type: DataTypes.INTEGER, allowNull: false, comment: '应用ID',references: {
            model: App, key: 'id', onDelete: 'CASCADE', onUpdate: 'CASCADE'
        }
    }
}, {
    tableName: 'role_token', timestamps: false, comment: '角色令牌表'
});

module.exports = {
    RoleToken
}