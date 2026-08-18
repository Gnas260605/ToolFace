/* eslint-disable */
const fs = require('fs');
const path = require('path');
const { Client } = require('ssh2');
const { ZipArchive } = require('archiver');

// Helper to manually parse env file without external dotenv dependency
function loadEnv(filePath) {
  if (!fs.existsSync(filePath)) return {};
  const content = fs.readFileSync(filePath, 'utf8');
  const env = {};
  content.split(/\r?\n/).forEach((line) => {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) return;
    const parts = trimmed.split('=');
    if (parts.length >= 2) {
      const key = parts[0].trim();
      let val = parts.slice(1).join('=').trim();
      if ((val.startsWith('"') && val.endsWith('"')) || (val.startsWith("'") && val.endsWith("'"))) {
        val = val.substring(1, val.length - 1);
      }
      env[key] = val;
    }
  });
  return env;
}

// Load env files
const localEnv = loadEnv(path.join(__dirname, '.env'));
const prodEnv = loadEnv(path.join(__dirname, '.env.prod'));

// Setup configuration
const VPS_SSH_HOST = localEnv.VPS_SSH_HOST || prodEnv.VPS_SSH_HOST || '14.225.204.44';
const VPS_SSH_PORT = parseInt(localEnv.VPS_SSH_PORT || prodEnv.VPS_SSH_PORT || '22', 10);
const VPS_SSH_USER = localEnv.VPS_SSH_USER || prodEnv.VPS_SSH_USER || 'root';
const VPS_SSH_PASSWORD = localEnv.VPS_SSH_PASSWORD || prodEnv.VPS_SSH_PASSWORD || '';
const VPS_SSH_KEY_PATH = localEnv.VPS_SSH_KEY_PATH || prodEnv.VPS_SSH_KEY_PATH || '';
const VPS_PROJECT_PATH = localEnv.VPS_PROJECT_PATH || prodEnv.VPS_PROJECT_PATH || '/root/ToolFaceAI';

console.log('=== NewsFlow AI Automated VPS Deployer ===');
console.log(`Target VPS Host: ${VPS_SSH_HOST}:${VPS_SSH_PORT}`);
console.log(`Target User: ${VPS_SSH_USER}`);
console.log(`Target Path: ${VPS_PROJECT_PATH}\n`);

// Validation
if (!VPS_SSH_PASSWORD && !VPS_SSH_KEY_PATH) {
  console.error('ERROR: Vui lòng cấu hình VPS_SSH_PASSWORD hoặc VPS_SSH_KEY_PATH trong file .env hoặc .env.prod');
  process.exit(1);
}

const archiveName = 'project-deploy.zip';
const archivePath = path.join(__dirname, archiveName);

// 1. Zip project files
function zipProject() {
  return new Promise((resolve, reject) => {
    console.log('>>> Đang nén mã nguồn dự án...');
    const output = fs.createWriteStream(archivePath);
    const archive = new ZipArchive({ zlib: { level: 9 } });

    output.on('close', () => {
      console.log(`>>> Đã nén xong! Tổng kích thước: ${(archive.pointer() / 1024 / 1024).toFixed(2)} MB`);
      resolve();
    });

    archive.on('error', (err) => reject(err));

    archive.pipe(output);

    // List of directories and files to exclude
    const excludes = [
      'node_modules/**',
      '**/node_modules/**',
      '.next/**',
      '**/dist/**',
      'dist/**',
      '.turbo/**',
      '**/.turbo/**',
      '.git/**',
      '.github/**',
      'infrastructure/nginx/logs/**',
      '**/*.zip',
      archiveName,
    ];

    archive.glob('**/*', {
      cwd: __dirname,
      ignore: excludes,
      dot: true,
    });

    archive.finalize();
  });
}

// 2. SSH and Deploy
function deployOverSSH() {
  return new Promise((resolve, reject) => {
    const conn = new Client();
    
    const connConfig = {
      host: VPS_SSH_HOST,
      port: VPS_SSH_PORT,
      username: VPS_SSH_USER,
    };

    if (VPS_SSH_KEY_PATH) {
      if (fs.existsSync(VPS_SSH_KEY_PATH)) {
        connConfig.privateKey = fs.readFileSync(VPS_SSH_KEY_PATH);
      } else {
        console.warn(`Cảnh báo: Không tìm thấy file key tại ${VPS_SSH_KEY_PATH}, chuyển sang dùng mật khẩu.`);
      }
    }
    
    if (VPS_SSH_PASSWORD) {
      connConfig.password = VPS_SSH_PASSWORD;
    }

    conn.on('ready', () => {
      console.log('>>> Đã kết nối SSH thành công tới VPS!');

      // Upload file zip via SFTP
      conn.sftp((err, sftp) => {
        if (err) {
          conn.end();
          return reject(err);
        }

        const remoteZipPath = `${VPS_PROJECT_PATH}/${archiveName}`;
        console.log(`>>> Đang tải file nén lên VPS: ${remoteZipPath}...`);

        sftp.fastPut(archivePath, remoteZipPath, {}, (uploadErr) => {
          if (uploadErr) {
            conn.end();
            return reject(uploadErr);
          }
          console.log('>>> Tải file nén lên VPS hoàn tất!');

          // Execute deployment commands on VPS
          const commands = [
            `mkdir -p ${VPS_PROJECT_PATH}`,
            `cd ${VPS_PROJECT_PATH}`,
            `(command -v unzip >/dev/null 2>&1 || apt-get update && apt-get install -y unzip || yum install -y unzip || apk add unzip)`,
            `unzip -o ${archiveName}`,
            `rm ${archiveName}`,
            `chmod +x deploy.sh`,
            `./deploy.sh`
          ].join(' && ');

          console.log('>>> Đang chạy các lệnh deploy trên VPS...');
          conn.exec(commands, (execErr, stream) => {
            if (execErr) {
              conn.end();
              return reject(execErr);
            }

            stream.on('close', (code, signal) => {
              conn.end();
              if (code === 0) {
                console.log('\n=== DEPLOY THÀNH CÔNG LÊN VPS! ===');
                resolve();
              } else {
                reject(new Error(`Lệnh deploy thất bại với mã code: ${code}`));
              }
            }).on('data', (data) => {
              process.stdout.write(data.toString());
            }).stderr.on('data', (data) => {
              process.stderr.write(data.toString());
            });
          });
        });
      });
    }).on('error', (err) => {
      reject(err);
    }).connect(connConfig);
  });
}

async function main() {
  try {
    await zipProject();
    await deployOverSSH();
  } catch (err) {
    console.error('\n❌ CÓ LỖI XẢY RA TRONG QUÁ TRÌNH DEPLOY:');
    console.error(err.message || err);
  } finally {
    // Clean up local zip file
    if (fs.existsSync(archivePath)) {
      console.log('>>> Đang xóa file nén tạm ở local...');
      fs.unlinkSync(archivePath);
    }
  }
}

main();
