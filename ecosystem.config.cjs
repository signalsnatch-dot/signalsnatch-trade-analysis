module.exports = {
  apps: [
    {
      name: "signalsnatch-app",
      script: "server.ts",
      interpreter: "./node_modules/.bin/tsx",
      instances: 1,
      exec_mode: "fork",
      node_args: "--max-old-space-size=1536",
      env: {
        NODE_ENV: "production",
        PORT: 8080
      },
      max_memory_restart: "1700M",
      error_file: "./logs/pm2-error.log",
      out_file: "./logs/pm2-out.log",
      log_date_format: "YYYY-MM-DD HH:mm:ss.SSS Z"
    }
  ]
};
