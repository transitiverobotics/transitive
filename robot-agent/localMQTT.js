/**
  Local part of MQTT bridge (using Aedes)
*/

const fs = require('fs');

const persistence = require('aedes-persistence')();
// var NedbPersistence = require('aedes-persistence-nedb');
// var persistence = new NedbPersistence({
//   path: './db',     // defaults to './data',
//   prefix: 'mqtt'    // defaults to ''
// });
const Aedes = require('aedes');
const { DataCache } = require('@transitive-robotics/utils/server');

const PORT = 1883;


// subscription options for upstream client: required to see the retain flag
const subOptions = {rap: true};

/** Start the local mqtt broker. upstreamClient is the upstream mqtt client */
const startLocalMQTTBroker = (upstreamClient, prefix) => {

  const aedes = Aedes({persistence});

  const server = require('net').createServer(aedes.handle);
  console.log('prefix =', prefix);

  server.listen(PORT, () => {
    console.log('mqtt server bound');
  });

  aedes.on('publish', (packet, client) => {
    if (!packet.topic.startsWith('$SYS') && client && upstreamClient) {
      console.log('publish up', packet.topic, packet.payload.toString('utf-8'),
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
      console.log(client && client.id, 'wants', subscription);
      if (client && upstreamClient) {
        upstreamClient.subscribe(subscription.topic, subOptions); // TODO: also relay QoS
      }

      // Do we(?) also need to somehow publish back to client any retained messages
      // we already have (e.g., from that client connecting and subscribing earlier!)
      // use DataCache for all retained messages? Test with video-streaming/video_source.
      // const retained = persistence.createRetainedStreamCombi(subscription.topic);
      // // // NOTE: retained is a https://www.npmjs.com/package/from2 stream
      // retained.on('retained data', (data) => console.log({data}));
      // retained.resume();
      // I think we don't. This was a rabbit hole when debugging wrong order of
      // connecting upstream, subscribing (by packages), clearing, and starting
      // local broker. Working now.

    });
  });

  aedes.on('unsubscribe', (subscriptions, client) => {
    subscriptions.forEach(subscription => {
      console.log(client && client.id, 'is unsubscribing from', subscription);
      if (client && upstreamClient) {
        upstreamClient.unsubscribe(subscription, console.log);
      }

      // #HERE we also need to somehow delete the retained messages for this
      // topic in the aedes cache; This is because while we are unsubscribed
      // a "clear" (null) message may be sent that we won't receive and hence
      // won't clear our retained message
      persistence.cleanSubscriptions(client.id, console.log);
      // this doesn't seem sufficient
    });
  });


  // ------------------------
  // Security

  aedes.authenticate = (client, username, password, callback) => {
    console.log('authenticate', client.id);
    // During ExecStartPre of each package, a random password is written
    // into it's private folder (only readable by that package and us). Using
    // this here for authentication.
    fs.readFile(`packages/${client.id}/password`, (err, correctPassword) => {
      callback(err, !err && correctPassword && password
          && (password.toString('ascii') == correctPassword.toString('ascii'))
      )
    });
  };

  aedes.authorizePublish = (client, packet, callback) => {
    // console.log('authorizePublish', client.id, packet.topic);
    // overwrite packet: force client to its namespace
    packet.topic = `${prefix}/${client.id}/${packet.topic}`;
    callback(null)
  }

  aedes.authorizeSubscribe = (client, subscription, callback) => {
    // overwrite subscription: force client to its namespace
    subscription.topic = `${prefix}/${client.id}/${subscription.topic}`;
    callback(null, subscription);
  }

  /** using the special function we patched into aedes to also
  overwrite topic on unsubscribe, forcing client to its namespace */
  aedes.preUnsubscribe = (client, packet, callback) => {
    for (let i in packet.unsubscriptions) {
      // console.log('preUnsubscribe', client.id);
      !packet.unsubscriptions[i].startsWith(`${prefix}/${client.id}`) &&
        (packet.unsubscriptions[i] = `${prefix}/${client.id}/${packet.unsubscriptions[i]}`);
    }
    callback(client, packet);
  }

  aedes.authorizeForward = function (client, packet) {
    console.log('authorizeForward', packet.topic, packet.retain);
    return packet;
  }

  return aedes;
};

module.exports = { startLocalMQTTBroker };
