import React, { useState, useEffect, useContext } from 'react';
import ReactWebComponent from 'react-web-component';
const _ = {
  map: require('lodash/map'),
  defaults: require('lodash/defaults'),
};

import { FaChevronRight } from 'react-icons/fa';

import { Button, Accordion, AccordionContext, Card, Badge }
from 'react-bootstrap';
import { useAccordionToggle } from 'react-bootstrap/AccordionToggle';

import { useDataSync } from './hooks.js';
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

  const decoratedOnClick = useAccordionToggle(eventKey,
    () => callback && callback(eventKey)
  );

  return <Card.Header onClick={decoratedOnClick}>
    <FaChevronRight
      style={_.defaults(isCurrentEventKey ? {transform: 'rotate(90deg)'} : {},
        styles.icon)} /> {children}
  </Card.Header>;
};

/** render a DiagnosticStatus message
*/
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
};


const Device = (status) => {
  window.tr_devmode && console.log({status});
  const diagnostics = status['health-monitoring'].diagnostics;

  return <div>
    <Accordion>{
        Object.keys(diagnostics).sort().map(name =>
          <DiagnosticsStatus {...diagnostics[name]} name={name} key={name}/>
        )
      }</Accordion>
  </div>;
};


/** a fleet is an object of devices */
const Fleet = ({obj}) => <div>
  {_.map(obj, (device, deviceId) =>
    <div key={deviceId}>
      <Device {...device} />
    </div>
  )}
</div>;


const Diagnostics = ({jwt, id}) => {
  const { status, ready, StatusComponent, data } = useDataSync({ jwt, id });
  return (!ready ? <StatusComponent /> : <Fleet obj={data[id]} />);
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
};

ReactWebComponent.create(<App />, 'health-monitoring-device');
// ReactWebComponent.create(<App />, 'react-web-component', false);

// @import url("https://cdnjs.cloudflare.com/ajax/libs/font-awesome/5.15.2/css/all.min.css");
// <Button variant="primary">Primary</Button>
// <FontAwesomeIcon icon={faCoffee} style={styles.icon}/>