module.exports = {
    apps: [
        {
            name: "geo-redirect-country-blocker",
            script: "npm",
            args: "run start",
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
            env: {
                NODE_ENV: "production",
            },
            env_file: ".env",
        },
    ],
};
