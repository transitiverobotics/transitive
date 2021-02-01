import React, { useState, useEffect } from 'react';
import ReactWebComponent from 'react-web-component';


const Counter = () => {
  const [count, setCount] = useState(0);

  return <div>
    counter: {count}
    <button onClick={() => setCount(count + 1)}>++</button>
  </div>;
};


const CPU = () => {
  const [cpu, setCPU] = useState('waiting..');

  useEffect(() => {
      const ws = new WebSocket('ws://localhost2:9000');
      ws.onopen = (event) => {
        ws.send("Hi from client");
      };
      ws.onmessage = function (event) {
        console.log(event.data)
        setCPU(event.data);
      };
    }, []);

  return <div>
    CPU: {cpu}
  </div>;
};


class App extends React.Component {
  render() {
    return <div>
      Hello from react-web-comp!
      <Counter />
      <CPU />
    </div>;
  }
}

ReactWebComponent.create(<App />, 'react-web-component');
