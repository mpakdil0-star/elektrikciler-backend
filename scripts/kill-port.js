const { exec } = require('child_process');

const PORT = 5000;

console.log(`🧹 Cleaning up port ${PORT}...`);

if (process.platform === 'win32') {
    exec(`netstat -ano | findstr :${PORT}`, (err, stdout) => {
        if (stdout) {
            const lines = stdout.trim().split('\n');
            lines.forEach(line => {
                const parts = line.trim().split(/\s+/);
                const pid = parts[parts.length - 1];
                if (pid && pid !== '0') {
                    console.log(`💀 Killing process ${pid} on port ${PORT}`);
                    try {
                        exec(`taskkill /F /PID ${pid}`);
                    } catch (e) {
                        // Ignore errors
                    }
                }
            });
        }
    });
} else {
    // Linux/Mac
    exec(`lsof -i :${PORT} -t | xargs kill -9`);
}
