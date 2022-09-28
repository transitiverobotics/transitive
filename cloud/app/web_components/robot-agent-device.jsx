import React, { useState, useEffect } from 'react';
import { Badge, Col, Row, Button, ListGroup, DropdownButton, Dropdown, Form, Modal }
from 'react-bootstrap';

const _ = {
  map: require('lodash/map'),
  some: require('lodash/some'),
  forEach: require('lodash/forEach'),
};

import pako from 'pako';

import { useMqttSync, createWebComponent, decodeJWT, versionCompare,
mqttTopicMatch, toFlatObject, getLogger, mqttClearRetained, pathMatch }
from '@transitive-sdk/utils-web';

import { Heartbeat, ensureProps } from './shared';
import { ConfirmedButton } from '../src/utils/ConfirmedButton';

const log = getLogger('robot-agent-device');

const styles = {
  row: {
    marginBottom: '2em'
  },
  agentVersion: {
    fontSize: 'smaller'
  }
};

/** merge runningPackages and desiredPackages data for display */
const getMergedPackageInfo = (robotAgentData) => {
  if (!robotAgentData || !robotAgentData.status) {
    return {};
  }

  log.debug(robotAgentData, toFlatObject(robotAgentData.status.runningPackages));

  const rtv = {};
  robotAgentData?.status?.runningPackages &&
    _.forEach(toFlatObject(robotAgentData.status.runningPackages), (running, name) => {
      if (running) {
        const [scope, pkgName, version] = name.slice(1).split('/');
        name = `${scope}/${pkgName}`;
        rtv[name] = rtv[name] || {};
        rtv[name].running = rtv[name].running || {};
        rtv[name].running[version] = 1;
      }
    });

  robotAgentData.desiredPackages &&
    _.forEach(toFlatObject(robotAgentData.desiredPackages), (version, name) => {
      name = name.slice(1); // remove initial slash
      rtv[name] = rtv[name] || {};
      rtv[name].desired = version;
    });

  return rtv;
};


/** parse lsb_release info, e.g.,
'LSB Version:\tcore-11.1.0ubuntu2-noarch:security-11.1.0ubuntu2-noarch\nDistributor ID:\tUbuntu\nDescription:\tUbuntu 20.04.3 LTS\nRelease:\t20.04\nCodename:\tfocal'
*/
const parseLsbRelease = (string) => {
  const lines = string.split('\n');
  const rtv = {};
  lines.forEach(line => {
    const [field, value] = line.split('\t');
    // drop colon of field name, then add to rtv
    rtv[field.slice(0, -1)] = value;
  });
  return rtv;
};

/** display info from OS */
const OSInfo = ({info}) => !info ? <div></div> :
  <div>
    Device
    <h3>{info.os.hostname}</h3>
    <div>
      {info.labels?.map(label =>
          <span key={label}>{' '}<Badge bg="info">{label}</Badge></span>)
      }
    </div>
    <Form.Text>
      {info.os.dpkgArch}, {parseLsbRelease(info.os.lsb_release)?.Description}
    </Form.Text>
  </div>;

/** given a compressed base64 buffer, convert and decompress */
const decompress = (zippedBase64) => {
  const buf = Uint8Array.from(atob(zippedBase64), c => c.charCodeAt(0));
  return pako.ungzip(buf, {to: 'string'});
}

/** Component that renders the package log response, such as
{
  "@transitive-robotics": {
    "webrtc-video": {
      "err": null,
      "stdout": [base64 encoded gzip buffer of text],
      "stderr": [base64 encoded gzip buffer of text],
    }
  }
}
*/
const PkgLog = ({response, onHide}) => {
  const scope = Object.keys(response)[0];
  const cap = Object.values(response)[0];
  const capName = Object.keys(cap)[0];
  const result = Object.values(cap)[0];
  const stdout = decompress(result.stdout);
  const stderr = decompress(result.stderr);

  return <Modal show={true} fullscreen={true} onHide={onHide} >
    <Modal.Header closeButton>
      <Modal.Title>Package Log for {scope}/{capName}</Modal.Title>
    </Modal.Header>
    <Modal.Body>
      {stdout ? <pre>{stdout}</pre> : <div>stdout is empty</div>}
      {stderr ? <pre style={{color: 'red'}}>{stderr}</pre> : <div>stderr is empty</div>}
    </Modal.Body>
  </Modal>;
}

/** Component showing the device from the robot-agent perspective */
const Device = (props) => {

  if (!ensureProps(props, ['jwt', 'id', 'host'])) {
    log.debug({props})
    return <div>missing props</div>;
  }
  const {jwt, id, host} = props;
  const ssl = props.ssl && JSON.parse(props.ssl);

  const {mqttSync, data, status, ready, StatusComponent} = useMqttSync({jwt, id,
    mqttUrl: `${ssl ? 'wss' : 'ws'}://mqtt.${host}`});
  const {device} = decodeJWT(jwt);
  const prefix = `/${id}/${device}/@transitive-robotics/_robot-agent`;

  const [availablePackages, setAvailablePackages] = useState([]);
  useEffect(() => {
      if (host === undefined) return;
      const cloudHost = `${ssl ? 'https' : 'http'}://data.${host}`;
      fetch(`${cloudHost}/@transitive-robotics/_robot-agent/availablePackages`)
        .then(result => result.json())
        .then(json => setAvailablePackages(json));
    }, [ssl, host]);

  useEffect(() => {
      if (mqttSync) {
        mqttSync.subscribe(`${prefix}/+`); // TODO: narrow this
        log.debug('adding publish', `${prefix}/+/desiredPackages`);
        mqttSync.publish(`${prefix}/+/desiredPackages`, {atomic: true});

        // mqttSync.mqtt.on('message', (topic, payload, packet) => {
        //   if (pathMatch(`${prefix}/+/$response/#`, topic)) {
        //     if (pathMatch(`${prefix}/+/$response/commands/getPkgLog/#`, topic)) {
        //       const results = JSON.parse(payload.toString());
        //       const stdout = decompress(results.stdout);
        //       const stderr = decompress(results.stdout);
        //       log.info(`Got response for ${topic}:`, {stdout, stderr});
        //     } else {
        //       log.info(`Got unhandled response for ${topic}:`, payload?.toString());
        //     }
        //   }
        // });
      }}, [mqttSync]);

  log.debug('data', data);
  const deviceData = data && data[id] && data[id][device] &&
    data[id][device]['@transitive-robotics']['_robot-agent'];

  if (!ready || !deviceData) return <StatusComponent />;

  const latestVersion = Object.keys(deviceData).sort(versionCompare).at(-1);
  const latestVersionData = deviceData[latestVersion];
  log.debug(latestVersionData);

  // Pubishing under which-ever _robot-agent version we get talked to. A quirk
  // of how robot-agent works, since its robot-package and cloud code don't (yet)
  // colocate in code...
  const versionPrefix = `${prefix}/${latestVersion}`;

  const packages = getMergedPackageInfo(latestVersionData);

  const desiredPackagesTopic = `${versionPrefix}/desiredPackages`;

  /** add the named package to this robot's desired packages */
  const install = (pkg) => {
    log.debug(`installing ${pkg._id}`);
    mqttSync.data.update(`${desiredPackagesTopic}/${pkg._id}`, '*');
  };

  const uninstall = (pkgName) => {
    log.debug(`uninstalling ${pkgName}`);
    mqttSync.data.update(`${desiredPackagesTopic}/${pkgName}`, null);
  };

  const restartAgent = () => {
    const topic = `${versionPrefix}/commands/restart`;
    log.debug('sending restart command', topic);
    mqttSync.mqtt.publish(topic, '1');
  };

  const restartPackage = (name) => {
    log.debug('sending command to restart package', name);
    mqttSync.mqtt.publish(`${versionPrefix}/commands/restartPackage/${name}`, '1');
  };

  const stopAll = () => {
    log.debug('sending command to stop all packages');
    mqttSync.mqtt.publish(`${versionPrefix}/commands/stopAll`, '1');
  };

  const stopPackage = (name) => {
    log.debug('sending command to stop package', name);
    mqttSync.mqtt.publish(`${versionPrefix}/commands/stopPackage/${name}`, '1');
  };

  const getPackageLog = (name) => {
    log.debug('getting package log for', name);
    mqttSync.mqtt.publish(`${versionPrefix}/commands/getPkgLog/${name}`, '1');
  };

  /** remove the package log (reponse) from the data */
  const clearPackageLog = () => {
    mqttSync.data.forMatch(`${prefix}/+/$response/commands/getPkgLog/#`,
      (obj, path) => {
        log.debug('clearing', path);
        mqttSync.data.update(path, null);
      });
  };

  /** remove the device from the dashboard (until it republishes status, if at
  all) */
  const clear = () => {
    // TODO: indicate progress/loading while waiting for callback, which depends
    // on getting a heartbeat from broker, which can take a while (~10 seconds)
    mqttSync.clear([prefix], () => {
      log.info('device removed');
      // redirect to fleet page if given, or to homepage otherwise
      location.href = props.fleetURL || '/';
    });
  };

  const explanation = `This will delete all meta-data for this device. If the
    agent is still running, the device will come back but will require a
    restart of the agent in order to get back all meta-data, such as the hostname.`;

  return <div>
    <div style={styles.row}>
      <OSInfo info={latestVersionData?.info}/>
      {latestVersionData.status?.heartbeat &&
        <Heartbeat heartbeat={latestVersionData.status.heartbeat}/>
      } <span style={styles.agentVersion} title='Transitive agent version'>
        v{latestVersion}
      </span>
    </div>

    <div style={styles.row}>
      <Button onClick={restartAgent} variant='outline-warning'>
        Restart agent
      </Button>
      <Button onClick={stopAll} variant='outline-warning'>
        Stop all capabilities
      </Button>
      <ConfirmedButton onClick={clear} variant='outline-secondary'
        explanation={explanation}>
        Remove device
      </ConfirmedButton>
    </div>

    <div style={styles.row}>
      <h5>Capabilities</h5>
      <ListGroup>
        { Object.keys(packages).length > 0 ?
          _.map(packages, ({running, desired}, name) => <ListGroup.Item key={name}>
            {name} {
              running && <Badge bg="success">
                running: v{Object.keys(running).join(', ')}
              </Badge>
            } {
              running && <Button variant='link' href={`/device/${device}/${name}`}>
                view
              </Button>
            } {
              running && <Button variant='link'
                onClick={() => restartPackage(name)}>
                restart
              </Button>
            } {
              running && <Button variant='link'
                onClick={() => stopPackage(name)}>
                stop
              </Button>
            } {
              desired ? <Button variant='link' onClick={() => uninstall(name)}>
                uninstall
              </Button> :
              <span>pre-installed</span>
            } {
              <Button variant='link' onClick={() => getPackageLog(name)}>
                get log
              </Button>
            }
          </ListGroup.Item>) :

          <ListGroup.Item>No capabilities running.</ListGroup.Item>
        }

        <ListGroup.Item>
          <DropdownButton title="Install capabilities" variant='link'>
            {availablePackages.map(pkg => <Dropdown.Item
                key={pkg._id}
                onClick={() => install(pkg)}>
                {pkg.versions[0].transitiverobotics.title} ({pkg.version})
              </Dropdown.Item>)
            }
          </DropdownButton>
        </ListGroup.Item>
      </ListGroup>
    </div>

    {latestVersionData.$response?.commands?.getPkgLog &&
        <PkgLog response={latestVersionData.$response?.commands?.getPkgLog}
          onHide={clearPackageLog}/>
    }

  </div>
};


createWebComponent(Device, 'robot-agent-device', []);
