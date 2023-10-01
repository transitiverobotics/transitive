import React, { useState, useEffect } from 'react';
import { Badge, Col, Row, Button, ListGroup, DropdownButton, Dropdown, Form,
    Modal, Accordion, Spinner } from 'react-bootstrap';

const _ = {
  map: require('lodash/map'),
  some: require('lodash/some'),
  forEach: require('lodash/forEach'),
  keyBy: require('lodash/keyBy'),
  filter: require('lodash/filter'),
};

import pako from 'pako';
import { MdAdd } from 'react-icons/md';

import jsonLogic from '../src/utils/logic';
import { ActionLink } from '../src/utils/index';

import { useMqttSync, createWebComponent, decodeJWT, versionCompare,
    toFlatObject, getLogger, mqttClearRetained } from '@transitive-sdk/utils-web';

import { Heartbeat, heartbeatLevel, ensureProps } from './shared';
import { ConfigEditor } from './config-editor';
import { ConfirmedButton } from '../src/utils/ConfirmedButton';
import { Fold } from '../src/utils/Fold';

const F = React.Fragment;

const log = getLogger('robot-agent-device');
log.setLevel('debug');

// extend jsonLogic with new operator for array size
jsonLogic.add_operation("$size", (a) => a?.length);

const styles = {
  row: {
    marginBottom: '2em'
  },
  agentVersion: {
    fontSize: 'smaller'
  },
  rowItem: {
    display: 'flex',
    justifyContent: 'center',
    flexDirection: 'column',
  },
  subText: {
    color: '#999',
    fontSize: 'small'
  },
  addList: {
    transition: 'height 1s ease'
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
        rtv[name] ||= {};
        rtv[name].running = rtv[name].running || {};
        rtv[name].running[version] = 1;
      }
    });

  robotAgentData.desiredPackages &&
    _.forEach(toFlatObject(robotAgentData.desiredPackages), (version, name) => {
      name = name.slice(1); // remove initial slash
      rtv[name] ||= {};
      rtv[name].desired = version;
    });

  robotAgentData?.status?.package &&
    _.forEach(toFlatObject(robotAgentData.status.package), (status, name) => {
      if (status) {
        const [scope, pkgName] = name.slice(1).split('/');
        name = `${scope}/${pkgName}`;
        rtv[name] ||= {};
        rtv[name].status = status;
      }
    });

  return rtv;
};

/** check whether the given device info (from mqtt) meet the given pkg's
(json from npm registry) requirements if any. If it fails, will return a list
of human-readable issues. */
const failsRequirements = (info, pkg) => {
  const requires = pkg.versions?.[0].transitiverobotics?.requires;
  if (!requires) return [];

  const issues = requires.map( req =>
      !jsonLogic.apply(req.rule, info) && req.message
    ).filter(Boolean);
  log.debug('failsRequirements', info, requires, issues);
  return issues;
};

/** display info from OS */
const OSInfo = ({info}) => !info ? <div></div> :
  <div>
    Device
    <h3>{info.os.hostname}</h3>
    <div>
      {info.labels?.map(label =>
          <span key={label}>{' '}<Badge bg="secondary">{label}</Badge></span>)
      }
    </div>
    <Form.Text>
      {info.os.dpkgArch}, {info.os.lsb?.Description}
    </Form.Text>
  </div>;

/** given a compressed base64 buffer, convert and decompress */
const decompress = (zippedBase64) => {
  const buf = Uint8Array.from(atob(zippedBase64), c => c.charCodeAt(0));
  return pako.ungzip(buf, {to: 'string'});
};

/** given a package name, get it's human-readable title, e.g.,
@transitive-robotics/remote-teleop => Remote Teleop
*/
const getPkgTitle = (name, allPackges) => {
  const pkg = allPackges[name];
  return pkg?.versions[0].transitiverobotics.title;
};

/** Given an object, map each item using fn, in lexicographic order of keys */
const mapSorted = (obj, fn) =>
  Object.keys(obj).sort().map(key => fn(obj[key], key));

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

/** Price as displayed in package list */
const Price = ({price}) => <span style={{float: 'right', marginLeft: '2em'}}>
    {price?.perMonth ? `\$${price.perMonth}/month` : 'free'}
  </span>;

/** a package as shown in the install dropdown */
const Package = ({pkg, install, issues}) => {
  const {title, price} = pkg.versions?.[0].transitiverobotics;
  log.debug({issues});
  const host = location.host.replace('portal.', '');

  return <Row>
    <Col sm='4' style={styles.rowItem}>
      {title} <span
        style={{ opacity: 0.5, fontSize: 'small' }}>{pkg._id} v{pkg.version}</span>
    </Col>
    <Col sm='2' style={styles.rowItem}>
      <a href={`//${host}/caps/${pkg.name.slice(1)}`}>
        Details
      </a>
    </Col>
    <Col sm='2' style={styles.rowItem}>
      <Price price={price} />
    </Col>
    <Col sm='4' style={styles.rowItem}>
      <Button variant="outline-primary"
        onClick={() => install(pkg)}
        disabled={issues.length > 0}>
        Add
      </Button>
      {issues.length > 0 && issues.map((message, i) =>
        <Form.Text key={i}>{message}</Form.Text>)}
    </Col>
  </Row>;
};


/** Component showing the device from the robot-agent perspective */
const Device = (props) => {

  if (!ensureProps(props, ['jwt', 'id', 'host'])) {
    log.debug({props})
    return <div>missing props</div>;
  }
  const {jwt, id, host} = props;
  const ssl = props.ssl && JSON.parse(props.ssl);
  const session = props.session && JSON.parse(props.session);

  const {mqttSync, data, status, ready, StatusComponent} = useMqttSync({jwt, id,
    mqttUrl: `${ssl ? 'wss' : 'ws'}://mqtt.${host}`});
  const {device} = decodeJWT(jwt);
  const prefix = `/${id}/${device}/@transitive-robotics/_robot-agent`;

  const [showAdd, setShowAdd] = useState(false);

  const [availablePackages, setAvailablePackages] = useState([]);
  useEffect(() => {
      if (host === undefined) return;
      const cloudHost = `${ssl ? 'https' : 'http'}://data.${host}`;
      fetch(`${cloudHost}/@transitive-robotics/_robot-agent/availablePackages`)
        .then(result => result.json())
        .then(json => setAvailablePackages(_.keyBy(json, 'name')));
    }, [ssl, host]);
  log.debug({availablePackages});

  useEffect(() => {
      if (mqttSync) {
        mqttSync.subscribe(`${prefix}/+`); // TODO: narrow this
        log.debug('adding publish', `${prefix}/+/desiredPackages`);
        mqttSync.publish(`${prefix}/+/desiredPackages`, {atomic: true});
      }}, [mqttSync]);

  log.debug('data', data);
  const deviceData = data && data[id] && data[id][device] &&
    data[id][device]['@transitive-robotics']['_robot-agent'];

  if (!ready || !deviceData) return <StatusComponent />;

  const latestVersion = Object.keys(deviceData).sort(versionCompare).at(-1);
  const latestVersionData = deviceData[latestVersion];
  log.debug(latestVersionData);

  const inactive = Boolean(heartbeatLevel(latestVersionData.status?.heartbeat));

  // Pubishing under which-ever _robot-agent version we get talked to. A quirk
  // of how robot-agent works, since its robot-package and cloud code don't (yet)
  // colocate in code...
  const versionPrefix = `${prefix}/${latestVersion}`;

  const packages = getMergedPackageInfo(latestVersionData);
  const canBeInstalledPkgs = _.keyBy(
    _.filter(availablePackages, pkg => !packages[pkg.name]), 'name');
  log.debug({availablePackages, packages, canBeInstalledPkgs});

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

  const updateConfig = (modifier) => {
    log.debug('updating config:', modifier);
    mqttSync.mqtt.publish(`${versionPrefix}/commands/updateConfig`,
      JSON.stringify(modifier));
  };

  /** remove the device from the dashboard (until it republishes status, if at
  all) */
  const clear = () => {
    // TODO: indicate progress/loading while waiting for callback, which depends
    // on getting a heartbeat from broker, which can take a while (~10 seconds)
    mqttSync.clear([`/${id}/${device}`], () => {
      log.info('device removed');
      // redirect to fleet page if given, or to homepage otherwise
      location.href = props.fleetURL || '/';
    });
  };

  const explanation = `This will delete all meta data for this device. If the
    agent is still running, the device will come back but will require a
    restart of the agent in order to get back all meta data, such as the hostname.`;

  // Augment the `info` object with derived variables for testing requirements
  const info = latestVersionData?.info;
  // active ROS releases are those that are installed and permitted by the
  // current config to be sourced
  info && (info.activeRosReleases = !info.config.global?.rosReleases
      ? info.rosReleases // use all found releases
      : info.rosReleases.filter(release =>
        info.config.global.rosReleases.includes(release))
  );

  return <div>
    <div style={styles.row}>
      <OSInfo info={latestVersionData?.info}/>
      {latestVersionData.status?.heartbeat &&
          <Heartbeat heartbeat={latestVersionData.status.heartbeat}/>
      } <span style={styles.agentVersion} title='Transitive agent version'>
        v{latestVersion}
      </span>&nbsp;&nbsp; <ActionLink onClick={restartAgent} disabled={inactive}>
        Restart agent
      </ActionLink>&nbsp;&nbsp; <ActionLink onClick={stopAll} disabled={inactive}>
        Stop all capabilities
      </ActionLink>&nbsp;&nbsp; <ConfirmedButton onClick={clear}
        explanation={explanation} question='Remove device?'>
        Remove device
      </ConfirmedButton>
    </div>

    <div style={styles.row}>
      <h5>Configuration</h5>
      {latestVersionData?.info?.config && <ConfigEditor
        info={latestVersionData.info} updateConfig={updateConfig}/>}
    </div>

    <div style={styles.row}>
      <h5>Capabilities</h5>
      <Accordion defaultActiveKey={['0']} alwaysOpen>
        { Object.keys(packages).length > 0 ?
          mapSorted(packages, ({running, desired, status}, name) =>
            <Accordion.Item eventKey="0" key={name}>
              <Accordion.Body>
                <Row>
                  <Col sm='4' style={styles.rowItem}>
                    <div>{getPkgTitle(name, availablePackages)}</div>
                    <div style={styles.subText}>{name}</div>
                  </Col>
                  <Col sm='3' style={styles.rowItem}>
                    { running && !inactive && <div><Badge bg="success">
                          running: v{Object.keys(running).join(', ')}
                        </Badge>
                        <Button variant='link' href={`/device/${device}/${name}`}>
                          view
                        </Button>
                      </div>
                    }
                    { running && inactive && <div><Badge bg="secondary">
                          installed: v{Object.keys(running).join(', ')}
                        </Badge></div>
                    }
                    { !running && status && <div><Badge bg="info">
                          {status}</Badge></div>
                    }
                  </Col>
                  <Col sm='5' style={styles.rowItem}>
                    {!inactive &&
                        <div style={{textAlign: 'right'}}>
                          {
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
                            <span title={!desired ? 'pre-installed' : null}>
                              <Button variant='link'
                                disabled={!desired}
                                onClick={() => uninstall(name)}>
                                uninstall
                              </Button>
                            </span>
                          } {
                            <Button variant='link' onClick={() => getPackageLog(name)}>
                              get log
                            </Button>
                          }
                        </div>
                    }
                  </Col>
                </Row>
              </Accordion.Body>
            </Accordion.Item>
          ) :

          <ListGroup.Item>No capabilities added yet.</ListGroup.Item>
        }

        {/* Fold-out for adding more */}

        { latestVersionData.status?.ready ? <F>
            <Accordion.Item eventKey="1">
              <Accordion.Header><MdAdd/> Add Capabilities</Accordion.Header>
            </Accordion.Item>
            {mapSorted(canBeInstalledPkgs, pkg => {
                const issues = failsRequirements(info, pkg);

                const price = pkg.versions?.[0].transitiverobotics?.price;
                if (price && !session.has_payment_method && !session.free
                    && !(session.balance < 0 &&
                      new Date(session.balanceExpires) > new Date())
                ) {
                  issues.push('Please add a payment method in Billing.');
                }

                return <Accordion.Item eventKey="1" key={pkg._id}>
                  <Accordion.Body>
                    <Package {...{pkg, install, issues}} />
                  </Accordion.Body>
                </Accordion.Item>
              })
            }
          </F>
          : !inactive && <Accordion.Item eventKey="0">
            <Accordion.Body><Spinner animation="border" size="sm"
                /> Waiting for agent getting ready.</Accordion.Body>
          </Accordion.Item>
        }
      </Accordion>
    </div>

    {latestVersionData.$response?.commands?.getPkgLog &&
        <PkgLog response={latestVersionData.$response?.commands?.getPkgLog}
          onHide={clearPackageLog}/>
    }
  </div>
};


createWebComponent(Device, 'robot-agent-device', []);
