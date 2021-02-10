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
const DiagnosticsStatus = ({level, message, name, hardware_id, values, i}) =>
  <Card style={level == 3 ? {color: '#aaa'} : {}}>
    <AwareToggle eventKey={i}>
      {levelBadges[level]} {name}
      {hardware_id && <span> ({hardware_id})</span>}: {message}
    </AwareToggle>
    <Accordion.Collapse eventKey={i}>
      <Card.Body>
        {(values?.length > 0 ? _.map(values, ({key, value}, j) =>
            /* Note that we cannot use deconstruction here, since key is reserved */
            <div key={j}>{key}: {value}</div>)
          : <div style={styles.indent}><i>No sub-values</i></div>
        )}
      </Card.Body>
    </Accordion.Collapse>
  </Card>;

/** render a DiagnosticArray message
  TODO: group status by name-prefix (using '/' separators) */
const DiagnosticsArray = ({header, status}) =>
  <div>
    <div>{(new Date(header.stamp.secs * 1000)).toLocaleString()}</div>
    <Accordion>
      {status.map((s, i) => <DiagnosticsStatus {...s} i={i+1} key={i}/>)}
    </Accordion>
  </div>;

/** a site is a list of devices */
const Site = ({obj}) => <div>
  {_.map(obj, (device, key) =>
    <div key={key}>
      Device, {key}
      <DiagnosticsArray {...device} />
    </div>
  )}
</div>;

/** a fleet is an object of sites */
const Fleet = ({obj}) => <div>
  {_.map(obj, (site, siteName) =>
    <div key={siteName}>{siteName}:
      <Site obj={site} />
    </div>
  )}
</div>;


const Diagnostics = () => {
  const [diag, setDiag] = useState();
  // TODO: also allow partial updates (per robot)

  useEffect(() => {
      console.log('connecting to websocket server')
      const ws = new WebSocket('ws://localhost2:9000');
      ws.onopen = (event) => {
        ws.send("Hi from client");
      };

      ws.onmessage = (event) => {
        setDiag(JSON.parse(event.data));
      }
    }, []);

  if (!diag) {
    return <div>waiting for data..</div>;
  }
  // console.log(diag);
  return <Fleet obj={diag} />;
};


class App extends React.Component {

  render() {
    console.log('rendering web component');
    return <div style={styles.wrapper}>
      <style>
        @import url("https://maxcdn.bootstrapcdn.com/bootstrap/4.5.0/css/bootstrap.min.css");
      </style>
      <Diagnostics />
    </div>;
  }
}

ReactWebComponent.create(<App />, 'react-web-component');
// ReactWebComponent.create(<App />, 'react-web-component', false);

// @import url("https://cdnjs.cloudflare.com/ajax/libs/font-awesome/5.15.2/css/all.min.css");
// <Button variant="primary">Primary</Button>
// <FontAwesomeIcon icon={faCoffee} style={styles.icon}/>
