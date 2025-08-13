/**
  Local part of MQTT bridge (using Aedes)
*/

const fs = require('fs');

const Aedes = require('aedes-preunsub');
const persistence = require('aedes-persistence')();

const { getLogger } = require('@transitive-sdk/utils');
const log = getLogger('localMQTT');
log.setLevel('info');

const PORT = 1883;

/* Monkey-patch persistence to *not* retain anything. Avoids Issue#512. We do
NOT want to retain package-specific messages because we do not subscribe to
them all the time and could be missing "clear" messages, which would cause
discrepancies between the master data (in the cloud) and our local copy.
Instead, we just un-subscribe and resubscribe to upstream and get retained
messages from there when we connect. Alo local messages, coming from
capabilities running locally, should not be retained, because we may be
missing a corresponding "clear" from upstream. */
persistence.storeRetained = (packet, callback) => { callback(); };

// subscription options for upstream client: required to see the retain flag
const subOptions = {rap: true};

/** try parsing JSON, return null if unsuccessful */
const tryJSONParse = (string) => {
  try {
    return JSON.parse(string);
  } catch (e) {
    return null;
  }
};

/** return topic with slash in front if it doesn't have one yet */
const ensureSlash = (topic) => `${(topic[0] == '/' ? '' : '/')}${topic}`;

/** Start the local mqtt broker. upstreamClient is the upstream mqtt client */
const startLocalMQTTBroker = (upstreamClient, mqttSync, prefix, agentPrefix, onError) => {

  const aedes = Aedes({persistence});

  const server = require('net').createServer(aedes.handle);
  log.debug('prefix =', prefix);

  server.on('error', (error) => {
    log.error(`Error starting local mqtt server:`, error);
    onError?.(error);
  });

  server.listen(PORT, () => log.info('local mqtt server bound'));

  aedes.on('publish', (packet, client) => {
    if (!packet.topic.startsWith('$SYS') && client && upstreamClient) {
      log.debug('publish up', packet.topic, packet.payload.toString('utf-8'),
        client && client.id, packet.retain);
      // relay packet to upstream, note that topic has already been forced into
      // client's namespace by authorizePublish function
      upstreamClient.publish(packet.topic, packet.payload, {
        retain: packet.retain,
        qos: packet.qos
      });
    }
  });

  aedes.on('subscribe', (subscriptions, client) => {
    subscriptions.forEach(subscription => {
      log.debug(client && client.id, 'wants', subscription);
      if (client && upstreamClient) {
        upstreamClient.subscribe(subscription.topic, subOptions); // TODO: also relay QoS
      }
    });
  });

  aedes.on('unsubscribe', (subscriptions, client) => {
    subscriptions.forEach(subscription => {
      log.debug(client && client.id, 'is unsubscribing from', subscription);
      if (client && upstreamClient) {
        upstreamClient.unsubscribe(subscription, log.debug);
      }
    });
  });

  aedes.on('clientReady', (client) => {
    log.info('clientReady', client.id, client.meta);
    const path = [agentPrefix, 'status', 'runningPackages', client.id ];
    const version = client.meta?.version || client.id.split('/').at(-1);
    mqttSync.data.update(path.join('/'), version); 
  });

  aedes.on('clientDisconnect', (client) => {
    log.info('clientDisconnect', client.id);
    const path = [agentPrefix, 'status', 'runningPackages', client.id ];
    mqttSync.data.update(path.join('/'), false);
  });


  // ------------------------
  // Security

  aedes.authenticate = (client, username, password, callback) => {
    log.debug('authenticate', client.id, username);
    // During ExecStartPre of each package, a random password is written
    // into it's private folder (only readable by that package and us). Using
    // this here for authentication.
    const parts = client.id.split('/');
    // We abuse the username field as a JSON formatted meta field
    client.meta = tryJSONParse(username);

    if (parts.length < 3) {
      callback({
        msg: `invalid client id ${client.id}, needs to be SCOPE/NAME/VERSION`});
    } else {
      const pkgName = parts.slice(0,2).join('/');
      log.debug('check password', pkgName);
      fs.readFile(`packages/${pkgName}/password`, (err, correctPassword) => {
        callback(err, !err && correctPassword && password
            && (password.toString('ascii') == correctPassword.toString('ascii'))
        )
      });
    }
  };

  aedes.authorizePublish = (client, packet, callback) => {
    // overwrite packet: force client to its namespace
    if (!packet.topic.startsWith('$SYS')) {
      const topic = ensureSlash(packet.topic);
      packet.topic = `${prefix}/${client.id}${topic}`;
    }
    callback(null)
  }

  aedes.authorizeSubscribe = (client, subscription, callback) => {
    // overwrite subscription: force client to its namespace
    if (!subscription.topic.startsWith('$SYS')) {
      const topic = ensureSlash(subscription.topic);
      subscription.topic = `${prefix}/${client.id}${topic}`;
    }
    callback(null, subscription);
  }

  /** using the special function we patched into aedes to also
  overwrite topic on unsubscribe, forcing client to its namespace */
  aedes.preUnsubscribe = (client, packet, callback) => {
    for (let i in packet.unsubscriptions) {
      !packet.unsubscriptions[i].startsWith(`${prefix}/${client.id}`) &&
        (packet.unsubscriptions[i] =
          `${prefix}/${client.id}/${packet.unsubscriptions[i]}`);
    }
    callback(client, packet);
  }

  return aedes;
};

module.exports = { startLocalMQTTBroker };
