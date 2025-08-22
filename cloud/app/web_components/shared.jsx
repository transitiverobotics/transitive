import React, { useEffect, useReducer, useState } from 'react';
import pako from 'pako';

import { Modal, Badge, OverlayTrigger, Tooltip } from 'react-bootstrap';

import { FaCircle, FaRegCircle } from 'react-icons/fa';

import { getLogger } from '@transitive-sdk/utils-web';
import { ActionLink } from '../src/utils/index';

const log = getLogger('shared.jsx');
log.setLevel('info');

const F = React.Fragment;

const _ = {
  map: require('lodash/map'),
  filter: require('lodash/filter'),
};

const STALE_THRESHOLD = 3 * 24 * 60 * 60 * 1e3;
const WARNING_THRESHOLD = 1.15 * 60 * 1e3;

const levels = [
  {color: '#2e912e', comp: FaCircle, label: 'online'},
  {color: '#bd0000', comp: FaCircle, label: 'offline'},
  {color: '#777', comp: FaRegCircle, label: 'inactive'},
];

/** get heartbeat level (index into `levels`) */
export const heartbeatLevel = (heartbeat) => {
  const timediff = Date.now() - (new Date(heartbeat));
  return timediff > STALE_THRESHOLD ? 2
  : timediff > WARNING_THRESHOLD ? 1
  : 0;
}

export const Heartbeat = ({heartbeat, refresh = true}) => {
  const [ignored, forceUpdate] = useReducer(x => x + 1, 0);
  const [timer, setTimer] = useState();

  const date = new Date(heartbeat);
  refresh && useEffect(() => {
      // force an update a while after last heartbeat to show offline if necessary
      timer && clearTimeout(timer);
      const timeout = date - Date.now() + WARNING_THRESHOLD + 1;
      setTimer(setTimeout(forceUpdate, timeout));
    }, [heartbeat]);

  const level = levels[heartbeatLevel(heartbeat)];
  const Comp = level.comp;

  return <span
    style={{
      color: level.color,
      marginRight: '1em',
      fontSize: '0.5rem',
      verticalAlign: 'text-bottom'
    }}
    title={`${level.label}: ${date.toLocaleString()}`}>
    <Comp />
  </span>
};

/** ensure the listed props were provided */
export const ensureProps = (props, list) => list.every(name => {
  const missing = (props[name] === undefined);
  missing && console.error(`prop ${name} is required, got`, props);
  return !missing;
});


/** given a compressed base64 buffer, convert and decompress */
const decompress = (zippedBase64) => {
  const buf = Uint8Array.from(atob(zippedBase64), c => c.charCodeAt(0));
  return pako.ungzip(buf, {to: 'string'});
};

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
  This has now been extended to additionally also show the live-log, which comes
  directly from MQTT (not MQTTSync).
*/
export const PkgLog = ({response, mqttClient, agentPrefix, hide}) => {
  const scope = Object.keys(response)[0];
  const cap = Object.values(response)[0];
  const capName = Object.keys(cap)[0];
  const result = Object.values(cap)[0];
  const stdout = decompress(result.stdout);

  const packageName = (capName === 'robot-agent') ?
    'robot-agent' : `${scope}/${capName}`;

  const [liveLogs, setLiveLogs] = useState([]);

  // subscribe to live-log and append it
  useEffect(() => {

    if (mqttClient) {
      const topic = `${agentPrefix}/status/logs/live`;

      mqttClient.subscribe(topic, (err) => {
        if (err) {
          log.error('Failed to subscribe to live logs:', err);
        } else {
          log.debug('Subscribed to live logs:', topic);
        }
      });

      mqttClient.on('message', (msgTopic, message) => {
        if (msgTopic === topic) {
          // const logLines = message && JSON.parse(message.toString());
          const jsonStr = pako.ungzip(message, {to: 'string'});
          const logLines = message && JSON.parse(jsonStr);

          if (!logLines || !Array.isArray(logLines) || logLines.length === 0) {
            return;
          }

          const packageLogObjects = _.filter(logLines, (line) => {
            return line.package === packageName;
          });

          const newLog = _.map(packageLogObjects, (log) => {
            return `[${new Date(log.timestamp).toISOString()} ${log.module} ${log.level.toLowerCase()}] ${log.message}`;
          }).join('\n');

          if (newLog) {
            setLiveLogs((prevLogs) => {
              return prevLogs + '\n' + newLog;
            });
          }
        }
      });
    }
  }, [mqttClient, scope, capName]);

  const style = {
    whiteSpace: 'pre-wrap',
    wordBreak: 'break-all',
  };

  // fullscreen={true}
  return <Modal show={true} size='xl' onHide={hide} >
    <Modal.Header closeButton>
      {packageName === 'robot-agent' &&
        <Modal.Title> Robot Agent Log </Modal.Title>
      }
      {packageName !== 'robot-agent' &&
        <Modal.Title>Package Log for {packageName}</Modal.Title>
      }
    </Modal.Header>
    <Modal.Body>
      {stdout ? <pre style={style}>{stdout}</pre> : <div>stdout is empty</div>}
      <h5>Live Log:</h5>
      <pre style={style}>
        {liveLogs}
      </pre>
    </Modal.Body>
  </Modal>;
}

// Styles for LogButtonWithCounter component
const logButtonStyles = {
  container: {
    display: 'inline-flex',
    alignItems: 'baseline',
    position: 'relative',
    marginRight: '2em'
  },
  errorCountBadge: {
    cursor: 'default',
    fontSize: '0.75em',
    lineHeight: 1,
    minWidth: '1.4em',
    height: '1.4em',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    position: 'absolute',
    top: '-0.6em',
    left: '100%',
    marginLeft: '0.1em'
  }
};

/** Component that shows a log button with an error counter badge */
export const GetLogButtonWithCounter = ({
  text,
  mqttSync,
  versionPrefix,
  packageName,
  toolTipPlacement = 'top',
}) => {
  const [errorLogsCount, setErrorLogsCount] = useState(0);
  const [lastError, setLastError] = useState(null);
  const [pkgLog, setPkgLog] = useState(null);

  // Subscribe to error logs and get data
  useEffect(() => {
    if (mqttSync && versionPrefix && packageName) {
      // Subscribe to error logs count and last error topics
      const errorLogsCountTopic = `${versionPrefix}/status/logs/errorCount/${packageName}`;
      const lastErrorTopic = `${versionPrefix}/status/logs/lastError/${packageName}`;

      mqttSync.subscribe(errorLogsCountTopic);
      mqttSync.subscribe(lastErrorTopic);

      // Get current values and set up listeners
      const updateErrorLogsCount = () => {
        const count = mqttSync.data.getByTopic(errorLogsCountTopic) || 0;
        setErrorLogsCount(count);
      };

      const updateLastError = () => {
        const error = mqttSync.data.getByTopic(lastErrorTopic);
        setLastError(error);
      };

      // Initial load
      updateErrorLogsCount();
      updateLastError();

      // Set up data listeners
      mqttSync.data.subscribePath(errorLogsCountTopic, updateErrorLogsCount);
      mqttSync.data.subscribePath(lastErrorTopic, updateLastError);
    }
  }, [mqttSync, versionPrefix, packageName]);

  // Handle get log button click
  const handleGetLog = () => {
    const topic = `${versionPrefix}/rpc/getPkgLog`;
    log.debug('running getPkgLog command', {topic, pkg: packageName});

    mqttSync.call(topic, {pkg: packageName}, (response) => {
      log.debug('got package log response', response);

      // Format response for PkgLog component
      if (packageName === 'robot-agent') {
        setPkgLog({'@transitive-robotics': {'robot-agent': response}});
      } else {
        const [scope, capName] = packageName.split('/');
        setPkgLog({[scope]: {[capName]: response}});
      }
    });
  };

  const formatLastError = (errorObj) => {
    if (!errorObj) return 'No error details available';

    const timestamp = errorObj.timestamp ? new Date(errorObj.timestamp).toISOString() : 'Unknown time';
    const module = errorObj.module || 'Unknown module';
    const message = errorObj.message || 'No message';

    return `${timestamp} - ${module}: ${message}`;
  };

  return (
    <F>
      <div style={logButtonStyles.container}>
        <ActionLink onClick={handleGetLog}>
          {text}
        </ActionLink>
        {errorLogsCount > 0 && lastError && (
          <OverlayTrigger
            placement={toolTipPlacement}
            overlay={
              <Tooltip id={`error-tooltip-${Math.random()}`}>
                Last error: {formatLastError(lastError)}
              </Tooltip>
            }
          >
            <Badge
              pill
              bg='danger'
              style={logButtonStyles.errorCountBadge}
            >
              {errorLogsCount}
            </Badge>
          </OverlayTrigger>
        )}
      </div>

      {pkgLog && <PkgLog
        response={pkgLog}
        mqttClient={mqttSync.mqtt}
        agentPrefix={versionPrefix}
        hide={() => setPkgLog(null)}
      />}
    </F>
  );
};
