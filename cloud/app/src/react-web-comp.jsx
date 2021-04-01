import React, { useState, useEffect, useContext } from 'react';
import ReactWebComponent from 'react-web-component';
import _ from 'lodash';
import Button from 'react-bootstrap/Button';

import { FontAwesomeIcon } from '@fortawesome/react-fontawesome'
import { faChevronDown, faChevronRight } from '@fortawesome/free-solid-svg-icons'

import Accordion from 'react-bootstrap/Accordion';
import AccordionContext from 'react-bootstrap/AccordionContext';
import { useAccordionToggle } from 'react-bootstrap/AccordionToggle';
import Card from 'react-bootstrap/Card';
import Badge from 'react-bootstrap/Badge';

const styles = {
  wrapper: {
    padding: '0.5em',
    textAlign: 'left',
    color: '#000',
  },
  indent: {
    marginLeft: '1em'
  },
  fold: {
  },
  icon: {
    height: '1em',
    width: '1em',
    transition: 'transform 0.3s'
  },
  badge: {
    width: '4em'
  }
};

/** badges for levels */
const levelBadges = [
  <Badge variant="success" style={styles.badge}>OK</Badge>,
  <Badge variant="warning" style={styles.badge}>Warn</Badge>,
  <Badge variant="danger" style={styles.badge}>Error</Badge>,
  <Badge variant="secondary" style={styles.badge}>Stale</Badge>,
];


const AwareToggle = ({ children, eventKey, callback }) => {
  const currentEventKey = useContext(AccordionContext);
  const isCurrentEventKey = currentEventKey === eventKey;

  const decoratedOnClick = useAccordionToggle(
    eventKey,
    () => callback && callback(eventKey),
  );

  // <FontAwesomeIcon icon={isCurrentEventKey ? faChevronDown : faChevronRight}
  return <Card.Header onClick={decoratedOnClick}>
    {/* TODO: use transform rotation instead to animate this */}
    <FontAwesomeIcon icon={faChevronRight}
      style={_.defaults(isCurrentEventKey ? {transform: 'rotate(90deg)'} : {},
        styles.icon)} /> {children}
  </Card.Header>;
}

/** render a DiagnosticStatus message
*/
// <Accordion.Toggle as={Card.Header} variant="link" eventKey={i}>
//   {levelBadges[level]} {name} ({hardware_id}): {message}
// </Accordion.Toggle>
const DiagnosticsStatus = ({level, message, name, hardware_id, values}) => {
  return  <Card style={level == 3 ? {color: '#aaa'} : {}}>
    <AwareToggle eventKey={name}>
      {levelBadges[level]} {name}
      {hardware_id && <span> ({hardware_id})</span>}: {message}
    </AwareToggle>
    <Accordion.Collapse eventKey={name}>
      <Card.Body>
        {values && (Object.keys(values).length > 0 ? _.map(values, (value, key) =>
            /* Note that we cannot use deconstruction here, since key is reserved */
            <div key={key}>{key}: {value}</div>)
          : <div style={styles.indent}><i>No sub-values</i></div>
        )}
      </Card.Body>
    </Accordion.Collapse>
  </Card>;
}

/** render a DiagnosticArray message
  TODO: group status by name-prefix (using '/' separators) */
// const DiagnosticsArray = ({header, status}) =>
//   <div>
//     <div>{(new Date(header.stamp.secs * 1000)).toLocaleString()}</div>
//     <Accordion>
//       {status.map((s, i) => <DiagnosticsStatus {...s} i={i+1} key={i}/>)}
//     </Accordion>
//   </div>;


// not in use yet
// const DeviceComponent = ({statuses, name}) => {
//   const level = 0; // roll up from sub-statuses
//
//   return  <Card style={level == 3 ? {color: '#aaa'} : {}}>
//     <AwareToggle eventKey={name}>
//       {levelBadges[level]} {name}
//     </AwareToggle>
//     <Accordion.Collapse eventKey={name}>
//       <Card.Body>
//         <Accordion>
//           {_.map(statuses, (status, subname) =>
//             /* Note that we cannot use deconstruction here, since key is reserved */
//             <DiagnosticsStatus {...status} name={subname} key={subname}/>
//           )}
//         </Accordion>
//       </Card.Body>
//     </Accordion.Collapse>
//   </Card>;
// }


const Device = (status) => {
  const health = status['health-monitoring'];

  window.tr_devmode && console.log(status);

  return <div>
    <Accordion>
      {_.map(health.diagnostics, (status, name) =>
          <DiagnosticsStatus {...status} name={name} key={name}/>
        )
      }
    </Accordion>
  </div>;
}
// : <DeviceComponent statuses={status} name={name} key={name}/>


// <DiagnosticsStatus {...s} i={i+1} key={i}/>)
// <div key={key}>{key} {JSON.stringify(value)}</div>

// /** a site is a list of devices */
// const Site = ({obj}) => <div>
//   {_.map(obj, (device, key) =>
//     <div key={key}>
//       Device, {key}
//       <DiagnosticsArray {...device} />
//     </div>
//   )}
// </div>;

/** a fleet is an object of devices */
const Fleet = ({obj}) => <div>
  {_.map(obj, (device, deviceId) =>
    <div key={deviceId}>
      <Device {...device} />
    </div>
  )}
</div>;

/** unset the topic in that obj, and clean up parent if empty, recursively */
const unset = (obj, path) => {
  if (!path) return;
  _.unset(obj, path);
  const parentPath = path.split('.').slice(0,-1).join('.');
  const parent = _.get(obj, parentPath);
  if (_.isEmpty(parent)) {
    unset(obj, parentPath);
  }
};

/** given a modifier {"a/b/c": "xyz"} update the object `obj` such that
  obj.a.b.c = "xyz" */
const updateObject = (obj, modifier) => {
  _.forEach( modifier, (value, topic) => {
    const path = topic.slice(1).replace(/\//g, '.');
    if (value == null) {
      unset(obj, path);
    } else {
      _.set(obj, path, value);
    }
  });
  return obj;
}


const Diagnostics = ({jwt, id}) => {
  const [status, setStatus] = useState('connecting');
  const [diag, setDiag] = useState({});

  useEffect(() => {
      const URL = `${TR_SECURE ? 'wss' : 'ws'}://data.${TR_HOST}?t=${jwt}&id=${id}`;
      // TR_* variables are injected by webpack
      // TODO: also allow construction without token, i.e., delay connecting to ws
      console.log('connecting to websocket server', URL)
      // const ws = new WebSocket('ws://data.localhost:8000');
      // const ws = new WebSocket('wss://data.transitiverobotics.com');
      const ws = new WebSocket(URL);
      ws.onopen = (event) => {
        ws.send("Hi from client");
        setStatus('connected');
      };

      ws.onmessage = (event) => {
        const newData = JSON.parse(event.data);
        setDiag(diag => {
          const newDiag = JSON.parse(JSON.stringify(diag));
          updateObject(newDiag, newData);
          return newDiag;
        });
      };

      ws.onerror = (event) => console.error('websocket error', event);
      ws.onclose = (event) => {
        setStatus('error');
        console.log('websocket closed', event);
      };

    }, []);

  if (status == 'error') {
    return <div>Unable to connect, are you logged in?</div>;
  } else if (status == 'connecting') {
    return <div>connecting..</div>;
  } else if (!diag) {
    return <div>waiting for data..</div>;
  }

  // console.log(diag);
  return <Fleet obj={diag[id]} />;
};


class App extends React.Component {

  render() {
    console.log('rendering web component', this.props);
    window.tr_login = (token) => console.log('tr_login with token', token);

    return <div style={styles.wrapper}>
      <style>
        @import url("https://maxcdn.bootstrapcdn.com/bootstrap/4.5.0/css/bootstrap.min.css");
      </style>
      <Diagnostics {...this.props}/>
    </div>;
  }
}

ReactWebComponent.create(<App />, 'react-web-component');
// ReactWebComponent.create(<App />, 'react-web-component', false);

// @import url("https://cdnjs.cloudflare.com/ajax/libs/font-awesome/5.15.2/css/all.min.css");
// <Button variant="primary">Primary</Button>
// <FontAwesomeIcon icon={faCoffee} style={styles.icon}/>
