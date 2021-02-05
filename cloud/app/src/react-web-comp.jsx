import React, { useState, useEffect } from 'react';
import ReactWebComponent from 'react-web-component';
import _ from 'lodash';
import Button from 'react-bootstrap/Button';

import { FontAwesomeIcon } from '@fortawesome/react-fontawesome'
import { faCoffee } from '@fortawesome/free-solid-svg-icons'

const styles = {
  wrapper: {
     // backgroundColor: 'black',
    border: '1px solid gray',
    padding: '1em',
    textAlign: 'left',
    width: '80vw'
  },
  indent: {
    marginLeft: '1em'
  },
  fold: {
  },
  icon: {
    height: '1em'
  }
};



/** render a keyValue message */
const KeyValue = ({keyValue}) =>
  <div style={styles.indent}>
    {keyValue.key}: {keyValue.value}
  </div>;

/** render a DiagnosticStatus message
*/
const DiagnosticsStatus = ({level, message, name, hardware_id, values}) => {
  const [folded, setFolded] = useState(true);

  return <div style={styles.indent}>
    <div onClick={() => setFolded(f => !f)} style={styles.fold}>
      {name} ({hardware_id}): {level} {message}
    </div>
    {!folded && (values?.length > 0 ? _.map(values, (keyValue, i) =>
        /* Note that we cannot use deconstruction here, since key is reserved */
        <div key={i}><KeyValue keyValue={keyValue} /></div>)
      : <div style={styles.indent}><i>No sub-values</i></div>
    )}
  </div>
};

/** render a DiagnosticArray message
  TODO: group status by name-prefix (using '/' separators) */
const DiagnosticsArray = ({header, status}) => <div style={styles.indent}>
  <div>{header.stamp.secs}</div>
  {status.map((s, i) => <div key={i}>
    <DiagnosticsStatus {...s} />
  </div>)}
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
  <Button variant="primary">Primary</Button>
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
      <FontAwesomeIcon icon={faCoffee} style={styles.icon}/>
      <Diagnostics />
    </div>;
  }
}

ReactWebComponent.create(<App />, 'react-web-component');
// ReactWebComponent.create(<App />, 'react-web-component', false);
// @import url("https://cdnjs.cloudflare.com/ajax/libs/font-awesome/5.15.2/css/all.min.css");
