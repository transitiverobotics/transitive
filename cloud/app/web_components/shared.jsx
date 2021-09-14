import React, { useState, useEffect, useContext, useMemo } from 'react';

import { Button, Accordion, AccordionContext, Card, Badge }
from 'react-bootstrap';

import ReactWebComponent from 'react-web-component';

const styles = {
  badge: {
    width: '4em'
  },
  code: {
    color: '#700',
    borderLeft: '3px solid #aaa',
    padding: '0.5em 0px 0.5em 2em',
    backgroundColor: '#f0f0f0',
    borderRadius: '4px',
    marginTop: '0.5em',
  },
  inlineCode: {
    color: '#700',
    margin: '0px 0.5em 0px 0.5em',
  }
};

const levelBadges = [
  <Badge variant="success" style={styles.badge}>OK</Badge>,
  <Badge variant="warning" style={styles.badge}>Warn</Badge>,
  <Badge variant="danger" style={styles.badge}>Error</Badge>,
  <Badge variant="secondary" style={styles.badge}>Stale</Badge>,
];

/** The right badge for the level */
export const LevelBadge = ({level}) => levelBadges[level] || <span>{level}</span>;

/** reusable component for showing code:
  TODO: this is copied from portal, share it somehow
*/
export const Code = ({children}) => <pre style={styles.code}>
  {children}
</pre>;

export const InlineCode = ({children}) => <tt style={styles.inlineCode}>
  {children}
</tt>;


const intervals = {};

export const Timer = ({duration, onTimeout, onStart, setOnDisconnect}) => {
  duration = duration || 60;
  const [timer, setTimer] = useState(duration);
  const [running, setRunning] = useState(false);
  const id = useMemo(() => Math.random().toString(36).slice(2), []);

  const stop = () => {
    console.log('stopping timer for', id);
    onTimeout && setTimeout(onTimeout, 1);
    clearInterval(intervals[id]);
    intervals[id] = null;
    setRunning(false);
  };

  const startTimer = () => {
    const interval = intervals[id];
    console.log(interval, intervals, timer);
    if (!interval && timer > 0) {
      setRunning(true);
      intervals[id] = setInterval(() =>
        setTimer(t => {
          if (--t > 0) {
            return t;
          } else {
            stop();
          }
        }), 1000);
      onStart && setTimeout(onStart, 1);
    }

    return stop;
  };

  useEffect(() => { timer > 0 && !running && startTimer() }, [timer]);

  useEffect(() => stop, []);

  setOnDisconnect && setOnDisconnect(() => {
    // call on disconnect of the web component
    stop()
  });

  return timer > 0 ? <div>Timeout in: {timer} seconds</div>
  : <div>Timed out. <Button onClick={() => {
      setTimer(duration);
    }}>
      Resume
    </Button>
  </div>;
};


/** Create a WebComponent from the given react component and name that is
    reactive to the given attributes (if any). */
export const createWebComponent = (Component, name, reactiveAttributes = []) => {

  class Wrapper extends React.Component {

    onDisconnect = null;

    state = JSON.parse(JSON.stringify(this.props));

    /** function used by `Component` to register a onDisconnect handler */
    setOnDisconnect(fn) {
      this.onDisconnect = fn;
    }

    webComponentDisconnected() {
      this.onDisconnect && this.onDisconnect();
    }

    /**
    Note that this currently requires
    "react-web-component": "github:amay0048/react-web-component#780950800e2962f45f0f029be618bb8b84610c89"
    TODO: create our own fork where this is done internally to react-web-component
    and props are updated.
    */
    webComponentAttributeChanged(name, oldValue, newValue) {
      // console.log('webComponentAttributeChanged', name, oldValue, newValue, this.props, this.state);
      const newState = this.state;
      newState[name] = newValue;
      this.setState(newState);
    }

    render() {
      return <div>
        <style>
          @import url("https://maxcdn.bootstrapcdn.com/bootstrap/4.5.0/css/bootstrap.min.css");
        </style>
        <Component {...this.state} setOnDisconnect={this.setOnDisconnect.bind(this)}/>
      </div>;
    }
  };

  ReactWebComponent.create(<Wrapper />, name, false, reactiveAttributes);
};
