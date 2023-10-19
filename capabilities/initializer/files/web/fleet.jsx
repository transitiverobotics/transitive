import React, { useState, useRef, useEffect } from 'react';

import { createWebComponent, useTransitive, getLogger, pathToTopic }
  from '@transitive-sdk/utils-web';

const log = getLogger('webrtc-video');
log.setLevel('debug');

const [scope, capabilityName] = TR_PKG_NAME.split('/');

const styles = {
};

const Fleet = ({jwt, id, host, ssl}) => {

  const { mqttSync, data, ready, StatusComponent } =
    useTransitive({ jwt, id, host, ssl,
      capability: TR_PKG_NAME,
      versionNS: TR_PKG_VERSION_NS
    });

  useEffect(() => {
      if (!mqttSync) return;
      const anyDevice =
        pathToTopic([id, '+', scope, capabilityName, TR_PKG_VERSION_NS]);
      mqttSync.subscribe(`${anyDevice}/device`);
    }, [mqttSync]);

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

createWebComponent(Fleet, `${capabilityName}-fleet`, ['jwt']);
