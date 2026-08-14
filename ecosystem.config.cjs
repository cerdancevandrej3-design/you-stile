module.exports = {
  apps: [
    {
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
    },
    {
      name: 'hermes',
      script: 'node',
      args: './node_modules/tsx/dist/cli.cjs hermes/hermes.ts',
      cwd: '.',
      instances: 1,
      autorestart: true,
      watch: false,
      max_memory_restart: '300M',
      env: {
        NODE_ENV: 'production'
      }
    },
    {
      name: 'flight-watch',
      script: 'node',
      args: './node_modules/tsx/dist/cli.cjs hermes/flight-watch.ts',
      cwd: '.',
      instances: 1,
      autorestart: true,
      watch: false,
      max_memory_restart: '200M',
      env: {
        NODE_ENV: 'production'
      }
    }
  ]
};
