module.exports = {
    apps: [
        {
            name: "geo-redirect-country-blocker",
            script: "npm",
            args: "run start",
            autorestart: true,
            max_restarts: 10,
            min_uptime: "10s",
            restart_delay: 5000,
            env: {
                NODE_ENV: "production",
                PORT: 3001,
                DISABLE_IN_APP_CRON: "true",
            },
            env_file: ".env",
        },
        {
            name: "geo-billing-worker",
            script: "npm",
            args: "run worker:billing",
            autorestart: true,
            max_restarts: 10,
            min_uptime: "10s",
            restart_delay: 5000,
            env: {
                NODE_ENV: "production",
            },
            env_file: ".env",
        },
    ],
};
