const axios = require('axios');
const FormData = require('form-data');
const SystemLogService = require('./systemLogService');

class NSFWService {
    // 支持的文件类型配置
    static SUPPORTED_TYPES = {
        IMAGE: ['image/jpeg', 'image/png', 'image/gif', 'image/webp'],
        VIDEO: ['video/mp4', 'video/webm', 'video/quicktime'],
        PDF: ['application/pdf'],
        ARCHIVE: ['application/zip', 'application/x-rar-compressed', 'application/x-7z-compressed']
    };

    static MAX_FILE_SIZES = {
        IMAGE: 5 * 1024 * 1024,    // 5MB
        VIDEO: 100 * 1024 * 1024,  // 100MB
        PDF: 20 * 1024 * 1024,     // 20MB
        ARCHIVE: 50 * 1024 * 1024  // 50MB
    };

    /**
     * 检测文件是否包含 NSFW 内容
     * @param {Object} options 检测选项
     * @param {Buffer|Stream} options.file 文件内容
     * @param {string} options.fileName 文件名
     * @param {string} options.mimeType 文件类型
     * @param {number} options.fileSize 文件大小
     * @param {Function} [options.onProgress] 进度回调函数
     * @returns {Promise<Object>} 检测结果
     */
    static async checkContent(options) {
        const {
            file,
            fileName,
            mimeType,
            fileSize,
            onProgress
        } = options;

        try {
            // 验证参数
            if (!file) {
                throw new Error('文件不能为空');
            }

            // 获取文件类型
            const fileType = this.getFileType(mimeType);
            if (!fileType) {
                throw new Error('不支持的文件类型');
            }

            // 验证文件大小
            const maxSize = this.MAX_FILE_SIZES[fileType];
            if (fileSize > maxSize) {
                throw new Error(`文件大小超过限制 (最大 ${maxSize / 1024 / 1024}MB)`);
            }

            // 创建 FormData
            const formData = new FormData();
            formData.append('file', file, {
                filename: fileName,
                contentType: mimeType
            });
            formData.append('type', fileType.toLowerCase());

            // 发送请求
            const response = await axios.post('http://karpov.cn:3333/check', formData, {
                headers: {
                    ...formData.getHeaders()
                },
                maxContentLength: Infinity,
                maxBodyLength: Infinity,
                onUploadProgress: (progressEvent) => {
                    if (onProgress && progressEvent.total) {
                        const progress = Math.round((progressEvent.loaded * 100) / progressEvent.total);
                        onProgress(progress);
                    }
                }
            });

            // 记录检测日志
            await SystemLogService.createLog({
                type: 'nsfw_check',
                content: `${fileType} NSFW检测`,
                details: {
                    fileName,
                    fileSize,
                    fileType,
                    result: response.data.result
                }
            });

            return {
                success: true,
                nsfw: response.data.result.nsfw,
                normal: response.data.result.normal,
                isNSFW: response.data.result.nsfw > 0.8,
                details: response.data.result.details || {}
            };

        } catch (error) {
            // 记录错误日志
            await SystemLogService.error('NSFW检测失败', {
                error: error.message,
                fileName,
                mimeType
            });

            return {
                success: false,
                error: error.message
            };
        }
    }

    /**
     * 获取文件类型
     * @private
     * @param {string} mimeType MIME类型
     * @returns {string|null} 文件类型
     */
    static getFileType(mimeType) {
        for (const [type, mimeTypes] of Object.entries(this.SUPPORTED_TYPES)) {
            if (mimeTypes.includes(mimeType)) {
                return type;
            }
        }
        return null;
    }

    /**
     * 检测URL内容是否包含 NSFW 内容
     * @param {string} url 内容URL
     * @param {Function} [onProgress] 进度回调函数
     * @returns {Promise<Object>} 检测结果
     */
    static async checkUrl(url, onProgress) {
        try {
            // 下载内容
            const response = await axios.get(url, {
                responseType: 'stream',
                onDownloadProgress: (progressEvent) => {
                    if (onProgress && progressEvent.total) {
                        const progress = Math.round((progressEvent.loaded * 100) / progressEvent.total);
                        onProgress(progress);
                    }
                }
            });

            const contentType = response.headers['content-type'];
            const contentLength = response.headers['content-length'];

            return await this.checkContent({
                file: response.data,
                fileName: url.split('/').pop() || 'file',
                mimeType: contentType,
                fileSize: parseInt(contentLength),
                onProgress
            });

        } catch (error) {
            return {
                success: false,
                error: error.message
            };
        }
    }

    // 向后兼容的方法
    static async checkImage(options) {
        return this.checkContent(options);
    }

    static async checkImageUrl(url, onProgress) {
        return this.checkUrl(url, onProgress);
    }
}

module.exports = NSFWService; 