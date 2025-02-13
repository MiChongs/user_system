const nodemailer = require('nodemailer');
const ejs = require('ejs');
const path = require('path');
const useragent = require('useragent');

// 创建邮件发送器
const transporter = nodemailer.createTransport({
    host: process.env.MAIL_HOST,
    port: process.env.MAIL_PORT,
    secure: process.env.MAIL_SECURE === 'true',
    auth: {
        user: process.env.MAIL_USER,
        pass: process.env.MAIL_PASS
    }
});

/**
 * 发送密码更改通知邮件
 * @param {Object} options 邮件选项
 * @param {string} options.to 收件人邮箱
 * @param {string} options.username 用户名
 * @param {string} options.appName 应用名称
 * @param {string} options.appLogo 应用logo URL
 * @param {string} options.resetPasswordLink 重置密码链接
 * @param {string} options.supportEmail 支持邮箱
 * @param {string} options.userAgent 用户代理字符串
 * @param {string} options.ipAddress IP地址
 */
async function sendPasswordChangeNotification(options) {
    try {
        // 解析用户代理
        const agent = useragent.parse(options.userAgent);
        const deviceInfo = `${agent.os.toString()} - ${agent.toAgent()}`;

        // 渲染邮件模板
        const template = path.join(__dirname, '../template/password-changed.ejs');
        const html = await ejs.renderFile(template, {
            username: options.username,
            updateTime: new Date().toLocaleString('zh-CN', { timeZone: 'Asia/Shanghai' }),
            deviceInfo: deviceInfo,
            ipAddress: options.ipAddress,
            resetPasswordLink: options.resetPasswordLink,
            appName: options.appName,
            appLogo: options.appLogo,
            supportEmail: options.supportEmail
        });

        // 发送邮件
        await transporter.sendMail({
            from: `"${options.appName}" <${process.env.MAIL_FROM}>`,
            to: options.to,
            subject: '密码更新通知',
            html: html
        });

        return true;
    } catch (error) {
        console.error('发送密码更改通知邮件失败:', error);
        return false;
    }
}

module.exports = {
    sendPasswordChangeNotification
};
