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
import { FaEllipsisH, FaExclamationTriangle } from "react-icons/fa";

import jsonLogic from '../src/utils/logic';
import { ActionLink } from '../src/utils/index';

import { useMqttSync, createWebComponent, decodeJWT, versionCompare,
    toFlatObject, getLogger, mqttClearRetained } from '@transitive-sdk/utils-web';

import { Heartbeat, heartbeatLevel, ensureProps, LogButtonWithCounter } from './shared';
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

  // log.debug('robotAgentData', robotAgentData, toFlatObject(robotAgentData.status.runningPackages));

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
  robotAgentData?.info?.config?.global?.desiredPackages &&
    _.forEach(robotAgentData.info.config.global.desiredPackages,
      (name) => {
        rtv[name] ||= {};
        rtv[name].preInstalled = true;
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
      {info.isDocker && <span> (Docker)</span>}
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

/** Reusable error badge */
const ErrorBadge = ({errorCount}) =>
  errorCount > 0 &&
    <Badge pill bg='danger' className='position-absolute ms-1'
      style={{ fontSize: '0.5em' }}
      title={`There are ${errorCount} errors.`}>
      {errorCount}
    </Badge>;


/** Get the right status badge for a capability based on its status */
const StatusBadge = ({running, inactive, status, disabled}) =>
  (running && !inactive ?
    <Badge bg="success" title={Object.values(running).join(', ')}>
      running: v{Object.keys(running).join(', ')}
    </Badge>
    : running && inactive ?
    <Badge bg="secondary">installed: v{Object.keys(running).join(', ')}</Badge>
    : !running && status ? <Badge bg="info">{status}</Badge>
    : disabled ? <Badge bg="danger">disabled</Badge>
    : <Badge bg="dark">stopped</Badge>
  );

const Capability = (props) => {

  const { mqttSync, running, desired, status, disabled, name, title,
    inactive, device, versionPrefix, desiredPackagesTopic, canPay,
    deviceData, preInstalled
  } = props;

  const [pkgScope, pkgName] = name.split('/');

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

  const errorCount = deviceData?.status?.logs?.errorCount?.[pkgScope]?.[pkgName] || 0;

  return <Accordion.Item eventKey="0" key={name}>
    <Accordion.Body>
      <Row style={{position: 'relative'}}>
        <Col sm='5' style={styles.rowItem}>
          {running && !inactive ?
            <a href={`/device/${device}/${name}`}>
              <div>{title}</div>
              <div style={styles.subText}>{name}</div>
            </a> :
            <F>
              <div>{title}</div>
              <div style={styles.subText}>{name}</div>
            </F>
          }
        </Col>
        <Col sm='3' style={styles.rowItem}>
          <div><StatusBadge {...{running, inactive, status, disabled}} /></div>
        </Col>
        <Col sm='2' style={styles.rowItem}>
          {running && !inactive && (
            <ResourceMetrics
              label='CPU'
              title='CPU usage by this capability'
              color='#3498db'
              data={deviceData?.status?.metrics?.packages?.[name]}
            />
          )}
        </Col>
        <Col sm='2' style={styles.rowItem}>
          {!inactive &&
            <Dropdown className={`position-absolute top-0 end-0 me-2 `}>
              <Dropdown.Toggle variant='link' size='sm' bsPrefix='_'>
                <FaEllipsisH style={{ color: '#000' }}/>
                <ErrorBadge errorCount={errorCount} />
              </Dropdown.Toggle>
              <Dropdown.Menu>
                {
                  running && <Dropdown.Item as='button' variant='link'
                    onClick={() => runPkgCommand('restartPackage')}>
                    restart
                  </Dropdown.Item>
                } {
                  running && <Dropdown.Item as='button' variant='link'
                    onClick={() => runPkgCommand('stopPackage')}>
                    stop
                  </Dropdown.Item>
                } {
                  !running && <Dropdown.Item as='button' variant='link'
                    onClick={() => runPkgCommand('startPackage')}>
                    start
                  </Dropdown.Item>
                } {
                  !disabled && <Dropdown.Item as='button' variant='link'
                      disabled={preInstalled || !desired}
                      onClick={() => uninstall(name)}>
                        uninstall
                        {(preInstalled || !desired) &&
                          <Form.Text muted className='d-block'>
                            pre-installed
                          </Form.Text>
                        }
                    </Dropdown.Item>
                } {
                  disabled && <Dropdown.Item as='button' variant='link'
                      disabled={!canPay}
                      onClick={() => reinstall(name)}>
                      reinstall
                      {!canPay && <Form.Text muted className='d-block'>
                        You need to add a payment method
                      </Form.Text>}
                    </Dropdown.Item>
                }
                <LogButtonWithCounter
                  text="get log"
                  mqttSync={mqttSync}
                  versionPrefix={versionPrefix}
                  packageName={name}
                  errorCount={errorCount}
                  as={Dropdown.Item}
                />
              </Dropdown.Menu>
            </Dropdown>}
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
        // mqttSync.subscribe(`${prefix}/+`); // TODO: narrow this
        // Since the robot now publishes non-JSON data on /status/log/live, we
        // need to make sure not to subscribe to that topic with MqttSync, to
        // avoid trying to parse that data. See
        // https://github.com/transitiverobotics/transitive-utils/commit/5205e0c
        mqttSync.subscribe(`${prefix}/+/info/#`);
        mqttSync.subscribe(`${prefix}/+/status/heartbeat`);
        mqttSync.subscribe(`${prefix}/+/status/pong`);
        mqttSync.subscribe(`${prefix}/+/status/package/#`);
        mqttSync.subscribe(`${prefix}/+/status/runningPackages/#`);
        mqttSync.subscribe(`${prefix}/+/status/selfCheckErrors/#`);
        mqttSync.subscribe(`${prefix}/+/status/ready`);
        mqttSync.subscribe(`${prefix}/+/desiredPackages/#`);
        mqttSync.subscribe(`${prefix}/+/disabledPackages/#`);

        mqttSync.publish(`${prefix}/+/desiredPackages`, {atomic: true});
        mqttSync.publish(`${prefix}/+/disabledPackages`, {atomic: true});
        mqttSync.publish(`${prefix}/+/client/#`); // for client pings

        mqttSync.subscribe(`${prefix}/+/status/metrics/#`);
        mqttSync.subscribe(`${prefix}/+/status/logs/errorCount`);

        mqttSync.data.subscribePath(`${prefix}/+/status/pong`, value => {
          if (!value) return; // was a reset
          const {ping, pong} = value;
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

  const errorCount = latestVersionData?.status?.logs
    ?.errorCount?.['@transitive-robotics']?.['robot-agent'] || 0;
  log.debug({latestVersionData, packages, toast});

  return <div>
    <div style={styles.row} className='position-relative'>
      <OSInfo info={latestVersionData?.info}/>
      <div className='d-flex align-items-baseline my-2 my-lg-0'>
        <span className='d-flex align-items-center'>
          {latestVersionData.status?.heartbeat &&
              <Heartbeat heartbeat={latestVersionData.status.heartbeat}/>
          } <span style={styles.agentVersion} title='Transitive agent version'>
            v{latestVersion}
          </span>
        </span>

        <Dropdown autoClose='outside'
          className={`position-absolute top-0 end-0 me-2`}>
          <Dropdown.Toggle variant='link' size='sm' bsPrefix='_'>
            <FaEllipsisH style={{ color: '#000' }}/>
            <ErrorBadge errorCount={errorCount} />
          </Dropdown.Toggle>

          <Dropdown.Menu>
            <ActionLink disabled={inactive}
              onClick={() => runCommand('ping', {timestamp: Date.now()},
                (time) => setToast({ title: 'Pong!',
                  body: `Server time: ${new Date(time)}`})
              )}
              onContextMenu={() => ping(10)} // hidden feature: right-click
              as={Dropdown.Item}
            >
              Ping
            </ActionLink>
            <ActionLink onClick={restartAgent} disabled={inactive} as={Dropdown.Item}>
              Restart agent
            </ActionLink>
            <ActionLink onClick={
                () => runCommand('stopAll', {}, log.debug)} disabled={inactive}
                as={Dropdown.Item}>
              Stop all capabilities
            </ActionLink>
            <ConfirmedButton onClick={clear}
              explanation={explanation} question='Remove device?'
              as={Dropdown.Item} >
              Remove device
            </ConfirmedButton>
            <LogButtonWithCounter
                text="Get log"
                mqttSync={mqttSync}
                versionPrefix={versionPrefix}
                packageName='@transitive-robotics/robot-agent'
                errorCount={errorCount}
                as={Dropdown.Item}
              />
          </Dropdown.Menu>
        </Dropdown>
      </div>

      <div>
        <ResourceMetrics
          label='CPU'
          title='System: total CPU usage'
          color='#9b59b6'
          data={latestVersionData?.status?.metrics?.system.cpu}
          />
        <ResourceMetrics
          label='Mem'
          title='System: total (active) memory usage'
          color='#f39c12'
          data={latestVersionData?.status?.metrics?.system.mem}
          />

      </div>

      <Fold title="Configuration">
          <F>
            <div style={styles.row}>
              {latestVersionData?.info?.config &&
                <ConfigEditor info={latestVersionData.info}
                  updateConfig={
                    (modifier) => runCommand('updateConfig', {modifier}, log.debug)
                  }/>}
            </div>
          </F>
      </Fold>
    </div>

    <SelfCheck data={latestVersionData} agentPrefix={versionPrefix} />

    <MyToast toast={toast} onClose={() => setToast(null)}/>

    <div style={styles.row}>
      <h5>Capabilities</h5>
      { hasDisabled && <Alert variant='danger'>
        <FaExclamationTriangle /> Some capabilities have been disabled because
        your free trial has expired. Please add a payment method in Billing and
        reinstall the capabilities.
      </Alert>}

      <Accordion defaultActiveKey={['0']} alwaysOpen>
        { Object.keys(packages).length > 0 ?
          mapSorted(packages, ({preInstalled, running, desired, status, disabled}, name) =>
            <Capability key={name} {...{
                mqttSync, desiredPackagesTopic, versionPrefix, device,
                preInstalled, running, desired, status, disabled, inactive,
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