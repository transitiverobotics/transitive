import React, { useState, useEffect, useContext } from 'react';
import ReactWebComponent from 'react-web-component';

import { useWebSocket } from './hooks.js';

const FleetHealth = ({jwt, id}) => {
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
  } else {
    // return <Fleet obj={diag[id]} />;
    return <pre>{JSON.stringify(data, true, 2)}</pre>;
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
