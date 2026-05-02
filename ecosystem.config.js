module.exports = {
  apps: [
    {
      name: process.env.PM2_NAME || 'sms-hub-backend',
      script: 'dist/main.js',
      instances: 'max',
      exec_mode: 'cluster',
      autorestart: true,
      watch: false,
      env_file: '.env',
    },
  ],
};
