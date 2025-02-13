const sanitizeValue = (value) => {
    if (typeof value === 'string') {
        return value
            // 移除HTML标签
            .replace(/<[^>]*>/g, '')
            // 移除危险字符
            .replace(/[<>=\\\/\n\r\t`~!@#$%^&*()+{}|:"?]/g, '')
            // 移除控制字符
            .replace(/[\x00-\x1F\x7F]/g, '')
            // 移除零宽字符
            .replace(/[\u200B-\u200D\uFEFF]/g, '')
            // 移除脚本相关字符串
            .replace(/javascript:|data:|vbscript:|expression\(|@import/gi, '')
            // 处理多余空格
            .trim();
    } else if (Array.isArray(value)) {
        return value.map(item => sanitizeValue(item));
    } else if (typeof value === 'object' && value !== null) {
        const sanitizedObj = {};
        for (const key in value) {
            if (Object.prototype.hasOwnProperty.call(value, key)) {
                sanitizedObj[key] = sanitizeValue(value[key]);
            }
        }
        return sanitizedObj;
    }
    return value;
};

// 特殊字段的自定义处理规则
const specialFieldRules = {
    'password': (value) => value, // 密码不做清理
    'email': (value) => {
        if (typeof value === 'string') {
            // 邮箱只允许字母、数字、@、.、-、_
            return value.replace(/[^a-zA-Z0-9@._-]/g, '');
        }
        return value;
    },
    'account': (value) => {
        if (typeof value === 'string') {
            // 账号只允许字母、数字和下划线
            return value.replace(/[^a-zA-Z0-9_]/g, '');
        }
        return value;
    },
    'customId': (value) => {
        if (typeof value === 'string') {
            // 自定义ID只允许字母和数字
            return value.replace(/[^a-zA-Z0-9]/g, '');
        }
        return value;
    },
    'name': (value) => {
        if (typeof value === 'string') {
            // 用户名允许中文、字母、数字、下划线，但需要清理其他特殊字符
            return value
                .replace(/<[^>]*>/g, '')
                .replace(/[<>=\\\/\n\r\t`~!@#$%^&*()+{}|:"?]/g, '')
                .replace(/[\x00-\x1F\x7F]/g, '')
                .trim();
        }
        return value;
    }
};

const sanitizeMiddleware = (req, res, next) => {
    try {
        // 处理查询参数
        if (req.query) {
            for (const key in req.query) {
                if (Object.prototype.hasOwnProperty.call(req.query, key)) {
                    if (specialFieldRules[key]) {
                        req.query[key] = specialFieldRules[key](req.query[key]);
                    } else {
                        req.query[key] = sanitizeValue(req.query[key]);
                    }
                }
            }
        }

        // 处理请求体
        if (req.body) {
            for (const key in req.body) {
                if (Object.prototype.hasOwnProperty.call(req.body, key)) {
                    if (specialFieldRules[key]) {
                        req.body[key] = specialFieldRules[key](req.body[key]);
                    } else {
                        req.body[key] = sanitizeValue(req.body[key]);
                    }
                }
            }
        }

        // 处理URL参数
        if (req.params) {
            for (const key in req.params) {
                if (Object.prototype.hasOwnProperty.call(req.params, key)) {
                    if (specialFieldRules[key]) {
                        req.params[key] = specialFieldRules[key](req.params[key]);
                    } else {
                        req.params[key] = sanitizeValue(req.params[key]);
                    }
                }
            }
        }

        next();
    } catch (error) {
        console.error('Input sanitization error:', error);
        res.status(400).json({
            code: 400,
            message: '请求参数包含非法字符'
        });
    }
};

module.exports = sanitizeMiddleware;
