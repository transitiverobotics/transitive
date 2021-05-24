import React, { useState, useEffect, useContext } from 'react';
import ReactWebComponent from 'react-web-component';

import { useDataSync } from './hooks.js';
import { InlineCode } from './shared.jsx';

const styles = {
};


const Device = (props) => {
  // note: props must include jwt and id
  window.tr_devmode && console.log('video-stream');

  const params = Object.assign({}, {
      topic: '/usb_cam/image_raw',
      quality: 20,
    }, props);
  const urlParams = Object.entries(params).map(x => x.join('=')).join('&');

  return <div>
    <img src={`http${TR_SECURE ? 's' : ''}://video.${TR_HOST}/stream?${urlParams}`} />
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
