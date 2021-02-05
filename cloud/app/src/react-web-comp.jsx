import React, { useState, useEffect } from 'react';
import ReactWebComponent from 'react-web-component';
import _ from 'lodash';
// import 'semantic-ui-css/semantic.min.css';
// const css = require('semantic-ui-css/semantic.min.css');
import sem from 'semantic-ui-css/semantic.min.css';
const css = sem.toString();

// import './test.css';

import { Accordion } from 'semantic-ui-react';
import { Button } from 'semantic-ui-react';

const styles = {
  wrapper: {
    backgroundColor: 'black',
    textAlign: 'left',
    width: '80vw'
  },
  indent: {
    marginLeft: '1em'
  },
  fold: {
  }
};



const level1Panels = [
  { key: 'panel-1a', title: 'Level 1A', content: 'Level 1A Contents' },
  { key: 'panel-ba', title: 'Level 1B', content: 'Level 1B Contents' },
]

const Level1Content = (
  <div>
    Welcome to level 1
    <Accordion.Accordion panels={level1Panels} />
  </div>
)

const level2Panels = [
  { key: 'panel-2a', title: 'Level 2A', content: 'Level 2A Contents' },
  { key: 'panel-2b', title: 'Level 2B', content: 'Level 2B Contents' },
]

const Level2Content = (
  <div>
    Welcome to level 2
    <Accordion.Accordion panels={level2Panels} />
  </div>
)

const rootPanels = [
  { key: 'panel-1', title: 'Level 1', content: { content: Level1Content } },
  { key: 'panel-2', title: 'Level 2', content: { content: Level2Content } },
]

const AccordionExampleNested = () => (
  <Accordion defaultActiveIndex={0} panels={rootPanels} styled />
)



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
  <div className="ui button">test: should be a button</div>
  <Button>Click Here</Button>
  <AccordionExampleNested />
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
      <style>{css}</style>
      <Diagnostics />
    </div>;
  }
}

ReactWebComponent.create(<App />, 'react-web-component');
// ReactWebComponent.create(<App />, 'react-web-component', false);
