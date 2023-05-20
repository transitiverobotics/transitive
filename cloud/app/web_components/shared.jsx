import React from 'react';

import { FaCircle, FaRegCircle, FaRegQuestionCircle } from 'react-icons/fa';

const STALE_THRESHOLD = 3 * 24 * 60 * 60 * 1e3;
const WARNING_THRESHOLD = 1.15 * 60 * 1e3;

const levels = [
  {color: '#2e912e', comp: FaCircle, label: 'online'},
  {color: '#700', comp: FaRegQuestionCircle, label: 'offline'},
  {color: '#777', comp: FaRegCircle, label: 'inactive'},
];

/** get heartbeat level (index into `levels`) */
export const heartbeatLevel = (heartbeat) => {
  const timediff = Date.now() - (new Date(heartbeat));
  return timediff > STALE_THRESHOLD ? 2
  : timediff > WARNING_THRESHOLD ? 1
  : 0;
}

export const Heartbeat = ({heartbeat}) => {
  const level = levels[heartbeatLevel(heartbeat)];
  const Comp = level.comp;
  return <span
    style={{
      color: level.color,
      marginRight: '1em',
      fontSize: '0.5rem',
      verticalAlign: 'text-bottom'
    }}
    title={`${level.label}: ${(new Date(heartbeat)).toLocaleString()}`}>
    <Comp />
  </span>
};

/** ensure the listed props were provided */
export const ensureProps = (props, list) => list.every(name => {
  const missing = (props[name] === undefined);
  missing && console.error(`prop ${name} is required, got`, props);
  return !missing;
});
