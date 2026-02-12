/**
 * Utilitário de Criptografia
 * 
 * Funções para criptografar e descriptografar dados sensíveis
 */

const crypto = require('crypto');

const ALGORITHM = 'aes-256-gcm';
const IV_LENGTH = 16;
const SALT_LENGTH = 64;
const TAG_LENGTH = 16;
const KEY_LENGTH = 32;
const ITERATIONS = 100000;

/**
 * Deriva uma chave a partir de uma senha
 */
function deriveKey(password, salt) {
    return crypto.pbkdf2Sync(password, salt, ITERATIONS, KEY_LENGTH, 'sha512');
}

/**
 * Criptografa dados
 * @param {string} data - Dados a serem criptografados
 * @param {string} password - Senha para criptografia
 * @returns {string} - Dados criptografados em base64
 */
function encrypt(data, password) {
    const salt = crypto.randomBytes(SALT_LENGTH);
    const key = deriveKey(password, salt);
    const iv = crypto.randomBytes(IV_LENGTH);
    
    const cipher = crypto.createCipheriv(ALGORITHM, key, iv);
    
    let encrypted = cipher.update(data, 'utf8', 'hex');
    encrypted += cipher.final('hex');
    
    const tag = cipher.getAuthTag();
    
    // Formato: salt + iv + tag + encrypted
    const result = Buffer.concat([
        salt,
        iv,
        tag,
        Buffer.from(encrypted, 'hex')
    ]);
    
    return result.toString('base64');
}

/**
 * Descriptografa dados
 * @param {string} encryptedData - Dados criptografados em base64
 * @param {string} password - Senha para descriptografia
 * @returns {string} - Dados originais
 */
function decrypt(encryptedData, password) {
    const buffer = Buffer.from(encryptedData, 'base64');
    
    const salt = buffer.slice(0, SALT_LENGTH);
    const iv = buffer.slice(SALT_LENGTH, SALT_LENGTH + IV_LENGTH);
    const tag = buffer.slice(SALT_LENGTH + IV_LENGTH, SALT_LENGTH + IV_LENGTH + TAG_LENGTH);
    const encrypted = buffer.slice(SALT_LENGTH + IV_LENGTH + TAG_LENGTH);
    
    const key = deriveKey(password, salt);
    
    const decipher = crypto.createDecipheriv(ALGORITHM, key, iv);
    decipher.setAuthTag(tag);
    
    let decrypted = decipher.update(encrypted.toString('hex'), 'hex', 'utf8');
    decrypted += decipher.final('utf8');
    
    return decrypted;
}

/**
 * Gera um hash seguro
 * @param {string} data - Dados para hash
 * @returns {string} - Hash SHA-256
 */
function hash(data) {
    return crypto.createHash('sha256').update(data).digest('hex');
}

/**
 * Gera um token aleatório seguro
 * @param {number} length - Tamanho do token em bytes
 * @returns {string} - Token em hex
 */
function generateSecureToken(length = 32) {
    return crypto.randomBytes(length).toString('hex');
}

/**
 * Compara strings de forma segura (timing-safe)
 * @param {string} a - Primeira string
 * @param {string} b - Segunda string
 * @returns {boolean} - Se são iguais
 */
function secureCompare(a, b) {
    if (typeof a !== 'string' || typeof b !== 'string') {
        return false;
    }
    
    const bufA = Buffer.from(a);
    const bufB = Buffer.from(b);
    
    if (bufA.length !== bufB.length) {
        return false;
    }
    
    return crypto.timingSafeEqual(bufA, bufB);
}

/**
 * Mascara dados sensíveis para logs
 * @param {string} data - Dados a serem mascarados
 * @param {number} visibleChars - Caracteres visíveis no início e fim
 * @returns {string} - Dados mascarados
 */
function maskSensitiveData(data, visibleChars = 4) {
    if (!data || data.length <= visibleChars * 2) {
        return '****';
    }
    
    const start = data.slice(0, visibleChars);
    const end = data.slice(-visibleChars);
    const masked = '*'.repeat(Math.min(data.length - visibleChars * 2, 10));
    
    return `${start}${masked}${end}`;
}

module.exports = {
    encrypt,
    decrypt,
    hash,
    generateSecureToken,
    secureCompare,
    maskSensitiveData
};
