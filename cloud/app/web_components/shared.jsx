import React, { useEffect, useReducer, useState } from 'react';

import { FaCircle, FaRegCircle, FaRegQuestionCircle } from 'react-icons/fa';

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
