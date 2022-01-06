import React, { useState, useEffect, useContext } from 'react';
import ReactWebComponent from 'react-web-component';

import { useDataSync, InlineCode } from '@transitive-robotics/utils-web';

const styles = {
};


const Device = ({jwt, id}) => {
  const { status, ready, StatusComponent, data } = useDataSync({ jwt, id });
  const device = data && data[id] && (Object.values(data[id])[0])['remote-access'];
  window.tr_devmode && console.log('remote-access', data, device);

  return (!ready ? <StatusComponent /> :
    ( !device ? <div>Not connected to proxy.</div>
      : <div>Connect command:
        <InlineCode>
          ssh -p {device.port} USERNAME-ON-DEVICE@tunnel.transitiverobotics.com
        </InlineCode>
      </div>
    )
  );
};

class App extends React.Component {
  render() {
    return <div>
      <Device {...this.props}/>
    </div>;
  }
};

ReactWebComponent.create(<App />, 'remote-access-device');
