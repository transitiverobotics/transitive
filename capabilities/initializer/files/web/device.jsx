import React, { useState, useRef, useEffect } from 'react';

import { createWebComponent, useTransitive, getLogger }
  from '@transitive-sdk/utils-web';

const log = getLogger('my-new-capability');
log.setLevel('debug');

const [scope, capabilityName] = TR_PKG_NAME.split('/');

const styles = {
};

const Device = ({jwt, id, host, ssl}) => {

  const { mqttSync, data, ready, StatusComponent, prefixVersion } =
    useTransitive({ jwt, id, host, ssl,
      capability: TR_PKG_NAME,
      versionNS: TR_PKG_VERSION_NS
    });

  useEffect(() => {
      if (!mqttSync) return;
      mqttSync.subscribe(`${prefixVersion}/device`);
      mqttSync.subscribe(`${prefixVersion}/cloud`);
    }, [mqttSync]);

  log.debug({prefixVersion, data, TR_PKG_NAME, TR_PKG_VERSION_NS});

  return <div>
    <ul>
      <li>package name: {TR_PKG_NAME}</li>
      <li>package version: {TR_PKG_VERSION}</li>
      <li>package version namespace: {TR_PKG_VERSION_NS}</li>
    </ul>
    <StatusComponent />

    <pre>
      {JSON.stringify(data, true, 2)}
    </pre>
  </div>;
};

createWebComponent(Device, `${capabilityName}-device`, TR_PKG_VERSION);
