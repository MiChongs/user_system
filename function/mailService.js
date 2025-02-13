const nodemailer = require('nodemailer');
const ejs = require('ejs');
const path = require('path');
const fs = require('fs');
const dayjs = require('dayjs');

/**
 * 发送邮件通知
 * @param {Object} app 应用配置
 * @param {Object} options 邮件选项
 * @returns {Promise<boolean>} 是否发送成功
 */
async function sendEmail(app, options) {
    const {to, subject, content} = options;

    if (
        !app.smtpHost ||
        !app.smtpPort ||
        !app.smtpUser ||
        !app.smtpPassword
    ) {
        console.warn('邮件服务未配置，跳过发送通知');
        return false;
    }

    try {
        const transporter = createTransporter(app);

        // 读取并渲染基础模板
        const baseTemplate = fs.readFileSync(
            path.join(__dirname, '../template/emails/base.ejs'),
            'utf-8'
        );

        const html = ejs.render(baseTemplate, {
            senderName: app.name,
            title: subject,
            content: content
        });

        await transporter.sendMail({
            from: `${process.env.SMTP_FROM_NAME || '系统管理员'} <${process.env.SMTP_USER}>`,
            to: to,
            subject: `${app.name} - ${subject}`,
            html: html
        });

        console.log(`邮件发送成功: ${subject}`);
        return true;
    } catch (error) {
        console.error(`发送邮件失败 (${subject}):`, error);
        return false;
    }
}

// 创建邮件发送器
const createTransporter = (app) => {
    return nodemailer.createTransport({
        host: app.smtpHost,
        port: app.smtpPort,
        secure: app.smtpSecure,
        auth: {
            user: app.smtpUser,
            pass: app.smtpPassword
        }
    });
};

/**
 * 生成变更内容HTML
 * @param {Object} changes 变更内容
 * @returns {string} HTML内容
 */
function generateChangesHtml(changes) {
    let html = '<div class="changes">';

    for (const [field, values] of Object.entries(changes)) {
        let formattedOld = values.old;
        let formattedNew = values.new;

        // 特殊字段格式化
        switch (field) {
            case 'vip_time':
                formattedOld = dayjs.unix(values.old).format('YYYY-MM-DD HH:mm:ss');
                formattedNew = dayjs.unix(values.new).format('YYYY-MM-DD HH:mm:ss');
                break;
            case 'integral':
            case 'exp':
                formattedOld = Number(values.old).toLocaleString();
                formattedNew = Number(values.new).toLocaleString();
                break;
        }

        html += `
            <div class="change-item">
                <span>${field}：</span>
                <span class="old-value">${formattedOld}</span> →
                <span class="new-value">${formattedNew}</span>
            </div>
        `;
    }

    html += '</div>';
    return html;
}

/**
 * 发送密码更新通知
 * @param {Object} app 应用配置
 * @param {string} email 用户邮箱
 * @param {Object} credentials 用户凭证
 * @param {string} credentials.account 用户账号
 * @param {string} credentials.password 新密码（明文）
 */
async function sendPasswordUpdateNotification(app, email, credentials) {
    return sendEmail(app, {
        to: email,
        subject: '账号密码已更新',
        content: `
            <p>您的账户信息已由管理员更新。</p>
            <div class="changes">
                <div class="change-item">
                    <span>账号：</span>
                    <span class="highlight">${credentials.account}</span>
                </div>
                <div class="change-item">
                    <span>新密码：</span>
                    <span class="highlight">${credentials.password}</span>
                </div>
            </div>
            <p>请使用新的账号密码登录系统，并及时修改为您自己的密码。</p>
            <p>如有疑问，请联系管理员。</p>
        `
    });
}

/**
 * 发送用户信息更新通知
 */
async function sendUpdateNotification(app, email, changes) {
    const changesHtml = generateChangesHtml(changes);
    return sendEmail(app, {
        to: email,
        subject: '账户信息更新通知',
        content: `
            <p>您的账户信息已更新：</p>
            ${changesHtml}
            <p>如果这不是您本人的操作，请立即联系管理员。</p>
        `
    });
}

/**
 * 发送自定义ID更新通知
 */
async function sendCustomIdUpdateNotification(app, email, oldId, newId, remainingChanges) {
    return sendEmail(app, {
        to: email,
        subject: '自定义ID已更新',
        content: `
            <p>您的自定义ID已更新：</p>
            <div class="changes">
                <div class="change-item">
                    <span>自定义ID：</span>
                    <span class="old-value">${oldId}</span> →
                    <span class="new-value">${newId}</span>
                </div>
                <div class="change-item">
                    <span>剩余更改次数：${remainingChanges}次</span>
                </div>
            </div>
        `
    });
}

/**
 * 发送VIP到期通知
 * @param {Object} app 应用配置
 * @param {string} email 用户邮箱
 * @param {number} expireTime 到期时间戳
 * @param {string} account 用户账号
 * @param {string} nickname 用户昵称
 */
async function sendVipExpirationNotification(app, email, expireTime, account, nickname) {
    const formattedExpireTime = formatVipTime(expireTime);
    return sendEmail(app, {
        to: email,
        subject: 'VIP到期通知',
        content: `
            <p>尊敬的用户，您好：</p>
            <div class="changes">
                <div class="change-item">
                    <p><strong>账号信息：</strong></p>
                    <p>账号：<span class="highlight">${account || '未设置'}</span></p>
                    <p>昵称：<span class="highlight">${nickname || '未设置'}</span></p>
                </div>
                <div class="change-item">
                    <p><strong>VIP到期提醒：</strong></p>
                    <p>到期时间：<span class="highlight">${formattedExpireTime}</span></p>
                </div>
            </div>
            <p>为了不影响您的使用体验，请及时续费。</p>
            <div class="warning">
                <p>安全提醒：</p>
                <ul>
                    <li>请勿将此邮件截图分享给他人，其中包含您的敏感账号信息</li>
                </ul>
            </div>
        `
    });
}

/**
 * 发送邮箱变更通知
 * @param {Object} app 应用配置
 * @param {string} newEmail 新邮箱
 * @param {Object} changes 变更信息
 * @param {string} changes.old 旧邮箱
 * @param {string} changes.new 新邮箱
 * @param {string} account 用户账号
 */
async function sendEmailUpdateNotification(app, newEmail, changes, account) {
    const currentTime = new Date().toLocaleString('zh-CN', {timeZone: 'Asia/Shanghai'});
    return sendEmail(app, {
        to: newEmail,
        subject: `${app.name} - 账号邮箱变更通知`,
        content: `
            <div style="padding: 20px; color: #333;">
                <h2 style="color: #333; margin-bottom: 20px;">账号邮箱变更通知</h2>
                
                <p>尊敬的用户：</p>
                
                <p>您好！您的账号邮箱已由管理员完成变更。以下是变更详情：</p>
                
                <div style="background: #f7f7f7; padding: 15px; margin: 20px 0; border-radius: 5px;">
                    <p><strong>账号：</strong>${account}</p>
                    <p><strong>变更时间：</strong>${currentTime}</p>
                    <p><strong>原邮箱地址：</strong>${changes.old}</p>
                    <p><strong>新邮箱地址：</strong>${changes.new}</p>
                </div>

                <p>如果此次变更不是由您申请，请立即：</p>
                <ol>
                    <li>联系管理员核实情况</li>
                    <li>检查账号安全设置</li>
                    <li>必要时更改账号密码</li>
                </ol>

                <div style="background: #fff3cd; color: #856404; padding: 15px; margin: 20px 0; border-radius: 5px; border-left: 5px solid #ffeeba;">
                    <p style="margin: 0;"><strong>安全提醒：</strong></p>
                    <ul style="margin: 10px 0 0 0; padding-left: 20px;">
                        <li>请勿将此邮件截图分享给他人，其中包含您的敏感账号信息</li>
                        <li>定期检查账号安全，及时修改密码</li>
                        <li>不要在不安全的设备上登录账号</li>
                    </ul>
                </div>

                <div style="margin-top: 30px; padding-top: 20px; border-top: 1px solid #eee;">
                    <p>此致</p>
                    <p>${app.name} 运营团队</p>
                    <p style="color: #666; font-size: 12px;">本邮件由系统自动发送，请勿直接回复</p>
                </div>
            </div>
        `
    });
}

/**
 * 格式化角色显示
 * @param {string} role 角色值
 * @returns {string} 格式化后的角色名称
 */
function formatRole(role) {
    const roleMap = {
        'admin': '管理员',
        'user': '普通用户',
        'tester': '测试用户',
        'auditor': '审核员'
    };
    return roleMap[role] || role;
}

/**
 * 格式化会员时间显示
 * @param {number} timestamp 时间戳
 * @returns {string} 格式化后的时间
 */
function formatVipTime(timestamp) {
    if (timestamp === 999999999) {
        return '永久会员';
    }
    return new Date(timestamp * 1000).toLocaleString('zh-CN', {
        timeZone: 'Asia/Shanghai',
        year: 'numeric',
        month: '2-digit',
        day: '2-digit',
        hour: '2-digit',
        minute: '2-digit'
    });
}

/**
 * 发送会员和角色变更通知
 * @param {Object} app 应用配置
 * @param {string} email 用户邮箱
 * @param {Object} changes 变更信息
 * @param {Object} changes.vip_time 会员时间变更
 * @param {Object} changes.role 角色变更
 * @param {string} account 用户账号
 * @param {string} nickname 用户昵称
 */
async function sendMembershipUpdateNotification(app, email, changes, account, nickname) {
    const currentTime = new Date().toLocaleString('zh-CN', {timeZone: 'Asia/Shanghai'});

    // 构建变更详情
    const details = [];
    if (changes.vip_time) {
        const oldTime = formatVipTime(changes.vip_time.old);
        const newTime = formatVipTime(changes.vip_time.new);
        details.push(`
            <div class="change-item">
                <p><strong>会员时间变更：</strong></p>
                <p>原到期时间：<span class="old-value">${oldTime}</span></p>
                <p>新到期时间：<span class="new-value">${newTime}</span></p>
            </div>
        `);
    }

    if (changes.role) {
        details.push(`
            <div class="change-item">
                <p><strong>用户角色变更：</strong></p>
                <p>原角色：<span class="old-value">${formatRole(changes.role.old) || '无'}</span></p>
                <p>新角色：<span class="new-value">${formatRole(changes.role.new)}</span></p>
            </div>
        `);
    }

    return sendEmail(app, {
        to: email,
        subject: `${app.name} - 会员信息变更通知`,
        content: `
            <div style="
                font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Oxygen, Ubuntu, Cantarell, 'Helvetica Neue', sans-serif;
                color: #1c1b1f;
                padding: 20px;
            ">
                <h1 style="font-size: 24px; font-weight: 500; line-height: 32px; color: #006495; margin: 0 0 16px 0;">
                    会员信息变更通知
                </h1>
                
                <p style="font-size: 14px; font-weight: 400; line-height: 20px; margin: 16px 0;">尊敬的用户：</p>
                
                <p style="font-size: 14px; font-weight: 400; line-height: 20px; margin: 16px 0;">
                    您好！您的账号信息已由管理员完成变更。以下是变更详情：
                </p>
                
                <div style="
                    background: #ffffff;
                    border-radius: 12px;
                    box-shadow: 0 1px 3px rgba(0,0,0,0.12), 0 1px 2px rgba(0,0,0,0.24);
                    padding: 24px;
                    margin: 16px 0;
                ">
                    <div style="display: grid; gap: 16px;">
                        <div style="font-size: 14px; font-weight: 400; line-height: 20px;">
                            <strong>账号：</strong>${account}
                        </div>
                        <div style="font-size: 14px; font-weight: 400; line-height: 20px;">
                            <strong>昵称：</strong>${nickname || '未设置'}
                        </div>
                        <div style="font-size: 14px; font-weight: 400; line-height: 20px;">
                            <strong>变更时间：</strong>${currentTime}
                        </div>
                        ${details.join('')}
                    </div>
                </div>

                <div style="
                    background: #fff3cd;
                    color: #856404;
                    padding: 15px;
                    margin: 20px 0;
                    border-radius: 5px;
                    border-left: 5px solid #ffeeba;
                ">
                    <p style="margin: 0; font-size: 16px; font-weight: 500; line-height: 24px;">安全提醒</p>
                    <ul style="
                        font-size: 14px;
                        font-weight: 400;
                        line-height: 20px;
                        margin: 10px 0 0 0;
                        padding-left: 20px;
                        color: #49454e;
                    ">
                        <li style="margin-bottom: 8px;">请勿将此邮件截图分享给他人，其中包含您的敏感账号信息</li>
                        <li style="margin-bottom: 8px;">定期检查账号安全，及时修改密码</li>
                        <li>不要在不安全的设备上登录账号</li>
                    </ul>
                </div>

                <div style="
                    margin-top: 30px;
                    padding-top: 20px;
                    border-top: 1px solid #e0e0e0;
                ">
                    <p style="font-size: 14px; font-weight: 400; line-height: 20px; margin: 8px 0;">此致</p>
                    <p style="font-size: 16px; font-weight: 500; line-height: 24px; color: #006495; margin: 8px 0;">${app.name} 运营团队</p>
                    <p style="font-size: 12px; font-weight: 500; line-height: 16px; color: #747279; margin: 16px 0 0 0;">本邮件由系统自动发送，请勿直接回复</p>
                </div>
            </div>
        `
    });
}

/**
 * 发送验证码邮件
 */
async function sendVerificationCode(app, email, code) {
    try {
        const html = `
            <!DOCTYPE html>
            <html>
            <head>
                <meta charset="UTF-8">
                <meta name="viewport" content="width=device-width, initial-scale=1.0">
                <title>验证码</title>
                <style>
                    body {
                        font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Oxygen, Ubuntu, Cantarell, 'Helvetica Neue', Arial, sans-serif;
                        line-height: 1.5;
                        color: #1c1b1f;
                        margin: 0;
                        padding: 20px;
                        background-color: #f5f5f5;
                    }
                    .container {
                        max-width: 600px;
                        margin: 0 auto;
                        background-color: #ffffff;
                        border-radius: 8px;
                        padding: 20px;
                        box-shadow: 0 2px 4px rgba(0,0,0,0.1);
                    }
                    .header {
                        text-align: center;
                        margin-bottom: 30px;
                    }
                    .header h1 {
                        color: #006495;
                        margin: 0;
                    }
                    .content {
                        padding: 20px;
                    }
                    .verification-code {
                        background-color: #f5f5f5;
                        padding: 15px;
                        font-size: 24px;
                        font-weight: bold;
                        text-align: center;
                        letter-spacing: 5px;
                        margin: 20px 0;
                        border-radius: 5px;
                        color: #333;
                    }
                    .footer {
                        margin-top: 30px;
                        text-align: center;
                        color: #666;
                        font-size: 14px;
                    }
                </style>
            </head>
            <body>
                <div class="container">
                    <div class="header">
                        <h1>${process.env.SMTP_FROM_NAME || '系统管理员'}</h1>
                    </div>
                    <div class="content">
                        <h2>验证码</h2>
                        <p>您好，您正在进行邮箱验证，验证码为：</p>
                        <div class="verification-code">${code}</div>
                        <p>验证码有效期为5分钟，请尽快完成验证。</p>
                        <p>如果这不是您的操作，请忽略此邮件。</p>
                    </div>
                    <div class="footer">
                        <p>此邮件由系统自动发送，请勿回复</p>
                    </div>
                </div>
            </body>
            </html>
        `;

        const transporter = createTransporter(app);
        await transporter.sendMail({
            from: `${process.env.SMTP_FROM_NAME || '系统管理员'} <${process.env.SMTP_USER}>`,
            to: email,
            subject: '验证码 - 邮箱绑定验证码',
            html
        });
    } catch (error) {
        console.error('发送验证码邮件失败:', error);
        throw new Error('发送验证码邮件失败');
    }
}

/**
 * 发送注册成功邮件
 */
async function sendRegistrationSuccessEmail(app, email, data) {
    try {
        const html = `
            <!DOCTYPE html>
            <html>
            <head>
                <meta charset="UTF-8">
                <meta name="viewport" content="width=device-width, initial-scale=1.0">
                <title>注册成功</title>
                <style>
                    body {
                        font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Oxygen, Ubuntu, Cantarell, 'Helvetica Neue', Arial, sans-serif;
                        line-height: 1.5;
                        color: #1c1b1f;
                        margin: 0;
                        padding: 20px;
                        background-color: #f5f5f5;
                    }
                    .container {
                        max-width: 600px;
                        margin: 0 auto;
                        background-color: #ffffff;
                        border-radius: 8px;
                        padding: 20px;
                        box-shadow: 0 2px 4px rgba(0,0,0,0.1);
                    }
                    .header {
                        text-align: center;
                        margin-bottom: 30px;
                    }
                    .header h1 {
                        color: #006495;
                        margin: 0;
                    }
                    .content {
                        padding: 20px;
                    }
                    .info-box {
                        background-color: #f5f5f5;
                        padding: 15px;
                        border-radius: 5px;
                        margin: 20px 0;
                    }
                    .info-box p {
                        margin: 5px 0;
                    }
                    .footer {
                        margin-top: 30px;
                        text-align: center;
                        color: #666;
                        font-size: 14px;
                    }
                </style>
            </head>
            <body>
                <div class="container">
                    <div class="header">
                        <h1>${process.env.SMTP_FROM_NAME || '系统管理员'}</h1>
                    </div>
                    <div class="content">
                        <h2>注册成功</h2>
                        <p>恭喜您成功注册成为管理员！以下是您的账号信息：</p>
                        <div class="info-box">
                            <p><strong>账号：</strong>${data.account}</p>
                            <p><strong>邮箱：</strong>${data.email}</p>
                            <p><strong>注册时间：</strong>${data.registerTime}</p>
                        </div>
                        <p>请妥善保管您的账号信息，如有任何问题，请联系系统管理员。</p>
                    </div>
                    <div class="footer">
                        <p>此邮件由系统自动发送，请勿回复</p>
                    </div>
                </div>
            </body>
            </html>
        `;

        const transporter = createTransporter();
        await transporter.sendMail({
            from: `${process.env.SMTP_FROM_NAME || '系统管理员'} <${process.env.SMTP_USER}>`,
            to: email,
            subject: '注册成功通知',
            html
        });
    } catch (error) {
        console.error('发送注册成功邮件失败:', error);
        throw new Error('发送注册成功邮件失败');
    }
}

/**
 * 发送抽奖中奖通知
 * @param {Object} app 应用配置
 * @param {string} email 用户邮箱
 * @param {Object} data 中奖信息
 */
async function sendLotteryWinningNotification(app, email, data) {
    // 格式化奖励信息
    let rewardText = '';
    if (data.reward.type === 'integral') {
        rewardText = `${data.reward.amount} 积分`;
    } else {
        rewardText = data.reward.unit === 'permanent'
            ? '永久会员'
            : `${data.reward.amount} ${formatTimeUnit(data.reward.unit)}会员`;
    }

    return sendEmail(app, {
        to: email,
        subject: '恭喜您中奖啦！',
        content: `
            <div style="
                font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Oxygen, Ubuntu, Cantarell, 'Helvetica Neue', sans-serif;
                color: #1c1b1f;
                padding: 20px;
            ">
                <h1 style="font-size: 24px; font-weight: 500; line-height: 32px; color: #006495; margin: 0 0 16px 0;">
                    🎉 恭喜您中奖啦！
                </h1>
                
                <p style="font-size: 14px; font-weight: 400; line-height: 20px; margin: 16px 0;">
                    尊敬的 ${data.name} 用户：
                </p>
                
                <p style="font-size: 14px; font-weight: 400; line-height: 20px; margin: 16px 0;">
                    恭喜您在"${data.lotteryName}"抽奖活动中获奖！
                </p>
                
                <div style="
                    background: #ffffff;
                    border-radius: 12px;
                    box-shadow: 0 1px 3px rgba(0,0,0,0.12), 0 1px 2px rgba(0,0,0,0.24);
                    padding: 24px;
                    margin: 16px 0;
                ">
                    <div style="display: grid; gap: 16px;">
                        <div style="font-size: 14px; font-weight: 400; line-height: 20px;">
                            <strong>活动名称：</strong>${data.lotteryName}
                        </div>
                        <div style="font-size: 14px; font-weight: 400; line-height: 20px;">
                            <strong>中奖时间：</strong>${data.drawTime}
                        </div>
                        <div style="font-size: 14px; font-weight: 400; line-height: 20px;">
                            <strong>获得奖励：</strong>${rewardText}
                        </div>
                        ${data.reward.type === 'membership' && data.reward.expireTime ? `
                            <div style="font-size: 14px; font-weight: 400; line-height: 20px;">
                                <strong>会员到期时间：</strong>${formatVipTime(data.reward.expireTime)}
                            </div>
                        ` : ''}
                    </div>
                </div>

                <p style="font-size: 14px; font-weight: 400; line-height: 20px; margin: 16px 0;">
                    奖励已自动发放到您的账户中，请注意查收。
                </p>

                <div style="
                    background: #fff3cd;
                    color: #856404;
                    padding: 15px;
                    margin: 20px 0;
                    border-radius: 5px;
                    border-left: 5px solid #ffeeba;
                ">
                    <p style="margin: 0; font-size: 16px; font-weight: 500; line-height: 24px;">温馨提示</p>
                    <ul style="
                        font-size: 14px;
                        font-weight: 400;
                        line-height: 20px;
                        margin: 10px 0 0 0;
                        padding-left: 20px;
                        color: #49454e;
                    ">
                        <li>请勿将中奖信息告知他人，谨防诈骗</li>
                        <li>如有疑问，请联系客服</li>
                    </ul>
                </div>

                <div style="
                    margin-top: 30px;
                    padding-top: 20px;
                    border-top: 1px solid #e0e0e0;
                ">
                    <p style="font-size: 14px; font-weight: 400; line-height: 20px; margin: 8px 0;">此致</p>
                    <p style="font-size: 16px; font-weight: 500; line-height: 24px; color: #006495; margin: 8px 0;">${app.name} 运营团队</p>
                    <p style="font-size: 12px; font-weight: 500; line-height: 16px; color: #747279; margin: 16px 0 0 0;">本邮件由系统自动发送，请勿直接回复</p>
                </div>
            </div>
        `
    });
}

// 格式化时间单位
function formatTimeUnit(unit) {
    const unitMap = {
        'minutes': '分钟',
        'hours': '小时',
        'days': '天',
        'months': '个月',
        'years': '年'
    };
    return unitMap[unit] || unit;
}

module.exports = {
    sendPasswordUpdateNotification,
    sendVipExpirationNotification,
    sendCustomIdUpdateNotification,
    sendUpdateNotification,
    sendEmailUpdateNotification,
    sendMembershipUpdateNotification,
    sendVerificationCode,
    sendRegistrationSuccessEmail,
    sendLotteryWinningNotification
};
