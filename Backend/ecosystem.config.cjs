/**
 * PALKI backend under PM2 on the dedicated server (palkicabs.com, see deploy/README.md).
 *
 * One fork-mode instance on 127.0.0.1:5025. Socket.IO is only correct with a
 * single instance unless the Redis adapter is enabled - do not raise
 * instances without checking that first.
 *
 * PORT is set here rather than in .env: dotenv does not override a variable that
 * is already present in the environment, so this value wins.
 */
module.exports = {
  apps: [
    {
      name: 'palkicabs-backend',
      script: 'server.js',
      cwd: __dirname,
      exec_mode: 'fork',
      env: {
        NODE_ENV: 'production',
        PORT: 5025,
      },
      max_memory_restart: '700M',
      time: true,
      kill_timeout: 8000,
    },
  ],
};
