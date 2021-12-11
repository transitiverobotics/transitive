const docker = require('./docker');
docker.ensureRunning({name: 'health-monitoring', version: '0.3.13-2'});
