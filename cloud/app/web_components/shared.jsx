import React from 'react';

import { FaHeartbeat } from 'react-icons/fa';


const STALE_THRESHOLD = 5 * 60 * 60 * 1e3;
const WARNING_THRESHOLD = 2 * 60 * 1e3;

const style = {
  live: {color: '#464'},
  warning: {color: '#774'},
  stale: {color: '#a00'},
};

export const Heartbeat = ({heartbeat}) => {
  const timediff = Date.now() - (new Date(heartbeat));
  const state = timediff > STALE_THRESHOLD ? 'stale'
      : timediff > WARNING_THRESHOLD ? 'warning'
      : 'live';
  return <span style={style[state]} title={state}>
    <FaHeartbeat /> {(new Date(heartbeat)).toLocaleString()}
  </span>
};


/** ensure the listed props were provided */
export const ensureProps = (props, list) => list.every(name => {
  const missing = (props[name] === undefined);
  missing && console.error(`prop ${name} is required, got`, props);
  return !missing;
});
