import React, { useState, useEffect } from 'react';
import { Badge, Col, Row, Button, ListGroup, DropdownButton, Dropdown, Form,
    Accordion, Alert, Toast, Modal, OverlayTrigger, Tooltip } from 'react-bootstrap';
import Spinner from 'react-bootstrap/Spinner';

const _ = {
  map: require('lodash/map'),
  some: require('lodash/some'),
  forEach: require('lodash/forEach'),
  keyBy: require('lodash/keyBy'),
  filter: require('lodash/filter'),
  get: require('lodash/get'),
};

import { MdAdd } from 'react-icons/md';
import { FaExclamationTriangle } from "react-icons/fa";

import jsonLogic from '../src/utils/logic';
import { ActionLink } from '../src/utils/index';

import { useMqttSync, createWebComponent, decodeJWT, versionCompare,
    toFlatObject, getLogger, mqttClearRetained } from '@transitive-sdk/utils-web';

import { Heartbeat, heartbeatLevel, ensureProps, GetLogButtonWithCounter } from './shared';
import { ConfigEditor } from './config-editor';
import { ConfirmedButton } from '../src/utils/ConfirmedButton';
import { Fold } from '../src/utils/Fold';
import SelfCheck from './self-check';
import ResourceMetrics from './resource-metrics';

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
  },
  toast: {
    // position: 'absolute',
    // top: '1em',
    // right: '1em',
    margin: '1em',
    width: 'fit-content',
    backgroundColor: '#def'
  }
};

/** merge runningPackages and desiredPackages data for display */
const getMergedPackageInfo = (robotAgentData) => {
  if (!robotAgentData || !robotAgentData.status) {
    return {};
  }

  // log.debug(robotAgentData, toFlatObject(robotAgentData.status.runningPackages));

  const rtv = {};
  robotAgentData?.status?.runningPackages &&
    _.forEach(toFlatObject(robotAgentData.status.runningPackages),
      (fullVersion, name) => {
        if (fullVersion) {
          const [scope, pkgName, version] = name.slice(1).split('/');
          name = `${scope}/${pkgName}`;
          rtv[name] ||= {};
          rtv[name].running = rtv[name].running || {};
          rtv[name].running[version] = fullVersion;
        }
      });

  robotAgentData.desiredPackages &&
    _.forEach(toFlatObject(robotAgentData.desiredPackages), (version, name) => {
      name = name.slice(1); // remove initial slash
      rtv[name] ||= {};
      rtv[name].desired = version;
    });

  robotAgentData.disabledPackages &&
    _.forEach(toFlatObject(robotAgentData.disabledPackages), (value, name) => {
      name = name.slice(1); // remove initial slash
      rtv[name] ||= {};
      rtv[name].disabled = value;
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
  // log.debug('failsRequirements', info, requires, issues);
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
      {info.geo && <span>, {info.geo.city}, {info.geo.country}</span>}
    </Form.Text>
  </div>;

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

/** Price as displayed in package list */
const Price = ({price}) => <span style={{float: 'right', marginLeft: '2em'}}>
    {price?.perMonth ? `\$${price.perMonth}/month` : 'free'}
  </span>;

/** a package as shown in the install dropdown */
const Package = ({pkg, install, issues}) => {
  const {title, price} = pkg.versions?.[0].transitiverobotics;
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


const Capability = (props) => {

  const { mqttSync, running, desired, status, disabled, name, title,
    inactive, device, versionPrefix, desiredPackagesTopic,
    canPay, deviceData } = props;

  const uninstall = (pkgName) => {
    log.debug(`uninstalling ${pkgName}`);
    mqttSync.data.update(`${desiredPackagesTopic}/${pkgName}`, null);
  };

  const reinstall = (pkgName) => {
    log.debug(`reinstalling ${pkgName}`);
    mqttSync.data.update(`${desiredPackagesTopic}/${pkgName}`, '*');
    mqttSync.data.update(`${versionPrefix}/disabledPackages/${pkgName}`, null);
  };

  const runPkgCommand = (command, cb = log.debug) => {
    const topic = `${versionPrefix}/rpc/${command}`;
    log.debug('running package command', {command, topic, pkg: name});
    mqttSync.call(topic, {pkg: name}, cb);
  };

  return <Accordion.Item eventKey="0" key={name}>
    <Accordion.Body>
      <Row>
        <Col sm='3' style={styles.rowItem}>
          <div>{title}</div>
          <div style={styles.subText}>{name}</div>
        </Col>
        <Col sm='2' style={styles.rowItem}>
          { running && !inactive && <div><Badge bg="success"
                title={Object.values(running).join(', ')}>
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
          { disabled && <div><Badge bg="danger">
                disabled</Badge></div>
          }
        </Col>
        <Col sm='3' style={styles.rowItem}>
          {running && !inactive && (
            <ResourceMetrics 
              deviceData={deviceData}
              packageName={name}
            />
          )}
        </Col>
        <Col sm='3' style={styles.rowItem}>
          {!inactive && <div style={{textAlign: 'right'}}>
            {
              running && <Button variant='link'
                onClick={() => runPkgCommand('restartPackage')}>
                restart
              </Button>
            } {
              running && <Button variant='link'
                onClick={() => runPkgCommand('stopPackage')}>
                stop
              </Button>
            } {
              !running && <Button variant='link'
                onClick={() => runPkgCommand('startPackage')}>
                start
              </Button>
            } {
              !disabled && <span
                title={!desired ? 'pre-installed' : null}>
                <Button variant='link'
                  disabled={!desired}
                  onClick={() => uninstall(name)}>
                  uninstall
                </Button>
              </span>
            } {
              disabled && <span
                title={!canPay ? 'You need to add a payment method.' : null}>
                <Button variant='link'
                  disabled={!canPay}
                  onClick={() => reinstall(name)}>
                  reinstall
                </Button>
              </span>
            } {
              <GetLogButtonWithCounter
                text="get log"
                mqttSync={mqttSync}
                versionPrefix={versionPrefix}
                packageName={name}
              />
            }
          </div>}
        </Col>
      </Row>
    </Accordion.Body>
  </Accordion.Item>;
};


const MyToast = ({toast, onClose}) =>
  <Toast delay={5000} autohide={!toast?.spinner} style={styles.toast}
    onClose={onClose} show={Boolean(toast)} >
    <Toast.Header>
      <strong className="me-auto">{toast?.title}</strong>
      {toast?.spinner && <Spinner animation="border" size="sm" />}
    </Toast.Header>
    <Toast.Body>{toast?.body}</Toast.Body>
  </Toast>;

const explanation = `This will delete all meta data for this device. If the
  agent is still running, the device will come back but will require a
  restart of the agent in order to get back all meta data, such as the hostname.`;


/** Component showing the device from the robot-agent perspective */
const Device = (props) => {

  if (!ensureProps(props, ['jwt', 'id', 'host'])) {
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
  const [toast, setToast] = useState(null);

  const [availablePackages, setAvailablePackages] = useState([]);
  useEffect(() => {
      if (host === undefined) return;
      const cloudHost = `${ssl ? 'https' : 'http'}://data.${host}`;
      fetch(`${cloudHost}/@transitive-robotics/_robot-agent/availablePackages`)
        .then(result => result.json())
        .then(json => setAvailablePackages(_.keyBy(json, 'name')));
    }, [ssl, host]);

  useEffect(() => {
      if (mqttSync) {
        mqttSync.subscribe(`${prefix}/+/info/#`);
        mqttSync.subscribe(`${prefix}/+/status/heartbeat`);
        mqttSync.subscribe(`${prefix}/+/status/pong`);
        mqttSync.subscribe(`${prefix}/+/status/package/#`);
        mqttSync.subscribe(`${prefix}/+/status/runningPackages/#`);
        mqttSync.subscribe(`${prefix}/+/status/selfCheckErrors/#`);
        mqttSync.subscribe(`${prefix}/+/status/ready`);
        mqttSync.subscribe(`${prefix}/+/desiredPackages/#`);
        mqttSync.subscribe(`${prefix}/+/disabledPackages/#`);
        mqttSync.subscribe(`${prefix}/+/status/metrics`);
        mqttSync.publish(`${prefix}/+/desiredPackages`, {atomic: true});
        mqttSync.publish(`${prefix}/+/disabledPackages`, {atomic: true});
        mqttSync.publish(`${prefix}/+/client/#`); // for client pings
        
        mqttSync.subscribe(`${prefix}/+/status/metrics/#`);

        mqttSync.data.subscribePath(`${prefix}/+/status/pong`, ({ping, pong}) => {
          // received pong back from server for our ping:
          log.debug({ping, pong}, `round-trip: ${Date.now() - ping} ms`);
        });
      }}, [mqttSync]);

  const deviceData = data && data[id] && data[id][device] &&
    data[id][device]['@transitive-robotics']['_robot-agent'];

  if (!ready || !deviceData) return <StatusComponent />;

  const latestVersion = Object.keys(deviceData).sort(versionCompare).at(-1);
  const latestVersionData = deviceData[latestVersion];

  const inactive = Boolean(heartbeatLevel(latestVersionData.status?.heartbeat));

  // Pubishing under which-ever _robot-agent version we get talked to. A quirk
  // of how robot-agent works, since its robot-package and cloud code don't (yet)
  // colocate in code...
  const versionPrefix = `${prefix}/${latestVersion}`;

  const packages = getMergedPackageInfo(latestVersionData);
  const canBeInstalledPkgs = _.keyBy(
    _.filter(availablePackages, pkg => !packages[pkg.name]), 'name');

  const desiredPackagesTopic = `${versionPrefix}/desiredPackages`;

  /** add the named package to this robot's desired packages */
  const install = (pkg) => {
    log.debug(`installing ${pkg._id}`);
    mqttSync.data.update(`${desiredPackagesTopic}/${pkg._id}`, '*');
  };

  /* Run a command on the device, via RPC */
  const runCommand = (command, args, cb) => {
    const topic = `${versionPrefix}/rpc/${command}`;
    log.debug('running command', {command, topic, args});
    mqttSync.call(topic, args, cb);
  };

  const restartAgent = () => {
    // for now, send it both old and new way until all agents upgraded:
    // old:
    const topic = `${versionPrefix}/commands/restart`;
    log.debug('sending restart command', topic);
    mqttSync.mqtt.publish(topic, '1');
    // new:
    runCommand('restart', {}, log.debug);
  };

    /** remove the device from the dashboard (until it republishes status, if at
  all) */
  const clear = () => {
    // TODO: indicate progress/loading while waiting for callback, which depends
    // on getting a heartbeat from broker, which can take a while (~10 seconds)
    setToast({title: 'Please wait', body: `Removing ${device}`, spinner: true});
    mqttSync.clear([`/${id}/${device}`], () => {
      log.info('device removed');
      // redirect to fleet page if given, or to homepage otherwise
      location.href = props.fleetURL || '/';
    });
  };

  /** send a sequence of pings *not* via RPC */
  const ping = (count = 1) => {
    setTimeout(() => {
        if (count > 0) {
          mqttSync.data.update(`${versionPrefix}/client/ping`, Date.now());
          ping(count - 1);
        }
      }, 1000);
  };

  // Augment the `info` object with derived variables for testing requirements
  const info = latestVersionData?.info;
  // active ROS releases are those that are installed and permitted by the
  // current config to be sourced
  info && (info.activeRosReleases = !info.config?.global?.rosReleases
    ? info.rosReleases || [] // use all found releases
    : info.rosReleases?.filter(release =>
      info.config?.global?.rosReleases?.includes(release)) || []);

  const hasDisabled = Object.values(packages).some(p => p.disabled);

  // user has a way to pay for premium caps
  const canPay = session.has_payment_method || session.free
    || (session.balance < 0 && new Date(session.balanceExpires) > new Date());

  // latestVersionData?.$response?.commands &&
  //   _.map(latestVersionData.$response.commands, (response, command) =>
  //     // using console.log to get colors from escape sequences in output:
  //     console.log(response));

  log.debug({latestVersionData, packages, toast});

  return <div>
    <div style={styles.row}>
      <OSInfo info={latestVersionData?.info}/>
      {latestVersionData.status?.heartbeat &&
          <Heartbeat heartbeat={latestVersionData.status.heartbeat}/>
      } <span style={styles.agentVersion} title='Transitive agent version'>
        v{latestVersion}
      </span>&nbsp;&nbsp; <ActionLink disabled={inactive}
        onClick={() => runCommand('ping', {timestamp: Date.now()},
          (time) => setToast({ title: 'Pong!',
            body: `Server time: ${new Date(time)}`})
        )}
        onContextMenu={() => ping(10)} // hidden feature: right-click
      >
        Ping
      </ActionLink>&nbsp;&nbsp; <ActionLink onClick={restartAgent} disabled={inactive}>
        Restart agent
      </ActionLink>&nbsp;&nbsp; <ActionLink onClick={
          () => runCommand('stopAll', {}, log.debug)} disabled={inactive}>
        Stop all capabilities
      </ActionLink>&nbsp;&nbsp; <ConfirmedButton onClick={clear}
        explanation={explanation} question='Remove device?'>
        Remove device
      </ConfirmedButton>&nbsp;&nbsp; <GetLogButtonWithCounter
          text="Get log"
          mqttSync={mqttSync}
          versionPrefix={versionPrefix}
          packageName="robot-agent"
        />

      <Fold title="Configuration">
        <div style={styles.row}>
          {latestVersionData?.info?.config &&
            <ConfigEditor info={latestVersionData.info}
              updateConfig={
                (modifier) => runCommand('updateConfig', {modifier}, log.debug)
              }/>}
        </div>
      </Fold>
    </div>

    <SelfCheck data={latestVersionData} agentPrefix={versionPrefix} />

    {/* Resource metrics for robot-agent itself */}
    {!inactive && (
      <div style={styles.row}>
        <h5>Robot Agent Resource Usage</h5>
        <ResourceMetrics 
          deviceData={latestVersionData}
          packageName="robot-agent"
        />
      </div>
    )}

    <MyToast toast={toast} onClose={() => setToast(null)}/>


    <div style={styles.row}>
      <h5>Capabilities</h5>
      { hasDisabled && <Alert variant='danger'>
        <FaExclamationTriangle /> Some capabilities have been disabled because your free trial has expired.
        Please add a payment method in Billing and reinstall the capabilities.
      </Alert>}

      <Accordion defaultActiveKey={['0']} alwaysOpen>
        { Object.keys(packages).length > 0 ?
          mapSorted(packages, ({running, desired, status, disabled}, name) =>
            <Capability key={name} {...{
                mqttSync, desiredPackagesTopic, versionPrefix, device,
                running, desired, status, disabled, inactive,
                name, title: getPkgTitle(name, availablePackages),
                canPay, deviceData: latestVersionData
              }} />
          ) :
          <ListGroup.Item>No capabilities added yet.</ListGroup.Item>
        }

        {/* Fold-out for adding capabilities */}
        { latestVersionData.status?.ready ? <F>
            <Accordion.Item eventKey="1">
              <Accordion.Header><MdAdd/> Add Capabilities</Accordion.Header>
            </Accordion.Item>
            {mapSorted(canBeInstalledPkgs, pkg => {
                const issues = failsRequirements(info, pkg);

                const price = pkg.versions?.[0].transitiverobotics?.price;
                if (price && !canPay) {
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
  </div>
};


createWebComponent(Device, 'robot-agent-device');