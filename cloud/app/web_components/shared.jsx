import React, { useEffect, useMemo, useReducer, useState } from 'react';

import { Modal, Badge, OverlayTrigger, Tooltip } from 'react-bootstrap';

import { FaCircle, FaRegCircle } from 'react-icons/fa';

import { getLogger, decodeJWT } from '@transitive-sdk/utils-web';
import { ActionLink } from '../src/utils/index';

const log = getLogger('shared.jsx');
log.setLevel('info');

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

/**
 * Extract ClickHouse credentials from JWT token
 * @param {string} jwt - The JWT token
 * @returns {Object|null} - ClickHouse credentials or null
 */
const extractClickHouseCredentials = (jwt) => {
  if (!jwt) return null;
  
  try {
    const payload = decodeJWT(jwt);
    return payload.clickhouse || null;
  } catch (error) {
    console.error('Failed to decode JWT:', error);
    return null;
  }
};


/** Component that renders package logs from ClickHouse and live MQTT logs */
export const PkgLog = ({packageName, mqttClient, device, agentPrefix, hide, jwt}) => {
  const [initialLogs, setInitialLogs] = useState('Loading logs...');
  const [liveLogs, setLiveLogs] = useState([]);

  const clickhouseCredentials = useMemo(() => extractClickHouseCredentials(jwt), [jwt]);

  // Fetch initial logs from ClickHouse
  useEffect(async () => {
    if (!device || !packageName || !clickhouseCredentials) {
      return;
    }
    const fetchInitialLogs = async () => {
      try {
        // Query ClickHouse for logs from this package in JSON format
        // Note: The org filtering is handled by row level policies on clickhouse
        const query = `
          SELECT 
            Timestamp,
            SeverityText,
            ServiceName,
            Body,
            LogAttributes
          FROM otel_logs
          WHERE ServiceName = '${packageName}'
            AND ResourceAttributes['device.id'] = '${device}'
          ORDER BY Timestamp DESC
          LIMIT 1000
          FORMAT JSON
        `;
        
        const jsonData = await executeClickHouseQuery(query, clickhouseCredentials);
        const formattedLogs = formatLogsForDisplay(jsonData.data);
        setInitialLogs(formattedLogs || 'No logs available');
        
      } catch (error) {
        console.error('Failed to fetch logs from ClickHouse:', error);
        setInitialLogs(`Error loading logs: ${error.message}`);
      }
    };
    await fetchInitialLogs();
  }, [packageName, device, clickhouseCredentials]);

  useEffect(() => {
    if (mqttClient) {
      const topic = `${agentPrefix}/status/logs/live`;
      mqttClient.subscribe(topic, (err) => {
        if (err) {
          console.error('Failed to subscribe to live logs:', err);
        } else {
          console.log('Subscribed to live logs:', topic);
        }
      });
      
      const handleMessage = (msgTopic, message) => {
        if (msgTopic === topic) {
          const logLines = message && JSON.parse(message.toString());
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
      };
      
      mqttClient.on('message', handleMessage);
      
      // Cleanup function
      return () => {
        mqttClient.off('message', handleMessage);
        mqttClient.unsubscribe(topic);
      };
    }
  }, [mqttClient, packageName]);

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
      <h5>Logs</h5>
      <pre style={style}>{initialLogs}</pre>
      <h5>Live Logs</h5>
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
  device,
  versionPrefix, 
  packageName, 
  toolTipPlacement = 'top',
  jwt
}) => {
  const [errorLogsCount, setErrorLogsCount] = useState(0);
  const [lastError, setLastError] = useState(null);
  const [showLogs, setShowLogs] = useState(false);

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
      const unsubscribeCount = mqttSync.data.subscribePath(errorLogsCountTopic, updateErrorLogsCount);
      const unsubscribeError = mqttSync.data.subscribePath(lastErrorTopic, updateLastError);
      
      // Cleanup
      return () => {
        if (unsubscribeCount) unsubscribeCount();
        if (unsubscribeError) unsubscribeError();
      };
    }
  }, [mqttSync, versionPrefix, packageName]);

  // Handle get log button click
  const handleGetLog = () => {
    // Simply show the modal with the package name
    // The PkgLog component will handle fetching from ClickHouse
    setShowLogs(true);
  };
  
  const formatLastError = (errorObj) => {
    if (!errorObj) return 'No error details available';
    
    const timestamp = errorObj.timestamp ? new Date(errorObj.timestamp).toISOString() : 'Unknown time';
    const module = errorObj.module || 'Unknown module';
    const message = errorObj.message || 'No message';
    
    return `${timestamp} - ${module}: ${message}`;
  };

  return (
    <>
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
      
      {showLogs && <PkgLog 
        packageName={packageName}
        mqttClient={mqttSync.mqtt}
        device={device}
        agentPrefix={versionPrefix}
        hide={() => setShowLogs(false)}
        jwt={jwt}
      />}
    </>
  );
};

/**
 * Execute a ClickHouse query with credentials
 * @param {string} query - The SQL query to execute
 * @param {Object} credentials - ClickHouse credentials {user, password}
 * @returns {Promise<Object>} - Query result
 */
const executeClickHouseQuery = async (query, credentials) => {
  const url = `http://clickhouse.azeroth.local/?user=${credentials.user}&password=${credentials.password}&query=${encodeURIComponent(query)}`;
  
  const response = await fetch(url, {
    method: 'GET',
  });
  
  if (!response.ok) {
    throw new Error(`ClickHouse query failed: ${response.status}`);
  }
  
  return await response.json();
};

/**
 * Format log data for display
 * @param {Array} logData - Raw log data from ClickHouse
 * @returns {string} - Formatted logs
 */
const formatLogsForDisplay = (logData) => {
  if (!logData || logData.length === 0) {
    return 'No logs found for this package';
  }
  
  return logData
    .reverse() // Show oldest first
    .map(log => {
      const timestamp = new Date(log.Timestamp).toISOString();
      const severity = log.SeverityText;
      const body = log.Body;
      const module = log.LogAttributes?.module || '';
      const moduleStr = module ? ` ${module}` : '';
      return `[${timestamp}${moduleStr} ${severity}] ${body}`;
    })
    .join('\n');
};
