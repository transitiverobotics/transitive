import React, { useState, useEffect, useContext } from 'react';
import ReactWebComponent from 'react-web-component';
const _ = {
  map: require('lodash/map'),
};

import { ListGroup } from 'react-bootstrap';

import { useWebSocket } from './hooks.js';
import { LevelBadge } from './shared.jsx';

const STALE_THRESHOLD = 5 * 60 * 60 * 1e3;

const styles = {
  title: {
    marginRight: '0.5em',
  },
  secondary: {
    color: '#777',
    fontSize: 'smaller',
    marginLeft: '1em'
  },
  list: {
    width: '40em'
  },
  date: (date) => ({
    float: 'right',
    // mark the date in red if it's too old
    color: Date() - (new Date(date)) > STALE_THRESHOLD ? '#f77' : '#777',
    fontSize: 'smaller',
  }),
  hostname: {
    marginLeft: '1em'
  }
};

const FleetHealth = ({jwt, id, deviceurl}) => {
  const [data, setData] = useState({});

  const { status, ready, StatusComponent } = useWebSocket({ jwt, id,
    onMessage: (data) => {
      console.log(data);
      const newData = JSON.parse(data);
      setData(newData);
    }
  });

  if (!ready) {
    return <StatusComponent />;
  } else if (!Object.values(data).length) {
    return <div>No devices found. Make sure you have connected devices to
      your account and installed the Health Monitoring capability.</div>
  } else {
    // return <Fleet obj={diag[id]} />;
    const fleet = Object.values(data)[0];
    // <pre>{JSON.stringify(fleet, true, 2)}</pre>
    return <div>
      <b style={styles.title}>Fleet Health</b>
      <LevelBadge level={fleet && fleet.level}/>
      <ListGroup variant="flush" style={styles.list}>
        {_.map(fleet.devices, ({hostname, level, msgs, lastUpdate}, id) =>
            <ListGroup.Item key={id}>
              <LevelBadge level={level}/> <span style={styles.hostname}>
                { deviceurl ?
                  <a href={deviceurl.replace(':deviceId', id)}>{hostname}</a>
                  : hostname }
              </span>

              <div style={styles.date(lastUpdate)}>
                updated: {new Date(lastUpdate).toLocaleString()}
              </div>

              <br/>
              {msgs && msgs.length > 0 && <div style={styles.secondary}>
                {msgs.map((msg, i) => <div key={i}>{msg}</div>)}
              </div>}
            </ListGroup.Item>)
        }
      </ListGroup>
    </div>;
  }
};


class App extends React.Component {

  render() {
    console.log('rendering health-monitoring-fleet', this.props);

    return <div>
      <style>
        @import url("https://maxcdn.bootstrapcdn.com/bootstrap/4.5.0/css/bootstrap.min.css");
      </style>

      <FleetHealth {...this.props}/>
    </div>;
  }
}

ReactWebComponent.create(<App />, 'health-monitoring-fleet');
