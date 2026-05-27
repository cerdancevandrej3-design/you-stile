module.exports = {
  apps: [{
    name: 'stilist',
    script: 'node',
    args: './node_modules/tsx/dist/cli.cjs server.ts',
    cwd: '.',
    instances: 1,
    autorestart: true,
    watch: false,
    max_memory_restart: '500M',
    env: {
      NODE_ENV: 'production'
    }
  }]
};
