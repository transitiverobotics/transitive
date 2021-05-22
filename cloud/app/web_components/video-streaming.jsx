import React, { useState, useEffect, useContext } from 'react';
import ReactWebComponent from 'react-web-component';

import { useDataSync } from './hooks.js';
import { InlineCode } from './shared.jsx';

const styles = {
};


const Device = (props) => {
  // const { status, ready, StatusComponent, data } = useDataSync({ jwt, id });
  // const device = data && data[id] && (Object.values(data[id])[0])['remote-access'];
  window.tr_devmode && console.log('video-stream');

  // const params = new URLSearchParams();
  // params.set('topic', '/usb_cam/image_raw'); // escapes '/' and we don't want that
  // params.set('jwt', jwt);
  // params.set('userid', id);

  // props must include jwt and id

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
