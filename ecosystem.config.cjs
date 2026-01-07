module.exports = {
    apps: [
        {
            name: "geo-redirect-country-blocker",
            script: "npm",
            args: "run start",
            env: {
                NODE_ENV: "production",
                PORT: 3001,
            },
        },
    ],
};
