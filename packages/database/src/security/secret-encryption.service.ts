import { randomBytes, createCipheriv, createDecipheriv } from 'crypto';

export interface EncryptedSecret {
  ciphertext: string;
  iv: string;
  authTag: string;
  keyVersion: string;
}

export class SecretEncryptionService {
  private readonly algorithm = 'aes-256-gcm';
  private keys: Map<string, Buffer> = new Map();
  private activeKeyVersion: string;

  constructor() {
    this.activeKeyVersion = process.env.TOKEN_ENCRYPTION_ACTIVE_KEY_VERSION || 'v1';
    
    // Load all keys from environment variables matching TOKEN_ENCRYPTION_KEY_*
    for (const [key, value] of Object.entries(process.env)) {
      if (key.startsWith('TOKEN_ENCRYPTION_KEY_') && value) {
        const version = key.replace('TOKEN_ENCRYPTION_KEY_', '').toLowerCase();
        // The key might be hex encoded or just a raw string. 
        // We ensure it is 32 bytes for aes-256-gcm.
        let keyBuffer = Buffer.from(value, 'utf8');
        if (keyBuffer.length !== 32) {
            // Try hex or base64 if length isn't 32
            keyBuffer = Buffer.from(value, 'hex');
        }
        if (keyBuffer.length !== 32) {
             throw new Error(`Encryption key for version ${version} is not 32 bytes.`);
        }
        this.keys.set(version, keyBuffer);
      }
    }

    if (!this.keys.has(this.activeKeyVersion)) {
      throw new Error(`Active encryption key version '${this.activeKeyVersion}' is missing from environment.`);
    }
  }

  async encrypt(input: { plaintext: string; keyVersion?: string; associatedData: string }): Promise<EncryptedSecret> {
    const version = input.keyVersion || this.activeKeyVersion;
    const key = this.keys.get(version);
    if (!key) {
      throw new Error(`Encryption key for version '${version}' not found.`);
    }

    const iv = randomBytes(12); // Standard for GCM
    const cipher = createCipheriv(this.algorithm, key, iv);
    
    // Bind associated data
    cipher.setAAD(Buffer.from(input.associatedData, 'utf8'));

    let ciphertext = cipher.update(input.plaintext, 'utf8', 'hex');
    ciphertext += cipher.final('hex');
    const authTag = cipher.getAuthTag().toString('hex');

    return {
      ciphertext,
      iv: iv.toString('hex'),
      authTag,
      keyVersion: version,
    };
  }

  async decrypt(input: { ciphertext: string; iv: string; authTag: string; keyVersion: string; associatedData: string }): Promise<string> {
    const key = this.keys.get(input.keyVersion);
    if (!key) {
      throw new Error(`Decryption key for version '${input.keyVersion}' not found.`);
    }

    const decipher = createDecipheriv(this.algorithm, key, Buffer.from(input.iv, 'hex'));
    decipher.setAuthTag(Buffer.from(input.authTag, 'hex'));
    decipher.setAAD(Buffer.from(input.associatedData, 'utf8'));

    let plaintext = decipher.update(input.ciphertext, 'hex', 'utf8');
    plaintext += decipher.final('utf8');

    return plaintext;
  }
}
