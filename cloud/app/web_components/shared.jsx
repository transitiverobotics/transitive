import React, { useEffect, useReducer, useState } from 'react';
import pako from 'pako';

import { Modal, Badge, OverlayTrigger, Tooltip, Button } from 'react-bootstrap';
import { FaCircle, FaRegCircle } from 'react-icons/fa';
import { AnsiHtml } from 'fancy-ansi/react';

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

  // const packageName = (capName === 'robot-agent') ?
  //   'robot-agent' : `${scope}/${capName}`;
  const packageName = `${scope}/${capName}`;

  const [liveLogs, setLiveLogs] = useState([]);

  const style = {
    display: 'block',
    color: '#999',
    fontFamily: 'monospace',
    fontSize: 'smaller',
    whiteSpace: 'pre-wrap',
    wordBreak: 'break-all',
  };

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


  const lines = stdout ? stdout.split(/\n/g) : null;

  // fullscreen={true}
  return <Modal show={true} size='xl' onHide={hide} >
    <Modal.Header closeButton>
      <Modal.Title>Log for {packageName}</Modal.Title>
    </Modal.Header>
    <Modal.Body style={{
      background: 'hsl(240, 7%, 5%)',
      color: '#eee',
    }}>
      {/* {stdout ? <pre style={style}>{stdout}</pre> : <div>stdout is empty</div>} */}
      { lines ?
        lines.map((line, i) => <AnsiHtml style={style} text={line} key={i}/>)
        : <div>stdout is empty</div>
      }

      <hr/>
      <h6>Live Log, configured <tt>minLogLevel</tt> and above only (default: "error"):</h6>

      <pre style={style}>
        {liveLogs}
      </pre>
    </Modal.Body>
  </Modal>;
}

/** Component that shows a log button with an error counter badge */
export const LogButtonWithCounter = (props) => {
  const { text, mqttSync, versionPrefix, packageName, errorCount, as} = props;

  const [pkgLog, setPkgLog] = useState(null);

  const styles = {
    container: {
      position: 'relative',
      // verticalAlign: 'initial',
    },
    errorCountBadge: {
      cursor: 'default',
      fontSize: '0.5em',
      position: 'absolute',
      marginLeft: '0.5em',
    }
  };

  const Comp = as || Button;

  // Handle get log button click
  const handleGetLog = () => {
    const topic = `${versionPrefix}/rpc/getPkgLog`;
    log.debug('running getPkgLog command', {topic, pkg: packageName});

    mqttSync.call(topic, {pkg: packageName}, (response) => {
      log.debug('got package log response', response);
      const [scope, capName] = packageName.split('/');
      setPkgLog({[scope]: {[capName]: response}});
    });
  };

  return (
    <F>
      <Comp variant='link' style={styles.container}
        onClick={handleGetLog}>
        {text}
        { errorCount > 0 && <Badge pill bg='danger' style={styles.errorCountBadge}
          title={`There are ${errorCount} errors.`}>
          {errorCount}
        </Badge>}
      </Comp>
      {pkgLog && <PkgLog
        response={pkgLog}
        mqttClient={mqttSync.mqtt}
        agentPrefix={versionPrefix}
        hide={() => setPkgLog(null)}
        />}
    </F>
  );
};


/** chatGPT: Write code that, given an object like the blow, generates an SVG
* where for each minutes of the last hour there is a thin vertical bar that is
green if there is a heartbeat with a Payload from that time, and gray otherwise.
(modified)
*/
export const HeartbeatHistory = ({heartbeats, options = {}}) => {
  const {
    width = 300,
    height = '0.5em',
    barColorOn = "#2ecc71",   // green
    barColorOff = "#9999",  // gray
    barWidth = 2,
    barGap = 1
  } = options;

  // SVG layout math
  const totalBars = 60;
  const svgWidth =
    totalBars * barWidth + (totalBars - 1) * barGap;
  const scale = width / svgWidth;

  // Generate SVG bars
  let x = 0;
  const bars = [];
  for (let i = 59; i > 0; i--) {
    const barDate = new Date(Date.now() - i * 60 * 1000);
    const key = barDate.toISOString().slice(0, 16);
    const color = heartbeats[key] ? barColorOn : barColorOff;

    bars.push(<rect key={key} fill={color}
      x={x * scale} y={0} width={barWidth * scale} height={height}
    >
      <title>{key}</title>
    </rect>);

    x += barWidth + barGap;
  }

  // Wrap in SVG
  return <svg xmlns='http://www.w3.org/2000/svg' width={width} height={height}
  >
    {bars}
  </svg>;
};
