import React, { useState } from 'react';
import ReactWebComponent from 'react-web-component';

import { useDataSync } from './hooks.js';
import { InlineCode } from './shared.jsx';

const styles = {
};

let interval;

const Timer = ({duration, onTimeout, onStart}) => {
  const [timer, setTimer] = useState(duration || 60);

  if (!interval && timer > 0) {
    interval = setInterval(() =>
      setTimer(t => {
        if (--t > 0) {
          return t;
        } else {
          onTimeout && setTimeout(onTimeout, 1);
          clearInterval(interval);
          interval = null;
        }
      }), 1000);
    onStart && setTimeout(onStart, 1);
  }

  return timer > 0 ? <div>Timeout in: {timer} seconds</div>
  : <div>Timed out. <button onClick={() => setTimer(duration)}>
      Resume
    </button>
  </div>;
};

const Device = (props) => {
  const [running, setRunning] = useState(false);
  // note: props must include jwt and id
  window.tr_devmode && console.log('video-stream');

  const params = Object.assign({}, {
      topic: '/usb_cam/image_raw',
      quality: 20,
    }, props);
  const urlParams = Object.entries(params).map(x => x.join('=')).join('&');

  return <div>
    {running &&
        <img src={`http${TR_SECURE ? 's' : ''}://video.${TR_HOST}/stream?${urlParams}`} />
    }
    <Timer duration={60}
      onTimeout={() => setRunning(false)}
      onStart={() => setRunning(true)} />
  </div>
};

class App extends React.Component {
  render() {
    return <div>
      <Device {...this.props}/>
    </div>;
  }
};

ReactWebComponent.create(<App />, 'video-streaming');
