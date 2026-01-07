module.exports = {
    apps: [
        {
            name: "geolocation-pro-app",
            script: "npm",
            args: "run start",
            env: {
                NODE_ENV: "production",
                PORT: 3001,
            },
        },
    ],
};
