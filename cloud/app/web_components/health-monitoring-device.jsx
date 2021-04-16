import React, { useState, useEffect, useContext } from 'react';
import ReactWebComponent from 'react-web-component';
const _ = {
  map: require('lodash/map'),
  defaults: require('lodash/defaults'),
};

import { FontAwesomeIcon } from '@fortawesome/react-fontawesome'
import { faChevronRight } from '@fortawesome/free-solid-svg-icons'

import { Button, Accordion, AccordionContext, Card, Badge }
from 'react-bootstrap';
import { useAccordionToggle } from 'react-bootstrap/AccordionToggle';

import { unset, updateObject } from '../utils.js';
import { useWebSocket } from './hooks.js';
import { LevelBadge } from './shared.jsx';

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
  }
};


const AwareToggle = ({ children, eventKey, callback }) => {
  const currentEventKey = useContext(AccordionContext);
  const isCurrentEventKey = currentEventKey === eventKey;

  const decoratedOnClick = useAccordionToggle(
    eventKey,
    () => callback && callback(eventKey),
  );

  return <Card.Header onClick={decoratedOnClick}>
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
      <LevelBadge level={level}/> {name}
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


const Diagnostics = ({jwt, id}) => {
  const [diag, setDiag] = useState({});

  const { status, ready, StatusComponent } = useWebSocket({ jwt, id,
    onMessage: (data) => {
      const newData = JSON.parse(data);
      window.tr_devmode && console.log(data);
      setDiag(diag => {
        const newDiag = JSON.parse(JSON.stringify(diag));
        updateObject(newDiag, newData);
        return newDiag;
      });
    }
  });

  if (!ready) {
    return <StatusComponent />;
  } else {
    return <Fleet obj={diag[id]} />;
  }
};


class App extends React.Component {

  render() {
    console.log('rendering web component', this.props);

    return <div style={styles.wrapper}>
      <style>
        @import url("https://maxcdn.bootstrapcdn.com/bootstrap/4.5.0/css/bootstrap.min.css");
      </style>
      <Diagnostics {...this.props}/>
    </div>;
  }
}

ReactWebComponent.create(<App />, 'health-monitoring-device');
// ReactWebComponent.create(<App />, 'react-web-component', false);

// @import url("https://cdnjs.cloudflare.com/ajax/libs/font-awesome/5.15.2/css/all.min.css");
// <Button variant="primary">Primary</Button>
// <FontAwesomeIcon icon={faCoffee} style={styles.icon}/>
