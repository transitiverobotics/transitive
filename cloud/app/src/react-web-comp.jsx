import React, { useState, useEffect } from 'react';
import ReactWebComponent from 'react-web-component';
import _ from 'lodash';


const Counter = () => {
  const [count, setCount] = useState(0);

  return <div>
    counter: {count}
    <button onClick={() => setCount(count + 1)}>++</button>
  </div>;
};


const CPU = () => {
  const [cpu, setCPU] = useState({msg: 'waiting..'});

  useEffect(() => {
      console.log('connecting to websocket server')
      const ws = new WebSocket('ws://localhost2:9000');
      ws.onopen = (event) => {
        ws.send("Hi from client");
      };

      ws.onmessage = (event) => setCPU(JSON.parse(event.data));
    }, []);

  return <div>
    CPU: {_.map(cpu, (val, key) =>
      <div>{key}: {JSON.stringify(val)}</div>
    )}
  </div>;
};


class App extends React.Component {

  render() {
    console.log('rendering web component');
    return <div style={{backgroundColor: 'black'}}>
      Hello from react-web-comp!
      <Counter />
      <CPU />
    </div>;
  }
}

ReactWebComponent.create(<App />, 'react-web-component');
